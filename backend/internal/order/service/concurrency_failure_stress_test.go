package service

import (
	"math/rand"
	"sync"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// deterministicTradingTime returns a weekday 11:00 AM IST during regular trading hours.
func deterministicTradingTime() time.Time {
	loc, _ := time.LoadLocation("Asia/Kolkata")
	return time.Date(2026, time.September, 23, 11, 0, 0, 0, loc)
}

func setupAttackUser(t *testing.T, db *gorm.DB, initialCash int64) (uuid.UUID, uuid.UUID) {
	userUUID := uuid.New()
	walletUUID := uuid.New()
	wallet := model.Wallet{
		UUID:             walletUUID,
		UserUUID:         userUUID,
		CashBalancePaise: initialCash,
		BlockedPaise:     0,
	}
	if err := db.Create(&wallet).Error; err != nil {
		t.Fatalf("setupAttackUser create wallet: %v", err)
	}
	return userUUID, walletUUID
}

func cleanupAttackUser(db *gorm.DB, userUUID, walletUUID uuid.UUID) {
	_ = db.Where("user_uuid = ?", userUUID).Delete(&model.Trade{}).Error
	_ = db.Where("user_uuid = ?", userUUID).Delete(&model.Order{}).Error
	_ = db.Where("user_uuid = ?", userUUID).Delete(&model.Position{}).Error
	_ = db.Where("wallet_uuid = ?", walletUUID).Delete(&model.WalletTransaction{}).Error
	_ = db.Where("user_uuid = ?", userUUID).Delete(&model.Wallet{}).Error
}

// 1. Attack: 20 simultaneous goroutines attempt to execute the exact same order.
// Guarantee: No double execution. Exactly 1 executes, 19 fail. Exactly 1 trade, 1 ledger entry.
func TestAttack_DuplicateExecution_NoDoubleExecution(t *testing.T) {
	db := getTestDB(t)

	// Ensure instrument exists
	var inst model.Instrument
	if err := db.Where("symbol = ?", "INFY").First(&inst).Error; err != nil {
		_ = db.Create(&model.Instrument{Symbol: "INFY", LotSize: 1, InstrumentType: "EQUITY"}).Error
	}

	userUUID, walletUUID := setupAttackUser(t, db, 500000) // ₹5,000 cash
	defer cleanupAttackUser(db, userUUID, walletUUID)

	orderUUID := uuid.New()
	order := model.Order{
		UUID:          orderUUID,
		UserUUID:      userUUID,
		Symbol:        "INFY",
		Side:          model.OrderSideBuy,
		Type:          model.OrderTypeLimit,
		Product:       model.OrderProductDelivery,
		Quantity:      2,
		PricePaise:    150000, // ₹1,500
		ReservedPaise: 300000, // ₹3,000 reserved
		Status:        model.OrderStatusOpen,
	}
	// Reserve ₹3,000 in wallet
	_ = db.Model(&model.Wallet{}).Where("uuid = ?", walletUUID).Update("blocked_paise", 300000).Error
	if err := db.Create(&order).Error; err != nil {
		t.Fatalf("create order: %v", err)
	}

	cfg := &config.Config{MISLeverage: 5, FuturesMarginPercent: 20, OptionSellMarginPercent: 30}
	orderSvc := New(nil, cfg)
	orderSvc.SetNowFunc(deterministicTradingTime)
	orderSvc.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{
			Symbol:     symbol,
			PricePaise: 150000,
			Source:     "synthetic_simulation",
			UpdatedAt:  time.Now().UTC().Format(time.RFC3339),
		}, nil
	})

	const concurrency = 20
	var wg sync.WaitGroup
	results := make([]error, concurrency)

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			results[idx] = orderSvc.Execute(userUUID.String(), orderUUID.String())
		}(i)
	}
	wg.Wait()

	successCount := 0
	failureCount := 0
	for _, res := range results {
		if res == nil {
			successCount++
		} else {
			failureCount++
		}
	}

	if successCount != 1 {
		t.Fatalf("CRITICAL SECURITY FAILURE: Expected exactly 1 execution success, got %d (failures: %d)", successCount, failureCount)
	}
	if failureCount != concurrency-1 {
		t.Fatalf("Expected %d failed executions, got %d", concurrency-1, failureCount)
	}

	// Verify database state: Exactly 1 trade
	var tradeCount int64
	_ = db.Model(&model.Trade{}).Where("order_uuid = ?", orderUUID).Count(&tradeCount)
	if tradeCount != 1 {
		t.Fatalf("Expected exactly 1 trade, got %d", tradeCount)
	}

	// Verify wallet: Cash decremented by 300,000 (500,000 - 300,000 = 200,000), blocked paise = 0
	var finalWallet model.Wallet
	_ = db.Where("uuid = ?", walletUUID).First(&finalWallet)
	if finalWallet.CashBalancePaise != 200000 {
		t.Fatalf("Expected final cash 200,000, got %d", finalWallet.CashBalancePaise)
	}
	if finalWallet.BlockedPaise != 0 {
		t.Fatalf("Expected final blocked 0, got %d", finalWallet.BlockedPaise)
	}

	// Verify position: Exactly 2 shares
	var pos model.Position
	_ = db.Where("user_uuid = ? AND symbol = ?", userUUID, "INFY").First(&pos)
	if pos.Quantity != 2 {
		t.Fatalf("Expected position quantity 2, got %d", pos.Quantity)
	}

	// Verify ledger: exactly 1 debit transaction for order execution
	var debitTxCount int64
	_ = db.Model(&model.WalletTransaction{}).Where("wallet_uuid = ? AND type = ?", walletUUID, model.WalletTransactionDebit).Count(&debitTxCount)
	if debitTxCount != 1 {
		t.Fatalf("Expected exactly 1 debit transaction, got %d", debitTxCount)
	}
}

