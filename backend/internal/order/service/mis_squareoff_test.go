package service

import (
	"errors"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
)

func TestMISSquareOff_LifecycleAndDeadlines(t *testing.T) {
	db := getTestDB(t)

	// Ensure RELIANCE instrument exists
	var inst model.Instrument
	if err := db.Where("symbol = ?", "RELIANCE").First(&inst).Error; err != nil {
		_ = db.Create(&model.Instrument{Symbol: "RELIANCE", LotSize: 1, InstrumentType: "EQUITY"}).Error
	}

	userUUID := uuid.New()
	walletUUID := uuid.New()
	defer func() {
		db.Where("user_uuid = ?", userUUID).Delete(&model.RiskEvent{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Trade{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Order{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Position{})
		db.Where("wallet_uuid = ?", walletUUID).Delete(&model.WalletTransaction{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Wallet{})
	}()

	wallet := model.Wallet{
		UUID:             walletUUID,
		UserUUID:         userUUID,
		CashBalancePaise: 1000000,
		BlockedPaise:     45000, // 20,000 for open order + 25,000 for open position
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

	ist := calendar.Location()
	wednesdayTradingDay := time.Date(2026, 9, 16, 0, 0, 0, 0, ist)

	// User has an open intraday user order reserving 20,000 paise
	openOrderUUID := uuid.New()
	openOrder := model.Order{
		UUID:          openOrderUUID,
		UserUUID:      userUUID,
		Symbol:        "RELIANCE",
		Side:          model.OrderSideBuy,
		Type:          model.OrderTypeLimit,
		Product:       model.OrderProductIntraday,
		Quantity:      10,
		PricePaise:    10000,
		ReservedPaise: 20000,
		Status:        model.OrderStatusOpen,
		Source:        model.OrderSourceUser,
	}
	if err := db.Create(&openOrder).Error; err != nil {
		t.Fatalf("create open order: %v", err)
	}

	// User has an open intraday position of 50 shares long
	posUUID := uuid.New()
	pos := model.Position{
		UUID:               posUUID,
		UserUUID:           userUUID,
		Symbol:             "RELIANCE",
		Product:            model.OrderProductIntraday,
		Quantity:           50,
		AveragePricePaise:  2500,
		CostBasisPaise:     125000,
		MarginBlockedPaise: 25000,
		CurrentPricePaise:  2500,
	}
	if err := db.Create(&pos).Error; err != nil {
		t.Fatalf("create position: %v", err)
	}

	mockPrice := int64(2600)
	quoteFail := false
	orderSvc.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		if quoteFail {
			return nil, errors.New("market quote is stale")
		}
		return &marketDTO.QuoteResponse{
			Symbol:     symbol,
			PricePaise: mockPrice,
			UpdatedAt:  time.Now().UTC().Format(time.RFC3339),
		}, nil
	})

	// -------------------------------------------------------------
	// 1. Weekend Check: Should NOT run square-off on Saturday
	// -------------------------------------------------------------
	saturdayTime := time.Date(2026, 9, 19, 15, 25, 0, 0, ist)
	orderSvc.SetNowFunc(func() time.Time { return saturdayTime })
	orderSvc.ProcessMISSquareOff(saturdayTime)

	var checkOrder model.Order
	if err := db.Where("uuid = ?", openOrderUUID).First(&checkOrder).Error; err != nil || checkOrder.Status != model.OrderStatusOpen {
		t.Fatalf("weekend check: open order should remain open on Saturday, status=%s", checkOrder.Status)
	}

	// -------------------------------------------------------------
	// 2. Before Cutoff Check: Should NOT run at 14:30 on trading day
	// -------------------------------------------------------------
	earlyTime := time.Date(wednesdayTradingDay.Year(), wednesdayTradingDay.Month(), wednesdayTradingDay.Day(), 14, 30, 0, 0, ist)
	orderSvc.SetNowFunc(func() time.Time { return earlyTime })
	orderSvc.ProcessMISSquareOff(earlyTime)

	if err := db.Where("uuid = ?", openOrderUUID).First(&checkOrder).Error; err != nil || checkOrder.Status != model.OrderStatusOpen {
		t.Fatalf("early check: open order should remain open at 14:30, status=%s", checkOrder.Status)
	}

	// -------------------------------------------------------------
	// 3. Stale Quote / Retry Pending at 15:22 IST:
	// - Open user orders cancelled
	// - Quote fails -> square-off order rejected, position square_off_state = PENDING
	// - Risk event recorded with status PENDING
	// -------------------------------------------------------------
	quoteFail = true
	cutoffTime := time.Date(wednesdayTradingDay.Year(), wednesdayTradingDay.Month(), wednesdayTradingDay.Day(), 15, 22, 0, 0, ist)
	orderSvc.SetNowFunc(func() time.Time { return cutoffTime })
	orderSvc.ProcessMISSquareOff(cutoffTime)

	// User order must be cancelled and blocked reservation released
	if err := db.Where("uuid = ?", openOrderUUID).First(&checkOrder).Error; err != nil || checkOrder.Status != model.OrderStatusCancelled {
		t.Fatalf("cutoff check: open order should be cancelled at 15:22, got status=%s", checkOrder.Status)
	}
	var checkWallet model.Wallet
	if err := db.Where("uuid = ?", walletUUID).First(&checkWallet).Error; err != nil || checkWallet.BlockedPaise != 25000 {
		t.Fatalf("cutoff check: blocked reservation should be released, position margin retained (25000), got %d", checkWallet.BlockedPaise)
	}

	// Position should be marked PENDING with pending risk event
	var checkPos model.Position
	if err := db.Where("uuid = ?", posUUID).First(&checkPos).Error; err != nil || checkPos.SquareOffState != "PENDING" {
		t.Fatalf("stale quote check: expected square_off_state PENDING, got %q", checkPos.SquareOffState)
	}
	var riskEvent model.RiskEvent
	if err := db.Where("user_uuid = ? AND symbol = ? AND event_type = ?", userUUID, "RELIANCE", "MIS_SQUARE_OFF").First(&riskEvent).Error; err != nil || riskEvent.Status != "PENDING" {
		t.Fatalf("stale quote check: expected risk event PENDING, got %q (err: %v)", riskEvent.Status, err)
	}

	// -------------------------------------------------------------
	// 4. Successful Square-Off Retry at 15:25 IST:
	// - Fresh quote becomes available
	// - Square-off executes -> position quantity becomes 0, square_off_state = COMPLETED
	// - Risk event resolves to RESOLVED
	// -------------------------------------------------------------
	quoteFail = false
	retryTime := time.Date(wednesdayTradingDay.Year(), wednesdayTradingDay.Month(), wednesdayTradingDay.Day(), 15, 25, 0, 0, ist)
	orderSvc.SetNowFunc(func() time.Time { return retryTime })
	orderSvc.ProcessMISSquareOff(retryTime)

	if err := db.Where("uuid = ?", posUUID).First(&checkPos).Error; err != nil {
		t.Fatalf("retry check: failed to load position: %v", err)
	}
	if checkPos.Quantity != 0 {
		t.Fatalf("retry check: expected position quantity 0 after square-off, got %d", checkPos.Quantity)
	}
	if checkPos.SquareOffState != "COMPLETED" {
		t.Fatalf("retry check: expected position square_off_state COMPLETED, got %q", checkPos.SquareOffState)
	}
	if err := db.Where("user_uuid = ? AND symbol = ? AND event_type = ?", userUUID, "RELIANCE", "MIS_SQUARE_OFF").First(&riskEvent).Error; err != nil || riskEvent.Status != "RESOLVED" {
		t.Fatalf("retry check: expected risk event RESOLVED, got %q", riskEvent.Status)
	}
	if err := db.Where("uuid = ?", walletUUID).First(&checkWallet).Error; err != nil || checkWallet.BlockedPaise != 0 {
		t.Fatalf("retry check: position margin should be released (0), got %d", checkWallet.BlockedPaise)
	}

	// -------------------------------------------------------------
	// 5. Deadline Failure Check at 15:30:01 IST:
	// - Create another intraday position that remains unexecuted
	// - At 15:30:01 IST, ProcessMISSquareOff marks it FAILED and creates FAILED RiskEvent
	// -------------------------------------------------------------
	posFailUUID := uuid.New()
	posFail := model.Position{
		UUID:              posFailUUID,
		UserUUID:          userUUID,
		Symbol:            "RELIANCE",
		Product:           model.OrderProductIntraday,
		Quantity:          -20, // short 20
		AveragePricePaise: 2500,
	}
	if err := db.Create(&posFail).Error; err != nil {
		t.Fatalf("create failing position: %v", err)
	}

	deadlineTime := time.Date(wednesdayTradingDay.Year(), wednesdayTradingDay.Month(), wednesdayTradingDay.Day(), 15, 30, 1, 0, ist)
	orderSvc.SetNowFunc(func() time.Time { return deadlineTime })
	orderSvc.ProcessMISSquareOff(deadlineTime)

	var failPos model.Position
	if err := db.Where("uuid = ?", posFailUUID).First(&failPos).Error; err != nil {
		t.Fatalf("deadline check: failed to query posFail: %v", err)
	}
	if failPos.SquareOffState != "FAILED" {
		t.Fatalf("deadline check: expected square_off_state FAILED, got %q", failPos.SquareOffState)
	}
	var failRiskEvent model.RiskEvent
	if err := db.Where("user_uuid = ? AND symbol = ? AND status = ?", userUUID, "RELIANCE", "FAILED").First(&failRiskEvent).Error; err != nil {
		t.Fatalf("deadline check: expected FAILED risk event, got err: %v", err)
	}

	// -------------------------------------------------------------
	// 6. Idempotency Check:
	// - Repeated invocations (e.g. backend restart / next tick) do not duplicate risk events
	// -------------------------------------------------------------
	orderSvc.ProcessMISSquareOff(deadlineTime)
	var count int64
	if err := db.Model(&model.RiskEvent{}).Where("user_uuid = ? AND symbol = ? AND status = ?", userUUID, "RELIANCE", "FAILED").Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("idempotency check: expected exactly 1 FAILED risk event, got %d (err: %v)", count, err)
	}
}
