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

func TestFNOExpiry_ExpiryDetectionTiming(t *testing.T) {
	ist := calendar.Location()
	expiryStr := "2026-09-24" // Thursday

	// 1. On expiry day at 10:00 IST -> Not expired yet (market is actively trading)
	activeTradingTime := time.Date(2026, 9, 24, 10, 0, 0, 0, ist)
	if isExpired(expiryStr, activeTradingTime) {
		t.Fatalf("isExpired should be false on expiry day morning (10:00 IST)")
	}

	// 2. On expiry day at 15:29:59 IST -> Not expired yet
	preCloseTime := time.Date(2026, 9, 24, 15, 29, 59, 0, ist)
	if isExpired(expiryStr, preCloseTime) {
		t.Fatalf("isExpired should be false before 15:30 IST market close")
	}

	// 3. On expiry day at exactly 15:30:00 IST -> Expired
	closeTime := time.Date(2026, 9, 24, 15, 30, 0, 0, ist)
	if !isExpired(expiryStr, closeTime) {
		t.Fatalf("isExpired should be true at 15:30:00 IST on expiry day")
	}

	// 4. On expiry day evening at 18:00 IST -> Expired
	eveningTime := time.Date(2026, 9, 24, 18, 0, 0, 0, ist)
	if !isExpired(expiryStr, eveningTime) {
		t.Fatalf("isExpired should be true after market close on expiry day")
	}

	// 5. Next day Friday morning -> Expired
	nextDayTime := time.Date(2026, 9, 25, 9, 15, 0, 0, ist)
	if !isExpired(expiryStr, nextDayTime) {
		t.Fatalf("isExpired should be true on days after expiry")
	}
}