// 2. Attack: Multiple simultaneous orders competing for limited wallet balance (double spending race).
// Guarantee: No negative wallet corruption. Cash >= 0, blocked <= cash.
func TestAttack_DoubleSpending_NoNegativeWalletCorruption(t *testing.T) {
	db := getTestDB(t)

	var inst model.Instrument
	if err := db.Where("symbol = ?", "TCS").First(&inst).Error; err != nil {
		_ = db.Create(&model.Instrument{Symbol: "TCS", LotSize: 1, InstrumentType: "EQUITY"}).Error
	}

	// User has exactly 10,000 paise (₹100)
	userUUID, walletUUID := setupAttackUser(t, db, 10000)
	defer cleanupAttackUser(db, userUUID, walletUUID)

	cfg := &config.Config{MISLeverage: 5, FuturesMarginPercent: 20, OptionSellMarginPercent: 30}
	orderSvc := New(nil, cfg)
	orderSvc.SetNowFunc(deterministicTradingTime)
	orderSvc.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{
			Symbol:     symbol,
			PricePaise: 6000, // Market is ₹60 per share
			Source:     "synthetic_simulation",
			UpdatedAt:  time.Now().UTC().Format(time.RFC3339),
		}, nil
	})

	// 10 concurrent limit buy orders, each requesting 1 share @ ₹57.00 (5,700 paise).
	// Limit price 5,700 is within 10% circuit band [5,400, 6,600] and below market 6,000 so orders stay open with funds reserved.
	// Total requested = 57,000 paise. User only has 10,000 paise!
	const orderCount = 10
	var wg sync.WaitGroup
	errs := make([]error, orderCount)

	for i := 0; i < orderCount; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			_, errs[idx] = orderSvc.Create(userUUID.String(), dto.CreateOrderRequest{
				Symbol:     "TCS",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductDelivery,
				Quantity:   1,
				PricePaise: 5700,
			})
		}(i)
	}
	wg.Wait()

	successCount := 0
	failureCount := 0
	for _, err := range errs {
		if err == nil {
			successCount++
		} else {
			failureCount++
		}
	}

	// Exactly 1 order can succeed (5,700 <= 10,000; next requires 5,700+5,700=11,400 > 10,000)
	if successCount != 1 {
		t.Fatalf("CRITICAL DOUBLE SPENDING BUG: Expected exactly 1 success, got %d (failures: %d, err0: %v)", successCount, failureCount, errs[0])
	}
	if failureCount != orderCount-1 {
		t.Fatalf("Expected %d failures, got %d", orderCount-1, failureCount)
	}

	var finalWallet model.Wallet
	_ = db.Where("uuid = ?", walletUUID).First(&finalWallet)
	if finalWallet.CashBalancePaise < 0 {
		t.Fatalf("CRITICAL CORRUPTION: Cash balance became negative: %d", finalWallet.CashBalancePaise)
	}
	if finalWallet.BlockedPaise > finalWallet.CashBalancePaise {
		t.Fatalf("CRITICAL CORRUPTION: Blocked paise (%d) exceeds cash balance (%d)", finalWallet.BlockedPaise, finalWallet.CashBalancePaise)
	}
	if finalWallet.BlockedPaise != 5700 {
		t.Fatalf("Expected blocked paise 5,700, got %d", finalWallet.BlockedPaise)
	}
	if finalWallet.AvailableBalancePaise() != 4300 {
		t.Fatalf("Expected available balance 4,300, got %d", finalWallet.AvailableBalancePaise())
	}
}

