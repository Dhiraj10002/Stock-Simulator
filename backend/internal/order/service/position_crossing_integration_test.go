package service

import (
	"os"
	"sync"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

var (
	testDBOnce sync.Once
	testDB     *gorm.DB
)

func getTestDB(t *testing.T) *gorm.DB {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is required for PostgreSQL integration tests")
	}
	testDBOnce.Do(func() {
		if err := database.Connect(&config.Config{DatabaseURL: databaseURL}); err != nil {
			t.Fatalf("connect test database: %v", err)
		}
		db := database.GetDB()
		if err := db.AutoMigrate(&model.Wallet{}, &model.WalletTransaction{}, &model.Position{}, &model.Order{}, &model.Trade{}, &model.Instrument{}); err != nil {
			t.Fatalf("migrate test database: %v", err)
		}
		testDB = db
	})
	if testDB == nil {
		t.Fatal("test database not initialized")
	}
	return testDB
}

func TestPositionCrossing_IntradayReversals(t *testing.T) {
	db := getTestDB(t)

	// Ensure RELIANCE instrument exists
	var inst model.Instrument
	if err := db.Where("symbol = ?", "RELIANCE").First(&inst).Error; err != nil {
		_ = db.Create(&model.Instrument{Symbol: "RELIANCE", LotSize: 1, InstrumentType: "EQUITY"}).Error
	}

	userUUID := uuid.New()
	walletUUID := uuid.New()
	defer func() {
		db.Where("user_uuid = ?", userUUID).Delete(&model.Trade{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Order{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Position{})
		db.Where("wallet_uuid = ?", walletUUID).Delete(&model.WalletTransaction{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Wallet{})
	}()

	// 1,000,000 paise initial balance (10,000 INR)
	wallet := model.Wallet{
		UUID:             walletUUID,
		UserUUID:         userUUID,
		CashBalancePaise: 1000000,
		BlockedPaise:     0,
	}
	if err := db.Create(&wallet).Error; err != nil {
		t.Fatalf("create wallet: %v", err)
	}

	cfg := &config.Config{
		MISLeverage:             5,
		FuturesMarginPercent:    20,
		OptionSellMarginPercent: 20,
	}
	orderSvc := New(nil, cfg)

	// Wednesday at 11:00 AM IST (regular market trading session)
	loc, _ := time.LoadLocation("Asia/Kolkata")
	orderSvc.SetNowFunc(func() time.Time {
		return time.Date(2026, 9, 16, 11, 0, 0, 0, loc)
	})

	currentMockPrice := int64(2500)
	orderSvc.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{
			Symbol:     symbol,
			PricePaise: currentMockPrice,
			Source:     "MOCK",
			UpdatedAt:  time.Now().UTC().Format(time.RFC3339),
		}, nil
	})

	// -------------------------------------------------------------
	// STEP 1: Open Long MIS Position (+100 shares @ 2,500 paise)
	// -------------------------------------------------------------
	createResp, err := orderSvc.Create(userUUID.String(), dto.CreateOrderRequest{
		Symbol:     "RELIANCE",
		Side:       model.OrderSideBuy,
		Type:       model.OrderTypeMarket,
		Product:    model.OrderProductIntraday,
		Quantity:   100,
		PricePaise: 0,
	})
	if err != nil {
		t.Fatalf("step 1 create order failed: %v", err)
	}
	if createResp.Status != model.OrderStatusExecuted {
		t.Fatalf("step 1 expected EXECUTED status, got %s", createResp.Status)
	}

	var pos model.Position
	if err := db.Where("user_uuid = ? AND symbol = ? AND product = ?", userUUID, "RELIANCE", model.OrderProductIntraday).First(&pos).Error; err != nil {
		t.Fatalf("load position after step 1: %v", err)
	}
	if pos.Quantity != 100 || pos.AveragePricePaise != 2500 || pos.MarginBlockedPaise != 50000 {
		t.Fatalf("step 1 unexpected position: qty=%d, avg=%d, margin=%d", pos.Quantity, pos.AveragePricePaise, pos.MarginBlockedPaise)
	}

	var w model.Wallet
	if err := db.Where("uuid = ?", walletUUID).First(&w).Error; err != nil {
		t.Fatalf("load wallet after step 1: %v", err)
	}
	if w.CashBalancePaise != 1000000 || w.BlockedPaise != 50000 {
		t.Fatalf("step 1 unexpected wallet: cash=%d, blocked=%d", w.CashBalancePaise, w.BlockedPaise)
	}

	// -------------------------------------------------------------
	// STEP 2: Position Crossing Long -> Short (+100 selling 150 @ 2,800 paise)
	// Closes 100 long with +30,000 paise realized P&L, opens 50 short @ 2,800
	// -------------------------------------------------------------
	currentMockPrice = 2800
	createResp2, err := orderSvc.Create(userUUID.String(), dto.CreateOrderRequest{
		Symbol:     "RELIANCE",
		Side:       model.OrderSideSell,
		Type:       model.OrderTypeMarket,
		Product:    model.OrderProductIntraday,
		Quantity:   150,
		PricePaise: 0,
	})
	if err != nil {
		t.Fatalf("step 2 crossing order failed: %v", err)
	}
	if createResp2.Status != model.OrderStatusExecuted {
		t.Fatalf("step 2 expected EXECUTED status, got %s", createResp2.Status)
	}

	if err := db.Where("user_uuid = ? AND symbol = ? AND product = ?", userUUID, "RELIANCE", model.OrderProductIntraday).First(&pos).Error; err != nil {
		t.Fatalf("load position after step 2: %v", err)
	}
	if pos.Quantity != -50 {
		t.Fatalf("step 2 expected position quantity -50, got %d", pos.Quantity)
	}
	if pos.AveragePricePaise != 2800 {
		t.Fatalf("step 2 expected position average price 2800 (execution price), got %d", pos.AveragePricePaise)
	}
	if pos.RealizedPnlPaise != 30000 {
		t.Fatalf("step 2 expected realized P&L 30000, got %d", pos.RealizedPnlPaise)
	}
	// New margin for 50 short @ 2800: (50 * 2800) / 5 = 28,000 paise
	if pos.MarginBlockedPaise != 28000 {
		t.Fatalf("step 2 expected margin blocked 28000, got %d", pos.MarginBlockedPaise)
	}

	if err := db.Where("uuid = ?", walletUUID).First(&w).Error; err != nil {
		t.Fatalf("load wallet after step 2: %v", err)
	}
	// Cash balance increased by realized profit (+30,000) -> 1,030,000
	if w.CashBalancePaise != 1030000 {
		t.Fatalf("step 2 expected cash balance 1030000, got %d", w.CashBalancePaise)
	}
	if w.BlockedPaise != 28000 {
		t.Fatalf("step 2 expected blocked paise 28000, got %d", w.BlockedPaise)
	}

	// -------------------------------------------------------------
	// STEP 3: Position Crossing Short -> Long (-50 buying 150 @ 2,600 paise)
	// Closes 50 short with +10,000 paise realized P&L, opens 100 long @ 2,600
	// -------------------------------------------------------------
	currentMockPrice = 2600
	createResp3, err := orderSvc.Create(userUUID.String(), dto.CreateOrderRequest{
		Symbol:     "RELIANCE",
		Side:       model.OrderSideBuy,
		Type:       model.OrderTypeMarket,
		Product:    model.OrderProductIntraday,
		Quantity:   150,
		PricePaise: 0,
	})
	if err != nil {
		t.Fatalf("step 3 crossing order failed: %v", err)
	}
	if createResp3.Status != model.OrderStatusExecuted {
		t.Fatalf("step 3 expected EXECUTED status, got %s", createResp3.Status)
	}

	if err := db.Where("user_uuid = ? AND symbol = ? AND product = ?", userUUID, "RELIANCE", model.OrderProductIntraday).First(&pos).Error; err != nil {
		t.Fatalf("load position after step 3: %v", err)
	}
	if pos.Quantity != 100 {
		t.Fatalf("step 3 expected position quantity +100, got %d", pos.Quantity)
	}
	if pos.AveragePricePaise != 2600 {
		t.Fatalf("step 3 expected position average price 2600 (execution price), got %d", pos.AveragePricePaise)
	}
	// Cumulative realized P&L: 30000 + (50 * (2800 - 2600)) = 30000 + 10000 = 40,000 paise
	if pos.RealizedPnlPaise != 40000 {
		t.Fatalf("step 3 expected realized P&L 40000, got %d", pos.RealizedPnlPaise)
	}
	// New margin for 100 long @ 2600: (100 * 2600) / 5 = 52,000 paise
	if pos.MarginBlockedPaise != 52000 {
		t.Fatalf("step 3 expected margin blocked 52000, got %d", pos.MarginBlockedPaise)
	}

	if err := db.Where("uuid = ?", walletUUID).First(&w).Error; err != nil {
		t.Fatalf("load wallet after step 3: %v", err)
	}
	// Cash balance increased by realized profit (+10,000) -> 1,040,000
	if w.CashBalancePaise != 1040000 {
		t.Fatalf("step 3 expected cash balance 1040000, got %d", w.CashBalancePaise)
	}
	if w.BlockedPaise != 52000 {
		t.Fatalf("step 3 expected blocked paise 52000, got %d", w.BlockedPaise)
	}

	// Verify all trades were properly recorded
	var tradeCount int64
	db.Model(&model.Trade{}).Where("user_uuid = ?", userUUID).Count(&tradeCount)
	if tradeCount != 3 {
		t.Fatalf("expected 3 executed trades, found %d", tradeCount)
	}
}

// TestConcurrency_CancelVsExecuteCompetition verifies that when a user cancellation
// and a market fill execution race simultaneously on the exact same order:
// 1. Row-level locks (Wallet -> Order) serialize the competition.
// 2. Exactly one operation wins and the other is safely rejected.
// 3. Margin is neither double-released nor orphaned.
// 4. The order reaches a clean, definitive terminal state (CANCELLED or EXECUTED).
func TestConcurrency_CancelVsExecuteCompetition(t *testing.T) {
	db := getTestDB(t)

	// Ensure RELIANCE instrument exists
	var inst model.Instrument
	if err := db.Where("symbol = ?", "RELIANCE").First(&inst).Error; err != nil {
		_ = db.Create(&model.Instrument{Symbol: "RELIANCE", LotSize: 1, InstrumentType: "EQUITY"}).Error
	}

	userUUID := uuid.New()
	walletUUID := uuid.New()
	orderUUID := uuid.New()
	defer func() {
		db.Where("user_uuid = ?", userUUID).Delete(&model.Trade{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Order{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Position{})
		db.Where("wallet_uuid = ?", walletUUID).Delete(&model.WalletTransaction{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Wallet{})
	}()

	// 100,000 cash, 25,000 blocked for the order
	wallet := model.Wallet{
		UUID:             walletUUID,
		UserUUID:         userUUID,
		CashBalancePaise: 100000,
		BlockedPaise:     25000,
	}
	if err := db.Create(&wallet).Error; err != nil {
		t.Fatalf("create wallet: %v", err)
	}

	// Open LIMIT buy order: 10 shares @ 2,500 = 25,000 reserved
	order := model.Order{
		UUID:          orderUUID,
		UserUUID:      userUUID,
		Symbol:        "RELIANCE",
		Side:          model.OrderSideBuy,
		Type:          model.OrderTypeLimit,
		Product:       model.OrderProductDelivery,
		Quantity:      10,
		PricePaise:    2500,
		ReservedPaise: 25000,
		Status:        model.OrderStatusOpen,
	}
	if err := db.Create(&order).Error; err != nil {
		t.Fatalf("create order: %v", err)
	}

	cfg := &config.Config{
		MISLeverage:             5,
		FuturesMarginPercent:    20,
		OptionSellMarginPercent: 20,
	}
	orderSvc := New(nil, cfg)
	orderSvc.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{
			Symbol:     symbol,
			PricePaise: 2500, // exact limit match
			Source:     "MOCK",
			UpdatedAt:  time.Now().UTC().Format(time.RFC3339),
		}, nil
	})

	var wg sync.WaitGroup
	var cancelErr, execErr error

	wg.Add(2)
	go func() {
		defer wg.Done()
		cancelErr = orderSvc.Cancel(userUUID.String(), orderUUID.String())
	}()
	go func() {
		defer wg.Done()
		execErr = orderSvc.Execute(userUUID.String(), orderUUID.String())
	}()
	wg.Wait()

	// Exactly one must succeed and one must fail
	successCount := 0
	if cancelErr == nil {
		successCount++
	}
	if execErr == nil {
		successCount++
	}
	if successCount != 1 {
		t.Fatalf("expected exactly 1 winner between cancel and execute, got %d (cancelErr: %v, execErr: %v)", successCount, cancelErr, execErr)
	}

	// Verify database state integrity
	var finalOrder model.Order
	if err := db.Where("uuid = ?", orderUUID).First(&finalOrder).Error; err != nil {
		t.Fatalf("load order: %v", err)
	}

	var finalWallet model.Wallet
	if err := db.Where("uuid = ?", walletUUID).First(&finalWallet).Error; err != nil {
		t.Fatalf("load wallet: %v", err)
	}

	// Margin must ALWAYS be cleanly released (0 blocked) regardless of who won
	if finalWallet.BlockedPaise != 0 {
		t.Fatalf("expected blocked paise to be 0, got %d", finalWallet.BlockedPaise)
	}

	if finalOrder.Status == model.OrderStatusCancelled {
		// Cancel won: cash unchanged at 100,000, position 0
		if finalWallet.CashBalancePaise != 100000 {
			t.Fatalf("cancel won: expected cash 100,000, got %d", finalWallet.CashBalancePaise)
		}
		var posCount int64
		db.Model(&model.Position{}).Where("user_uuid = ? AND symbol = ?", userUUID, "RELIANCE").Count(&posCount)
		if posCount != 0 {
			t.Fatalf("cancel won: expected 0 positions, found %d", posCount)
		}
	} else if finalOrder.Status == model.OrderStatusExecuted {
		// Execute won: cash decreased by 25,000 -> 75,000, position holds 10 shares
		if finalWallet.CashBalancePaise != 75000 {
			t.Fatalf("execute won: expected cash 75,000, got %d", finalWallet.CashBalancePaise)
		}
		var pos model.Position
		if err := db.Where("user_uuid = ? AND symbol = ?", userUUID, "RELIANCE").First(&pos).Error; err != nil {
			t.Fatalf("execute won: load position: %v", err)
		}
		if pos.Quantity != 10 {
			t.Fatalf("execute won: expected quantity 10, got %d", pos.Quantity)
		}
	} else {
		t.Fatalf("unexpected terminal order status: %s", finalOrder.Status)
	}
}
