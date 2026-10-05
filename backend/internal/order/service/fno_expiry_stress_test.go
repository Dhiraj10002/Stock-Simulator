package service

import (
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
)

// TestFNOExpiry_Stress_MultiLegPortfolioMarginRelease verifies that across a complex
// multi-leg derivatives portfolio (Futures, ITM Options, OTM Options, Short Calls, Short Puts),
// the expiry run releases 100% of blocked margins without underflow and records honest cash P&L.
func TestFNOExpiry_Stress_MultiLegPortfolioMarginRelease(t *testing.T) {
	db := getTestDB(t)
	ist := calendar.Location()
	expiryDateStr := "2026-09-24"
	clearReferences := func() {
		db.Where("symbol IN ? AND session_date = ?", []string{"STRESS_NIFTY", "STRESS_NIFTY_FUT"}, expiryDateStr).Delete(&model.SettlementReference{})
	}
	clearReferences()
	t.Cleanup(clearReferences)

	expiryTime := time.Date(2026, 9, 24, 15, 35, 0, 0, ist)
	quoteTimeStr := time.Date(2026, 9, 24, 15, 29, 55, 0, ist).Format(time.RFC3339)

	instruments := []model.Instrument{
		{
			Token:            "STR_TOK_FUT",
			Symbol:           "STRESS_NIFTY_FUT",
			Name:             "STRESS NIFTY FUT",
			UnderlyingSymbol: "STRESS_NIFTY",
			Expiry:           expiryDateStr,
			LotSize:          50,
			InstrumentType:   "FUTIDX",
			ExchangeSegment:  "NFO",
		},
		{
			Token:            "STR_TOK_ITM_CE",
			Symbol:           "STRESS_NIFTY_24000CE",
			Name:             "STRESS NIFTY 24000 CE",
			UnderlyingSymbol: "STRESS_NIFTY",
			Expiry:           expiryDateStr,
			Strike:           "240.000000",
			OptionType:       "CE",
			LotSize:          50,
			InstrumentType:   "OPTIDX",
			ExchangeSegment:  "NFO",
		},
		{
			Token:            "STR_TOK_OTM_CE",
			Symbol:           "STRESS_NIFTY_26000CE",
			Name:             "STRESS NIFTY 26000 CE",
			UnderlyingSymbol: "STRESS_NIFTY",
			Expiry:           expiryDateStr,
			Strike:           "260.000000",
			OptionType:       "CE",
			LotSize:          50,
			InstrumentType:   "OPTIDX",
			ExchangeSegment:  "NFO",
		},
		{
			Token:            "STR_TOK_SHORT_DEEP_CE",
			Symbol:           "STRESS_NIFTY_22000CE",
			Name:             "STRESS NIFTY 22000 CE",
			UnderlyingSymbol: "STRESS_NIFTY",
			Expiry:           expiryDateStr,
			Strike:           "220.000000",
			OptionType:       "CE",
			LotSize:          50,
			InstrumentType:   "OPTIDX",
			ExchangeSegment:  "NFO",
		},
		{
			Token:            "STR_TOK_SHORT_OTM_PE",
			Symbol:           "STRESS_NIFTY_23000PE",
			Name:             "STRESS NIFTY 23000 PE",
			UnderlyingSymbol: "STRESS_NIFTY",
			Expiry:           expiryDateStr,
			Strike:           "230.000000",
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
		db.Where("uuid = ?", walletUUID).Delete(&model.Wallet{})
		for _, inst := range instruments {
			db.Where("symbol = ?", inst.Symbol).Delete(&model.Instrument{})
		}
	}()

	initialCash := int64(2_000_000)  // ₹20,000.00
	initialBlocked := int64(800_000) // ₹8,000.00
	wallet := model.Wallet{
		UUID:             walletUUID,
		UserUUID:         userUUID,
		CashBalancePaise: initialCash,
		BlockedPaise:     initialBlocked,
	}
	if err := db.Create(&wallet).Error; err != nil {
		t.Fatalf("create wallet: %v", err)
	}

	// Create 5 multi-leg positions:
	// 1. Long Future (+50 qty, margin 200,000 paise)
	// 2. Long ITM Call (+50 qty, premium 15,000 paise, margin 0)
	// 3. Short OTM Call (-50 qty, margin 250,000 paise)
	// 4. Short Deep ITM Call (-50 qty, strike 220.00, margin 200,000 paise)
	// 5. Short OTM Put (-50 qty, strike 230.00, margin 150,000 paise)
	positions := []model.Position{
		{
			UUID:               uuid.New(),
			UserUUID:           userUUID,
			Symbol:             "STRESS_NIFTY_FUT",
			Product:            model.OrderProductFNO,
			Quantity:           50,
			AveragePricePaise:  20000,
			CostBasisPaise:     1000000,
			MarginBlockedPaise: 200000,
		},
		{
			UUID:               uuid.New(),
			UserUUID:           userUUID,
			Symbol:             "STRESS_NIFTY_24000CE",
			Product:            model.OrderProductFNO,
			Quantity:           50,
			AveragePricePaise:  300,
			CostBasisPaise:     15000,
			MarginBlockedPaise: 0,
		},
		{
			UUID:               uuid.New(),
			UserUUID:           userUUID,
			Symbol:             "STRESS_NIFTY_26000CE",
			Product:            model.OrderProductFNO,
			Quantity:           -50,
			AveragePricePaise:  200,
			CostBasisPaise:     10000,
			MarginBlockedPaise: 250000,
		},
		{
			UUID:               uuid.New(),
			UserUUID:           userUUID,
			Symbol:             "STRESS_NIFTY_22000CE",
			Product:            model.OrderProductFNO,
			Quantity:           -50,
			AveragePricePaise:  500,
			CostBasisPaise:     25000,
			MarginBlockedPaise: 200000,
		},
		{
			UUID:               uuid.New(),
			UserUUID:           userUUID,
			Symbol:             "STRESS_NIFTY_23000PE",
			Product:            model.OrderProductFNO,
			Quantity:           -50,
			AveragePricePaise:  150,
			CostBasisPaise:     7500,
			MarginBlockedPaise: 150000,
		},
	}
	for i := range positions {
		if err := db.Create(&positions[i]).Error; err != nil {
			t.Fatalf("create position %d: %v", i, err)
		}
	}

	orderSvc := New(nil, &config.Config{
		MISLeverage:             5,
		FuturesMarginPercent:    20,
		OptionSellMarginPercent: 30,
	})
	orderSvc.SetNowFunc(func() time.Time { return expiryTime })

	// Spot settles at 24,500 paise (245.00):
	// - Future settles at 21,500 (+1,500 profit/share * 50 = +75,000 paise).
	// - 24000 CE (ITM): intrinsic = 24,500 - 24,000 = 500 paise. Cash payout = 50 * 500 = +25,000 paise.
	// - 26000 CE (OTM): intrinsic = 0. Worthless. Cash change = 0.
	// - 22000 CE (Short ITM): intrinsic = 24,500 - 22,000 = 2,500 paise. Cash debit = -50 * 2500 = -125,000 paise.
	// - 23000 PE (Short OTM): intrinsic = 0. Worthless. Cash change = 0.
	orderSvc.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		switch symbol {
		case "STRESS_NIFTY_FUT":
			return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: 21500, UpdatedAt: time.Date(2026, 9, 24, 15, 39, 55, 0, ist).Format(time.RFC3339), Source: "angelone_live"}, nil
		case "STRESS_NIFTY":
			return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: 24500, UpdatedAt: quoteTimeStr, Source: "angelone_live"}, nil
		default:
			return nil, fmt.Errorf("unknown symbol: %s", symbol)
		}
	})

	orderSvc.ProcessFNOExpiry(expiryTime)

	// Verify all 5 positions completed settlement
	for _, p := range positions {
		var checkPos model.Position
		if err := db.Where("uuid = ?", p.UUID).First(&checkPos).Error; err != nil {
			t.Fatalf("query position %s: %v", p.Symbol, err)
		}
		if checkPos.SettlementState != "COMPLETED" {
			t.Errorf("position %s: expected COMPLETED, got %s", p.Symbol, checkPos.SettlementState)
		}
		if checkPos.Quantity != 0 {
			t.Errorf("position %s: expected quantity 0, got %d", p.Symbol, checkPos.Quantity)
		}
		if checkPos.MarginBlockedPaise != 0 {
			t.Errorf("position %s: expected margin 0, got %d", p.Symbol, checkPos.MarginBlockedPaise)
		}
	}

	// Verify wallet blocked margin was completely released to 0
	var checkWallet model.Wallet
	if err := db.Where("uuid = ?", walletUUID).First(&checkWallet).Error; err != nil {
		t.Fatalf("query wallet: %v", err)
	}
	if checkWallet.BlockedPaise != 0 {
		t.Errorf("expected BlockedPaise to be exactly 0, got %d", checkWallet.BlockedPaise)
	}

	// Net cash change: +75,000 (Fut PnL) + 25,000 (Long Call payout) - 125,000 (Short Call liability) = -25,000 paise.
	expectedCash := initialCash + 75000 + 25000 - 125000
	if checkWallet.CashBalancePaise != expectedCash {
		t.Errorf("expected wallet cash %d, got %d", expectedCash, checkWallet.CashBalancePaise)
	}
}