// 3. Attack: Multiple simultaneous sell orders competing for limited share holdings (double selling race).
// Guarantee: No phantom position. Free shares strictly reserved.
func TestAttack_DoubleSelling_NoPhantomPosition(t *testing.T) {
	db := getTestDB(t)

	var inst model.Instrument
	if err := db.Where("symbol = ?", "RELIANCE").First(&inst).Error; err != nil {
		_ = db.Create(&model.Instrument{Symbol: "RELIANCE", LotSize: 1, InstrumentType: "EQUITY"}).Error
	}

	userUUID, walletUUID := setupAttackUser(t, db, 1000000)
	defer cleanupAttackUser(db, userUUID, walletUUID)

	// User holds 50 shares of RELIANCE
	position := model.Position{
		UUID:              uuid.New(),
		UserUUID:          userUUID,
		Symbol:            "RELIANCE",
		Product:           model.OrderProductDelivery,
		Quantity:          50,
		AveragePricePaise: 250000,
		CostBasisPaise:    12500000,
	}
	if err := db.Create(&position).Error; err != nil {
		t.Fatalf("create position: %v", err)
	}

	cfg := &config.Config{MISLeverage: 5, FuturesMarginPercent: 20, OptionSellMarginPercent: 30}
	orderSvc := New(nil, cfg)
	orderSvc.SetNowFunc(deterministicTradingTime)
	orderSvc.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{
			Symbol:     symbol,
			PricePaise: 250000,
			Source:     "synthetic_simulation",
			UpdatedAt:  time.Now().UTC().Format(time.RFC3339),
		}, nil
	})

	// 10 concurrent goroutines attempt to submit SELL orders for 30 shares each (total 300 shares)
	const orderCount = 10
	var wg sync.WaitGroup
	errs := make([]error, orderCount)

	for i := 0; i < orderCount; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			_, errs[idx] = orderSvc.Create(userUUID.String(), dto.CreateOrderRequest{
				Symbol:     "RELIANCE",
				Side:       model.OrderSideSell,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductDelivery,
				Quantity:   30,
				PricePaise: 260000,
			})
		}(i)
	}
	wg.Wait()

	successCount := 0
	failureCount := 0
	for _, err := range errs {
		if err == nil {
			successCount++
		} else {
			failureCount++
		}
	}

	// Exactly 1 order can succeed (30 shares committed; next order requires 30+30=60 > 50)
	if successCount != 1 {
		t.Fatalf("CRITICAL DOUBLE SELLING BUG: Expected exactly 1 success, got %d (failures: %d)", successCount, failureCount)
	}
	if failureCount != orderCount-1 {
		t.Fatalf("Expected %d failures, got %d", orderCount-1, failureCount)
	}

	// Verify position remains 50 shares
	var finalPos model.Position
	_ = db.Where("user_uuid = ? AND symbol = ?", userUUID, "RELIANCE").First(&finalPos)
	if finalPos.Quantity != 50 {
		t.Fatalf("Expected position to remain 50 shares, got %d", finalPos.Quantity)
	}
}