func TestFNOExpiry_EndToEndSettlement(t *testing.T) {
	db := getTestDB(t)

	ist := calendar.Location()
	expiryDateStr := "2026-09-24"
	expiryTime := time.Date(2026, 9, 24, 15, 35, 0, 0, ist)
	quoteTimeStr := time.Date(2026, 9, 24, 15, 29, 55, 0, ist).Format(time.RFC3339)

	// Instruments setup
	instruments := []model.Instrument{
		{
			Token:            "TEST_TOK_FUT",
			Symbol:           "NIFTY24SEP26FUT",
			Name:             "NIFTY 24SEP26 FUT",
			UnderlyingSymbol: "NIFTY",
			Expiry:           expiryDateStr,
			LotSize:          50,
			InstrumentType:   "FUTIDX",
			ExchangeSegment:  "NFO",
		},
		{
			Token:            "TEST_TOK_ITM_CE",
			Symbol:           "NIFTY24SEP2624000CE",
			Name:             "NIFTY 24SEP26 24000 CE",
			UnderlyingSymbol: "NIFTY",
			Expiry:           expiryDateStr,
			Strike:           "240.000000",
			OptionType:       "CE",
			LotSize:          50,
			InstrumentType:   "OPTIDX",
			ExchangeSegment:  "NFO",
		},
		{
			Token:            "TEST_TOK_OTM_CE",
			Symbol:           "NIFTY24SEP2626000CE",
			Name:             "NIFTY 24SEP26 26000 CE",
			UnderlyingSymbol: "NIFTY",
			Expiry:           expiryDateStr,
			Strike:           "260.000000",
			OptionType:       "CE",
			LotSize:          50,
			InstrumentType:   "OPTIDX",
			ExchangeSegment:  "NFO",
		},
		{
			Token:            "TEST_TOK_OTM_PE",
			Symbol:           "NIFTY24SEP2624000PE",
			Name:             "NIFTY 24SEP26 24000 PE",
			UnderlyingSymbol: "NIFTY",
			Expiry:           expiryDateStr,
			Strike:           "240.000000",
			OptionType:       "PE",
			LotSize:          50,
			InstrumentType:   "OPTIDX",
			ExchangeSegment:  "NFO",
		},
	}

	for _, inst := range instruments {
		var existing model.Instrument
		if err := db.Where("symbol = ?", inst.Symbol).First(&existing).Error; err != nil {
			if err := db.Create(&inst).Error; err != nil {
				t.Fatalf("create instrument %s: %v", inst.Symbol, err)
			}
		}
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
		for _, inst := range instruments {
			db.Where("symbol = ?", inst.Symbol).Delete(&model.Instrument{})
		}
	}()

	initialCash := int64(1000000)  // Rs 10,000
	initialBlocked := int64(50000) // 20,000 (Fut) + 30,000 (Short Put)
	wallet := model.Wallet{
		UUID:             walletUUID,
		UserUUID:         userUUID,
		CashBalancePaise: initialCash,
		BlockedPaise:     initialBlocked,
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
	orderSvc.SetNowFunc(func() time.Time { return expiryTime })

	// Position 1: Long Future: 50 qty @ 20,000 paise (cost basis: 1,000,000 paise, margin: 20,000 paise)
	futPosUUID := uuid.New()
	futPos := model.Position{
		UUID:               futPosUUID,
		UserUUID:           userUUID,
		Symbol:             "NIFTY24SEP26FUT",
		Product:            model.OrderProductFNO,
		InstrumentType:     "FUTIDX",
		UnderlyingSymbol:   "NIFTY",
		Quantity:           50,
		AveragePricePaise:  20000,
		CostBasisPaise:     1000000,
		MarginBlockedPaise: 20000,
		CurrentPricePaise:  20000,
	}
	if err := db.Create(&futPos).Error; err != nil {
		t.Fatalf("create fut position: %v", err)
	}

	// Position 2: Long ITM Call: 50 qty 24000 CE @ 200 paise (cost basis: 10,000 paise, margin: 0)
	itmPosUUID := uuid.New()
	itmPos := model.Position{
		UUID:               itmPosUUID,
		UserUUID:           userUUID,
		Symbol:             "NIFTY24SEP2624000CE",
		Product:            model.OrderProductFNO,
		InstrumentType:     "OPTIDX",
		UnderlyingSymbol:   "NIFTY",
		Quantity:           50,
		AveragePricePaise:  200,
		CostBasisPaise:     10000,
		MarginBlockedPaise: 0,
		CurrentPricePaise:  200,
	}
	if err := db.Create(&itmPos).Error; err != nil {
		t.Fatalf("create itm position: %v", err)
	}

	// Position 3: Long OTM Call: 50 qty 26000 CE @ 100 paise (cost basis: 5,000 paise, margin: 0)
	otmPosUUID := uuid.New()
	otmPos := model.Position{
		UUID:               otmPosUUID,
		UserUUID:           userUUID,
		Symbol:             "NIFTY24SEP2626000CE",
		Product:            model.OrderProductFNO,
		InstrumentType:     "OPTIDX",
		UnderlyingSymbol:   "NIFTY",
		Quantity:           50,
		AveragePricePaise:  100,
		CostBasisPaise:     5000,
		MarginBlockedPaise: 0,
		CurrentPricePaise:  100,
	}
	if err := db.Create(&otmPos).Error; err != nil {
		t.Fatalf("create otm position: %v", err)
	}

	// Position 4: Short OTM Put: -50 qty 24000 PE @ 150 paise (margin: 30,000 paise)
	shortPutPosUUID := uuid.New()
	shortPutPos := model.Position{
		UUID:               shortPutPosUUID,
		UserUUID:           userUUID,
		Symbol:             "NIFTY24SEP2624000PE",
		Product:            model.OrderProductFNO,
		InstrumentType:     "OPTIDX",
		UnderlyingSymbol:   "NIFTY",
		Quantity:           -50,
		AveragePricePaise:  150,
		CostBasisPaise:     7500,
		MarginBlockedPaise: 30000,
		CurrentPricePaise:  150,
	}
	if err := db.Create(&shortPutPos).Error; err != nil {
		t.Fatalf("create short put position: %v", err)
	}

	// -------------------------------------------------------------
	// Phase 1: Missing / Stale Quotes Handling
	// Quote returns error -> position set to PENDING, RiskEvent recorded as PENDING
	// -------------------------------------------------------------
	orderSvc.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		return nil, errors.New("market quote is unavailable")
	})

	orderSvc.ProcessFNOExpiry(expiryTime)

	var checkFutPos model.Position
	if err := db.Where("uuid = ?", futPosUUID).First(&checkFutPos).Error; err != nil || checkFutPos.SettlementState != "PENDING" {
		t.Fatalf("phase 1: expected settlement_state PENDING on missing quote, got %q (err: %v)", checkFutPos.SettlementState, err)
	}
	var riskEvent model.RiskEvent
	if err := db.Where("user_uuid = ? AND symbol = ? AND event_type = ?", userUUID, "NIFTY24SEP26FUT", "FNO_EXPIRY_SETTLEMENT").First(&riskEvent).Error; err != nil || riskEvent.Status != "PENDING" {
		t.Fatalf("phase 1: expected PENDING risk event, got %q (err: %v)", riskEvent.Status, err)
	}

	var checkWallet model.Wallet
	if err := db.Where("uuid = ?", walletUUID).First(&checkWallet).Error; err != nil || checkWallet.CashBalancePaise != initialCash || checkWallet.BlockedPaise != initialBlocked {
		t.Fatalf("phase 1: wallet must remain unchanged during failed settlement attempt")
	}

	// -------------------------------------------------------------
	// Phase 2: Successful Settlement of all F&O Positions
	// Quotes become available:
	// - NIFTY24SEP26FUT settles at 21,000 paise (+1,000 profit/unit = +50,000 paise)
	// - NIFTY spot settles at 24,500 paise:
	//   - 24000 CE (ITM): intrinsic = 24,500 - 24,000 = 500 paise. Cash payout = 50 * 500 = +25,000 paise.
	//   - 26000 CE (OTM): intrinsic = 0 (worthless). Cash payout = 0.
	//   - 24000 PE (OTM): intrinsic = 0 (worthless). Cash payout = 0. Margin (30,000 paise) released.
	// -------------------------------------------------------------
	orderSvc.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		switch symbol {
		case "NIFTY24SEP26FUT":
			return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: 21000, UpdatedAt: quoteTimeStr}, nil
		case "NIFTY":
			return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: 24500, UpdatedAt: quoteTimeStr}, nil
		default:
			return nil, errors.New("unexpected symbol")
		}
	})

	orderSvc.ProcessFNOExpiry(expiryTime)

	// Check Future Position
	if err := db.Where("uuid = ?", futPosUUID).First(&checkFutPos).Error; err != nil {
		t.Fatalf("phase 2 query fut: %v", err)
	}
	if checkFutPos.Quantity != 0 || checkFutPos.SettlementState != "COMPLETED" || checkFutPos.RealizedPnlPaise != 50000 || checkFutPos.MarginBlockedPaise != 0 {
		t.Fatalf("phase 2: fut position incorrect: qty=%d state=%s pnl=%d margin=%d",
			checkFutPos.Quantity, checkFutPos.SettlementState, checkFutPos.RealizedPnlPaise, checkFutPos.MarginBlockedPaise)
	}

	// Check ITM Option Position
	var checkItmPos model.Position
	if err := db.Where("uuid = ?", itmPosUUID).First(&checkItmPos).Error; err != nil {
		t.Fatalf("phase 2 query itm: %v", err)
	}
	// Realized PnL: Intrinsic payout 25,000 - cost basis 10,000 = +15,000 paise
	if checkItmPos.Quantity != 0 || checkItmPos.SettlementState != "COMPLETED" || checkItmPos.RealizedPnlPaise != 15000 {
		t.Fatalf("phase 2: itm option incorrect: qty=%d state=%s pnl=%d",
			checkItmPos.Quantity, checkItmPos.SettlementState, checkItmPos.RealizedPnlPaise)
	}

	// Check OTM Option Position
	var checkOtmPos model.Position
	if err := db.Where("uuid = ?", otmPosUUID).First(&checkOtmPos).Error; err != nil {
		t.Fatalf("phase 2 query otm: %v", err)
	}
	// Realized PnL: 0 - 5,000 = -5,000 paise (full loss of premium)
	if checkOtmPos.Quantity != 0 || checkOtmPos.SettlementState != "COMPLETED" || checkOtmPos.RealizedPnlPaise != -5000 {
		t.Fatalf("phase 2: otm option incorrect: qty=%d state=%s pnl=%d",
			checkOtmPos.Quantity, checkOtmPos.SettlementState, checkOtmPos.RealizedPnlPaise)
	}

	// Check Short Put Position
	var checkShortPutPos model.Position
	if err := db.Where("uuid = ?", shortPutPosUUID).First(&checkShortPutPos).Error; err != nil {
		t.Fatalf("phase 2 query short put: %v", err)
	}
	// Expired worthless: seller keeps premium (entryValue = 7500), margin released
	if checkShortPutPos.Quantity != 0 || checkShortPutPos.SettlementState != "COMPLETED" || checkShortPutPos.RealizedPnlPaise != 7500 || checkShortPutPos.MarginBlockedPaise != 0 {
		t.Fatalf("phase 2: short put incorrect: qty=%d state=%s pnl=%d margin=%d",
			checkShortPutPos.Quantity, checkShortPutPos.SettlementState, checkShortPutPos.RealizedPnlPaise, checkShortPutPos.MarginBlockedPaise)
	}

	// RiskEvent should have transitioned to RESOLVED
	if err := db.Where("user_uuid = ? AND symbol = ? AND event_type = ?", userUUID, "NIFTY24SEP26FUT", "FNO_EXPIRY_SETTLEMENT").First(&riskEvent).Error; err != nil || riskEvent.Status != "RESOLVED" {
		t.Fatalf("phase 2: risk event expected RESOLVED, got %q (err: %v)", riskEvent.Status, err)
	}

	// Check Wallet Accounting:
	// Cash change:
	// +50,000 (Fut P&L) + 25,000 (ITM Call payout) + 0 (OTM Call) + 0 (Short Put payout) = +75,000 paise.
	// Initial cash: 1,000,000 -> Expected cash: 1,075,000 paise.
	// Blocked margin released: 20,000 (Fut) + 30,000 (Short Put) = 50,000 released -> Expected blocked: 0 paise.
	if err := db.Where("uuid = ?", walletUUID).First(&checkWallet).Error; err != nil {
		t.Fatalf("phase 2 query wallet: %v", err)
	}
	expectedCash := initialCash + 50000 + 25000
	if checkWallet.CashBalancePaise != expectedCash {
		t.Fatalf("phase 2: expected wallet cash %d, got %d", expectedCash, checkWallet.CashBalancePaise)
	}
	if checkWallet.BlockedPaise != 0 {
		t.Fatalf("phase 2: expected 0 blocked margin, got %d", checkWallet.BlockedPaise)
	}

	// Check WalletTransactions created
	var txns []model.WalletTransaction
	if err := db.Where("wallet_uuid = ?", walletUUID).Find(&txns).Error; err != nil || len(txns) != 2 {
		t.Fatalf("phase 2: expected 2 wallet transactions (fut profit + itm payout), got %d (err: %v)", len(txns), err)
	}

	// -------------------------------------------------------------
	// Phase 3: Idempotency Across Server Restarts / Repeated Cycles
	// Calling ProcessFNOExpiry again must do NOTHING:
	// - Wallet cash and blocked margin remain exactly the same
	// - No new wallet transactions or orders created
	// -------------------------------------------------------------
	orderSvc.ProcessFNOExpiry(expiryTime)

	var checkWalletAfter model.Wallet
	if err := db.Where("uuid = ?", walletUUID).First(&checkWalletAfter).Error; err != nil {
		t.Fatalf("phase 3 query wallet: %v", err)
	}
	if checkWalletAfter.CashBalancePaise != expectedCash || checkWalletAfter.BlockedPaise != 0 {
		t.Fatalf("phase 3: idempotency violated, wallet modified: cash=%d, blocked=%d",
			checkWalletAfter.CashBalancePaise, checkWalletAfter.BlockedPaise)
	}

	var txnsAfter []model.WalletTransaction
	if err := db.Where("wallet_uuid = ?", walletUUID).Find(&txnsAfter).Error; err != nil || len(txnsAfter) != 2 {
		t.Fatalf("phase 3: idempotency violated, duplicate wallet transactions created: got %d", len(txnsAfter))
	}
}