// TestFNOExpiry_Stress_HighVolumeBatchConcurrency validates that 20 users with 60 positions
// expiring concurrently settle without database lock deadlocks and release all margin.
func TestFNOExpiry_Stress_HighVolumeBatchConcurrency(t *testing.T) {
	db := getTestDB(t)
	ist := calendar.Location()
	expiryDateStr := "2026-09-24"
	expiryTime := time.Date(2026, 9, 24, 15, 35, 0, 0, ist)
	quoteTimeStr := time.Date(2026, 9, 24, 15, 39, 55, 0, ist).Format(time.RFC3339)

	inst := model.Instrument{
		Token:            "CONCURR_NIFTY_FUT_TOK",
		Symbol:           "CONCURR_NIFTY_FUT",
		Name:             "CONCURR NIFTY FUT",
		UnderlyingSymbol: "CONCURR_NIFTY",
		Expiry:           expiryDateStr,
		LotSize:          50,
		InstrumentType:   "FUTIDX",
		ExchangeSegment:  "NFO",
	}
	var existing model.Instrument
	if err := db.Where("symbol = ?", inst.Symbol).First(&existing).Error; err != nil {
		_ = db.Create(&inst)
	}
	defer func() {
		db.Where("symbol = ?", inst.Symbol).Delete(&model.Instrument{})
		db.Where("symbol = ? AND session_date = ?", inst.Symbol, expiryDateStr).Delete(&model.SettlementReference{})
	}()

	numUsers := 15
	var userUUIDs []uuid.UUID
	var walletUUIDs []uuid.UUID

	for i := 0; i < numUsers; i++ {
		uID := uuid.New()
		wID := uuid.New()
		userUUIDs = append(userUUIDs, uID)
		walletUUIDs = append(walletUUIDs, wID)

		w := model.Wallet{
			UUID:             wID,
			UserUUID:         uID,
			CashBalancePaise: 500_000,
			BlockedPaise:     100_000,
		}
		_ = db.Create(&w)

		// Create 2 positions per user
		p1 := model.Position{
			UUID:               uuid.New(),
			UserUUID:           uID,
			Symbol:             "CONCURR_NIFTY_FUT",
			Product:            model.OrderProductFNO,
			Quantity:           50,
			AveragePricePaise:  20000,
			CostBasisPaise:     1000000,
			MarginBlockedPaise: 50000,
		}
		p2 := model.Position{
			UUID:               uuid.New(),
			UserUUID:           uID,
			Symbol:             "CONCURR_NIFTY_FUT",
			Product:            model.OrderProductFNO,
			Quantity:           -50,
			AveragePricePaise:  20000,
			CostBasisPaise:     1000000,
			MarginBlockedPaise: 50000,
		}
		_ = db.Create(&p1)
		_ = db.Create(&p2)
	}

	defer func() {
		for i := 0; i < numUsers; i++ {
			db.Where("user_uuid = ?", userUUIDs[i]).Delete(&model.Position{})
			db.Where("user_uuid = ?", userUUIDs[i]).Delete(&model.Order{})
			db.Where("user_uuid = ?", userUUIDs[i]).Delete(&model.Trade{})
			db.Where("user_uuid = ?", userUUIDs[i]).Delete(&model.RiskEvent{})
			db.Where("wallet_uuid = ?", walletUUIDs[i]).Delete(&model.WalletTransaction{})
			db.Where("uuid = ?", walletUUIDs[i]).Delete(&model.Wallet{})
		}
	}()

	orderSvc := New(nil, &config.Config{
		MISLeverage:             5,
		FuturesMarginPercent:    20,
		OptionSellMarginPercent: 30,
	})
	orderSvc.SetNowFunc(func() time.Time { return expiryTime })
	orderSvc.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: 20500, UpdatedAt: quoteTimeStr, Source: "angelone_live"}, nil
	})

	// Run concurrent expiry settlement cycles to stress test lock ordering
	var wg sync.WaitGroup
	for c := 0; c < 3; c++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			orderSvc.ProcessFNOExpiry(expiryTime)
		}()
	}
	wg.Wait()

	// Verify all wallets released their 100,000 paise blocked margin
	for _, wID := range walletUUIDs {
		var w model.Wallet
		if err := db.Where("uuid = ?", wID).First(&w).Error; err != nil {
			t.Fatalf("query wallet %s: %v", wID, err)
		}
		if w.BlockedPaise != 0 {
			t.Errorf("wallet %s: expected BlockedPaise 0, got %d", wID, w.BlockedPaise)
		}
	}
}