// 4. Attack: Square-off races against execution of an existing order closing the position.
// Guarantee: No phantom position. Position strictly reaches 0 and never inverts or becomes phantom.
func TestAttack_SquareOffVsExecution_NoPhantomPosition(t *testing.T) {
	db := getTestDB(t)

	var inst model.Instrument
	if err := db.Where("symbol = ?", "TATAMOTORS").First(&inst).Error; err != nil {
		_ = db.Create(&model.Instrument{Symbol: "TATAMOTORS", LotSize: 1, InstrumentType: "EQUITY"}).Error
	}

	userUUID, walletUUID := setupAttackUser(t, db, 1000000)
	defer cleanupAttackUser(db, userUUID, walletUUID)

	// User holds MIS long position of 100 shares @ ₹900
	// 5x leverage: margin blocked = (100 * 90,000) / 5 = 1,800,000 (₹18,000)
	position := model.Position{
		UUID:               uuid.New(),
		UserUUID:           userUUID,
		Symbol:             "TATAMOTORS",
		Product:            model.OrderProductIntraday,
		Quantity:           100,
		AveragePricePaise:  90000,
		CostBasisPaise:     9000000,
		MarginBlockedPaise: 1800000,
	}
	_ = db.Model(&model.Wallet{}).Where("uuid = ?", walletUUID).Update("blocked_paise", 1800000).Error
	if err := db.Create(&position).Error; err != nil {
		t.Fatalf("create position: %v", err)
	}

	// An existing open order to sell the 100 shares
	closeOrderUUID := uuid.New()
	closeOrder := model.Order{
		UUID:       closeOrderUUID,
		UserUUID:   userUUID,
		Symbol:     "TATAMOTORS",
		Side:       model.OrderSideSell,
		Type:       model.OrderTypeMarket,
		Product:    model.OrderProductIntraday,
		Quantity:   100,
		Status:     model.OrderStatusPending,
		PricePaise: 0,
	}
	if err := db.Create(&closeOrder).Error; err != nil {
		t.Fatalf("create close order: %v", err)
	}

	cfg := &config.Config{MISLeverage: 5, FuturesMarginPercent: 20, OptionSellMarginPercent: 30}
	orderSvc := New(nil, cfg)
	orderSvc.SetNowFunc(deterministicTradingTime)
	orderSvc.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{
			Symbol:     symbol,
			PricePaise: 92000, // ₹920 (+₹20 gain per share)
			Source:     "synthetic_simulation",
			UpdatedAt:  time.Now().UTC().Format(time.RFC3339),
		}, nil
	})

	// Race: Execution of order vs TriggerManualMISSquareOff
	var wg sync.WaitGroup
	wg.Add(2)

	var execErr error
	var squareOffCount int
	var squareOffErr error

	go func() {
		defer wg.Done()
		execErr = orderSvc.Execute(userUUID.String(), closeOrderUUID.String())
	}()

	go func() {
		defer wg.Done()
		squareOffCount, squareOffErr = orderSvc.TriggerManualMISSquareOff(userUUID)
	}()

	wg.Wait()
	t.Logf("Race result: execErr=%v, squareOffCount=%d, squareOffErr=%v", execErr, squareOffCount, squareOffErr)

	// Verify final position quantity is strictly 0
	var finalPos model.Position
	_ = db.Where("user_uuid = ? AND symbol = ? AND product = ?", userUUID, "TATAMOTORS", model.OrderProductIntraday).First(&finalPos)
	if finalPos.Quantity != 0 {
		t.Fatalf("CRITICAL PHANTOM POSITION BUG: Expected position quantity 0, got %d", finalPos.Quantity)
	}

	// Verify blocked margin is strictly 0
	var finalWallet model.Wallet
	_ = db.Where("uuid = ?", walletUUID).First(&finalWallet)
	if finalWallet.BlockedPaise != 0 {
		t.Fatalf("CRITICAL MARGIN LEAK: Expected blocked paise 0, got %d", finalWallet.BlockedPaise)
	}
}

// 5. Attack: Wallet race stress test with 20 parallel workers performing random operations.
// Guarantee: No negative wallet corruption, No missing ledger transaction. Invariants hold 100%.
func TestAttack_WalletRace_LedgerAndBalanceIntegrity(t *testing.T) {
	db := getTestDB(t)

	userUUID, walletUUID := setupAttackUser(t, db, 1000000) // ₹10,000
	defer cleanupAttackUser(db, userUUID, walletUUID)

	const workers = 10
	const iterations = 10
	var wg sync.WaitGroup

	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(workerID)))

			for i := 0; i < iterations; i++ {
				op := rng.Intn(4)
				amount := int64((rng.Intn(50) + 1) * 1000) // ₹10 to ₹50

				switch op {
				case 0: // Reserve
					_ = db.Transaction(func(tx *gorm.DB) error {
						var w model.Wallet
						if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("uuid = ?", walletUUID).First(&w).Error; err != nil {
							return err
						}
						if w.AvailableBalancePaise() >= amount {
							w.BlockedPaise += amount
							if err := tx.Save(&w).Error; err != nil {
								return err
							}
							return tx.Create(&model.WalletTransaction{
								WalletUUID:   w.UUID,
								Type:         model.WalletTransactionReserve,
								AmountPaise:  amount,
								BalancePaise: w.CashBalancePaise,
								BlockedPaise: w.BlockedPaise,
								Note:         "Stress reserve",
							}).Error
						}
						return nil
					})

				case 1: // Release
					_ = db.Transaction(func(tx *gorm.DB) error {
						var w model.Wallet
						if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("uuid = ?", walletUUID).First(&w).Error; err != nil {
							return err
						}
						if w.BlockedPaise >= amount {
							w.BlockedPaise -= amount
							if err := tx.Save(&w).Error; err != nil {
								return err
							}
							return tx.Create(&model.WalletTransaction{
								WalletUUID:   w.UUID,
								Type:         model.WalletTransactionRelease,
								AmountPaise:  amount,
								BalancePaise: w.CashBalancePaise,
								BlockedPaise: w.BlockedPaise,
								Note:         "Stress release",
							}).Error
						}
						return nil
					})

				case 2: // Debit (execute buy)
					_ = db.Transaction(func(tx *gorm.DB) error {
						var w model.Wallet
						if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("uuid = ?", walletUUID).First(&w).Error; err != nil {
							return err
						}
						if w.AvailableBalancePaise() >= amount && w.CashBalancePaise >= amount {
							w.CashBalancePaise -= amount
							if err := tx.Save(&w).Error; err != nil {
								return err
							}
							return tx.Create(&model.WalletTransaction{
								WalletUUID:   w.UUID,
								Type:         model.WalletTransactionDebit,
								AmountPaise:  -amount,
								BalancePaise: w.CashBalancePaise,
								BlockedPaise: w.BlockedPaise,
								Note:         "Stress debit",
							}).Error
						}
						return nil
					})

				case 3: // Credit (sell/deposit)
					_ = db.Transaction(func(tx *gorm.DB) error {
						var w model.Wallet
						if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("uuid = ?", walletUUID).First(&w).Error; err != nil {
							return err
						}
						w.CashBalancePaise += amount
						if err := tx.Save(&w).Error; err != nil {
							return err
						}
						return tx.Create(&model.WalletTransaction{
							WalletUUID:   w.UUID,
							Type:         model.WalletTransactionCredit,
							AmountPaise:  amount,
							BalancePaise: w.CashBalancePaise,
							BlockedPaise: w.BlockedPaise,
							Note:         "Stress credit",
						}).Error
					})
				}
			}
		}(w)
	}
	wg.Wait()

	// Assert invariants:
	var finalWallet model.Wallet
	if err := db.Where("uuid = ?", walletUUID).First(&finalWallet).Error; err != nil {
		t.Fatalf("load wallet: %v", err)
	}

	if finalWallet.CashBalancePaise < 0 {
		t.Fatalf("CRITICAL INVARIANT VIOLATION: Cash balance is negative: %d", finalWallet.CashBalancePaise)
	}
	if finalWallet.BlockedPaise < 0 {
		t.Fatalf("CRITICAL INVARIANT VIOLATION: Blocked balance is negative: %d", finalWallet.BlockedPaise)
	}
	if finalWallet.BlockedPaise > finalWallet.CashBalancePaise {
		t.Fatalf("CRITICAL INVARIANT VIOLATION: Blocked balance (%d) exceeds cash balance (%d)", finalWallet.BlockedPaise, finalWallet.CashBalancePaise)
	}

	// Verify ledger integrity: sum of initial cash + all credits - debits strictly equals CashBalancePaise
	var txs []model.WalletTransaction
	_ = db.Where("wallet_uuid = ?", walletUUID).Order("created_at ASC, id ASC").Find(&txs)

	computedCash := int64(1000000)
	for _, tx := range txs {
		if tx.Type == model.WalletTransactionCredit || tx.Type == model.WalletTransactionDebit {
			computedCash += tx.AmountPaise
		}
	}
	if computedCash != finalWallet.CashBalancePaise {
		t.Fatalf("CRITICAL LEDGER DESYNC: Computed cash from ledger (%d) does not match wallet cash balance (%d)", computedCash, finalWallet.CashBalancePaise)
	}
}

// 6. Attack: Stale quote attack (> 120s old).
// Guarantee: No fake quote execution. Orders rejected immediately.
func TestAttack_StaleQuote_NoFakeQuoteExecution(t *testing.T) {
	staleTime := time.Now().Add(-3 * time.Minute) // 180 seconds old
	quote := &marketDTO.QuoteResponse{
		Symbol:     "RELIANCE",
		PricePaise: 250000,
		Source:     "angelone_live",
		UpdatedAt:  staleTime.UTC().Format(time.RFC3339),
	}

	err := marketService.ValidateExecutableQuoteWithFeedMode(quote, time.Now(), marketDTO.FeedModeLive, false)
	if err == nil {
		t.Fatal("CRITICAL SECURITY FLAW: Stale quote was accepted for trade execution!")
	}
	if err != marketService.ErrQuoteStale {
		t.Fatalf("Expected ErrQuoteStale, got: %v", err)
	}
}

// 7. Attack: Missing quote attack (symbol does not exist in market feed).
// Guarantee: No fake quote execution.
func TestAttack_MissingQuote_NoFakeQuoteExecution(t *testing.T) {
	err := marketService.ValidateExecutableQuoteWithFeedMode(nil, time.Now(), marketDTO.FeedModeLive, false)
	if err == nil {
		t.Fatal("CRITICAL SECURITY FLAW: Nil quote was accepted for execution!")
	}
}

// 8. Attack: Zero or negative price quote attack.
// Guarantee: No fake quote execution.
func TestAttack_CorruptQuote_ZeroOrNegativePrice(t *testing.T) {
	nowStr := time.Now().UTC().Format(time.RFC3339)

	zeroQuote := &marketDTO.QuoteResponse{Symbol: "TCS", PricePaise: 0, Source: "angelone_live", UpdatedAt: nowStr}
	if err := marketService.ValidateExecutableQuoteWithFeedMode(zeroQuote, time.Now(), marketDTO.FeedModeLive, false); err == nil {
		t.Fatal("CRITICAL SECURITY FLAW: Zero price quote was accepted for execution!")
	}

	negQuote := &marketDTO.QuoteResponse{Symbol: "TCS", PricePaise: -500, Source: "angelone_live", UpdatedAt: nowStr}
	if err := marketService.ValidateExecutableQuoteWithFeedMode(negQuote, time.Now(), marketDTO.FeedModeLive, false); err == nil {
		t.Fatal("CRITICAL SECURITY FLAW: Negative price quote was accepted for execution!")
	}
}

// 9. Attack: Market feed supervisor UNAVAILABLE mode.
// Guarantee: All quotes rejected in UNAVAILABLE mode.
func TestAttack_AngelOneDown_SupervisorUnavailable(t *testing.T) {
	nowStr := time.Now().UTC().Format(time.RFC3339)
	liveQuote := &marketDTO.QuoteResponse{Symbol: "INFY", PricePaise: 150000, Source: "angelone_live", UpdatedAt: nowStr}

	err := marketService.ValidateExecutableQuoteWithFeedMode(liveQuote, time.Now(), marketDTO.FeedModeUnavailable, false)
	if err == nil {
		t.Fatal("CRITICAL SECURITY FLAW: Quote accepted when feed is UNAVAILABLE!")
	}
}

// 10. Attack: Simulated Server Restart / Crash Recovery.
// Guarantee: Orders and reserved funds remain fully preserved across service restarts.
func TestAttack_ServerRestart_StatePreservation(t *testing.T) {
	db := getTestDB(t)

	var inst model.Instrument
	if err := db.Where("symbol = ?", "SBIN").First(&inst).Error; err != nil {
		_ = db.Create(&model.Instrument{Symbol: "SBIN", LotSize: 1, InstrumentType: "EQUITY"}).Error
	}

	userUUID, walletUUID := setupAttackUser(t, db, 100000) // ₹1,000 cash
	defer cleanupAttackUser(db, userUUID, walletUUID)

	cfg := &config.Config{MISLeverage: 5, FuturesMarginPercent: 20, OptionSellMarginPercent: 30}
	serverInstance1 := New(nil, cfg)
	serverInstance1.SetNowFunc(deterministicTradingTime)

	// User places open limit order with reserved funds: 1 share @ ₹800 (80,000 paise)
	orderResp, err := serverInstance1.Create(userUUID.String(), dto.CreateOrderRequest{
		Symbol:     "SBIN",
		Side:       model.OrderSideBuy,
		Type:       model.OrderTypeLimit,
		Product:    model.OrderProductDelivery,
		Quantity:   1,
		PricePaise: 80000,
	})
	if err != nil {
		t.Fatalf("create order: %v", err)
	}

	// Verify wallet blocked paise = 80,000 before crash
	var w1 model.Wallet
	_ = db.Where("uuid = ?", walletUUID).First(&w1)
	if w1.BlockedPaise != 80000 {
		t.Fatalf("expected blocked paise 80,000, got %d", w1.BlockedPaise)
	}

	// SIMULATE CRASH & RESTART:
	// Instance 1 is destroyed. New serverInstance2 boots up from database.
	serverInstance2 := New(nil, cfg)
	serverInstance2.SetNowFunc(deterministicTradingTime)
	if err := serverInstance2.RebuildActiveSymbolsFromDB(); err != nil {
		t.Fatalf("rebuild active symbols on restart: %v", err)
	}

	// Verify that SBIN is active in server 2
	if !serverInstance2.HasActiveOrders("SBIN") {
		t.Fatal("expected SBIN to be active in matching engine after server restart")
	}

	// Cancel the order on server 2: verify funds are safely unblocked
	if err := serverInstance2.Cancel(userUUID.String(), orderResp.UUID); err != nil {
		t.Fatalf("cancel order on server 2: %v", err)
	}

	var w2 model.Wallet
	_ = db.Where("uuid = ?", walletUUID).First(&w2)
	if w2.BlockedPaise != 0 {
		t.Fatalf("expected blocked paise 0 after cancellation on server 2, got %d", w2.BlockedPaise)
	}
	if w2.AvailableBalancePaise() != 100000 {
		t.Fatalf("expected available balance restored to 100,000, got %d", w2.AvailableBalancePaise())
	}
}

// 11. Attack: Position race with concurrent multi-order crossings (simultaneous buys and sells).
// Guarantee: No phantom position. Final quantity strictly equals sum of executed buy quantities minus sell quantities.
func TestAttack_PositionRace_CrossingConsistency(t *testing.T) {
	db := getTestDB(t)

	var inst model.Instrument
	if err := db.Where("symbol = ?", "BHARTIARTL").First(&inst).Error; err != nil {
		_ = db.Create(&model.Instrument{Symbol: "BHARTIARTL", LotSize: 1, InstrumentType: "EQUITY"}).Error
	}

	userUUID, walletUUID := setupAttackUser(t, db, 10000000) // ₹1,00,000 cash
	defer cleanupAttackUser(db, userUUID, walletUUID)

	cfg := &config.Config{MISLeverage: 5, FuturesMarginPercent: 20, OptionSellMarginPercent: 30}
	orderSvc := New(nil, cfg)
	orderSvc.SetNowFunc(deterministicTradingTime)
	orderSvc.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{
			Symbol:     symbol,
			PricePaise: 100000, // ₹1,000 per share
			Source:     "synthetic_simulation",
			UpdatedAt:  time.Now().UTC().Format(time.RFC3339),
		}, nil
	})

	// Pre-create 15 buy orders (10 shares each) and 10 sell orders (10 shares each)
	// Expected net position = (15 - 10) * 10 = +50 shares
	const buyCount = 15
	const sellCount = 10
	totalOrders := buyCount + sellCount

	type pendingOrderInfo struct {
		id   string
		side string
	}
	orders := make([]pendingOrderInfo, totalOrders)

	for i := 0; i < buyCount; i++ {
		o := model.Order{
			UUID:     uuid.New(),
			UserUUID: userUUID,
			Symbol:   "BHARTIARTL",
			Side:     model.OrderSideBuy,
			Type:     model.OrderTypeMarket,
			Product:  model.OrderProductIntraday,
			Quantity: 10,
			Status:   model.OrderStatusPending,
		}
		if err := db.Create(&o).Error; err != nil {
			t.Fatalf("create buy order: %v", err)
		}
		orders[i] = pendingOrderInfo{id: o.UUID.String(), side: model.OrderSideBuy}
	}
	for i := 0; i < sellCount; i++ {
		o := model.Order{
			UUID:     uuid.New(),
			UserUUID: userUUID,
			Symbol:   "BHARTIARTL",
			Side:     model.OrderSideSell,
			Type:     model.OrderTypeMarket,
			Product:  model.OrderProductIntraday,
			Quantity: 10,
			Status:   model.OrderStatusPending,
		}
		if err := db.Create(&o).Error; err != nil {
			t.Fatalf("create sell order: %v", err)
		}
		orders[buyCount+i] = pendingOrderInfo{id: o.UUID.String(), side: model.OrderSideSell}
	}

	// Concurrently execute all 25 orders
	var wg sync.WaitGroup
	execErrs := make([]error, totalOrders)
	for i := 0; i < totalOrders; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			execErrs[idx] = orderSvc.Execute(userUUID.String(), orders[idx].id)
		}(i)
	}
	wg.Wait()

	for i, err := range execErrs {
		if err != nil {
			t.Fatalf("order %d (%s) failed to execute: %v", i, orders[i].side, err)
		}
	}

	// Verify position strictly equals +50 shares
	var finalPos model.Position
	if err := db.Where("user_uuid = ? AND symbol = ? AND product = ?", userUUID, "BHARTIARTL", model.OrderProductIntraday).First(&finalPos).Error; err != nil {
		t.Fatalf("load position: %v", err)
	}

	expectedQty := int64((buyCount - sellCount) * 10)
	if finalPos.Quantity != expectedQty {
		t.Fatalf("CRITICAL POSITION RACE BUG: Expected position quantity %d, got %d", expectedQty, finalPos.Quantity)
	}

	// Verify trade count = 25
	var tradeCount int64
	_ = db.Model(&model.Trade{}).Where("user_uuid = ? AND symbol = ?", userUUID, "BHARTIARTL").Count(&tradeCount)
	if tradeCount != int64(totalOrders) {
		t.Fatalf("Expected %d trades, got %d", totalOrders, tradeCount)
	}
}

// 12. Attack: Redis Down scenario.
// Guarantee: Safe failure, no panic, no fake quotes.
func TestAttack_RedisDown_SafeFailureAndRecovery(t *testing.T) {
	marketSvc, err := marketService.New("redis://127.0.0.1:59999/0", 100*time.Millisecond)
	if err != nil {
		// Successfully caught broken connection on init
		return
	}
	quote, err := marketSvc.ExecutableQuote("RELIANCE")
	if err == nil {
		t.Fatalf("expected error when Redis is down, got quote: %v", quote)
	}
	if quote != nil {
		t.Fatal("expected nil quote when Redis is down")
	}
}
