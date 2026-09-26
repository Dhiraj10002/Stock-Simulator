package service

import (
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
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
		if err := db.AutoMigrate(&model.Wallet{}, &model.WalletTransaction{}, &model.Position{}, &model.Order{}, &model.Trade{}); err != nil {
			t.Fatalf("migrate test database: %v", err)
		}
		testDB = db
	})
	if testDB == nil {
		t.Fatal("test database not initialized")
	}
	return testDB
}

func TestPortfolioService_DisplayDecouplingFromExecutableFreshness(t *testing.T) {
	db := getTestDB(t)

	userUUID := uuid.New()
	defer func() {
		db.Where("user_uuid = ?", userUUID).Delete(&model.Trade{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Position{})
	}()

	// User holds 100 shares of RELIANCE (avg: 2,500 paise, cost: 250,000 paise)
	// and 50 shares of TCS (avg: 3,500 paise, cost: 175,000 paise)
	p1 := model.Position{
		UUID:              uuid.New(),
		UserUUID:          userUUID,
		Symbol:            "RELIANCE",
		Product:           model.OrderProductDelivery,
		Quantity:          100,
		AveragePricePaise: 2500,
		CostBasisPaise:    250000,
		CurrentPricePaise: 2500,
	}
	p2 := model.Position{
		UUID:              uuid.New(),
		UserUUID:          userUUID,
		Symbol:            "TCS",
		Product:           model.OrderProductDelivery,
		Quantity:          50,
		AveragePricePaise: 3500,
		CostBasisPaise:    175000,
		CurrentPricePaise: 3500,
	}
	if err := db.Create(&p1).Error; err != nil {
		t.Fatalf("create p1: %v", err)
	}
	if err := db.Create(&p2).Error; err != nil {
		t.Fatalf("create p2: %v", err)
	}

	// Add a realized trade from yesterday and one from today to test P&L buckets
	loc, _ := time.LoadLocation("Asia/Kolkata")
	today := time.Date(2026, 9, 16, 12, 0, 0, 0, loc)
	yesterday := today.Add(-24 * time.Hour)

	tradePast := model.Trade{
		UUID:             uuid.New(),
		OrderUUID:        uuid.New(),
		UserUUID:         userUUID,
		Symbol:           "INFY",
		Side:             model.OrderSideSell,
		Quantity:         10,
		PricePaise:       1500,
		TotalPaise:       15000,
		RealizedPnlPaise: 5000,
		ExecutedAt:       yesterday,
	}
	tradeToday := model.Trade{
		UUID:             uuid.New(),
		OrderUUID:        uuid.New(),
		UserUUID:         userUUID,
		Symbol:           "HDFCBANK",
		Side:             model.OrderSideSell,
		Quantity:         10,
		PricePaise:       1600,
		TotalPaise:       16000,
		RealizedPnlPaise: 8000,
		ExecutedAt:       today,
	}
	if err := db.Create(&tradePast).Error; err != nil {
		t.Fatalf("create past trade: %v", err)
	}
	if err := db.Create(&tradeToday).Error; err != nil {
		t.Fatalf("create today trade: %v", err)
	}

	svc := New(nil)
	svc.SetNowFunc(func() time.Time { return today })

	// Case 1: Weekend / After-hours quote — 3 days old (CurrentQuote accepts, ExecutableQuote would reject)
	svc.SetCurrentQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		if symbol == "RELIANCE" {
			return &marketDTO.QuoteResponse{
				Symbol:     "RELIANCE",
				PricePaise: 2700, // +200 profit per share -> +20,000 unrealized
				UpdatedAt:  today.Add(-72 * time.Hour).UTC().Format(time.RFC3339),
			}, nil
		}
		if symbol == "TCS" {
			return &marketDTO.QuoteResponse{
				Symbol:     "TCS",
				PricePaise: 3400, // -100 loss per share -> -5,000 unrealized
				UpdatedAt:  today.Add(-48 * time.Hour).UTC().Format(time.RFC3339),
			}, nil
		}
		return nil, errors.New("quote not found")
	})

	portfolio, err := svc.Get(userUUID.String())
	if err != nil {
		t.Fatalf("Get() failed: %v", err)
	}

	if len(portfolio.Positions) != 2 {
		t.Fatalf("expected 2 positions, got %d", len(portfolio.Positions))
	}

	// Invested value: 250,000 + 175,000 = 425,000 paise
	if portfolio.InvestedValuePaise != 425000 {
		t.Fatalf("expected InvestedValuePaise 425000, got %d", portfolio.InvestedValuePaise)
	}

	// Current value: (100 * 2700) + (50 * 3400) = 270,000 + 170,000 = 440,000 paise
	if portfolio.CurrentValuePaise != 440000 {
		t.Fatalf("expected CurrentValuePaise 440000, got %d", portfolio.CurrentValuePaise)
	}

	// Unrealized P&L: 440,000 - 425,000 = +15,000 paise
	if portfolio.UnrealizedPnlPaise != 15000 {
		t.Fatalf("expected UnrealizedPnlPaise 15000, got %d", portfolio.UnrealizedPnlPaise)
	}

	// Realized P&L: past (5,000) + today (8,000) = 13,000 paise
	if portfolio.RealizedPnlPaise != 13000 {
		t.Fatalf("expected RealizedPnlPaise 13000, got %d", portfolio.RealizedPnlPaise)
	}

	// Daily P&L: Unrealized (15,000) + Today's Realized (8,000) = 23,000 paise
	if portfolio.DailyPnlPaise != 23000 {
		t.Fatalf("expected DailyPnlPaise 23000, got %d", portfolio.DailyPnlPaise)
	}

	// Total P&L: Unrealized (15,000) + Total Realized (13,000) = 28,000 paise
	if portfolio.TotalPnlPaise != 28000 {
		t.Fatalf("expected TotalPnlPaise 28000, got %d", portfolio.TotalPnlPaise)
	}

	// Case 2: Fallback when Redis is unavailable or returns an error for a symbol
	svc.SetCurrentQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		return nil, errors.New("redis connection refused")
	})

	fallbackPortfolio, err := svc.Get(userUUID.String())
	if err != nil {
		t.Fatalf("Get() with Redis failure should gracefully fall back to last recorded price, got error: %v", err)
	}
	if fallbackPortfolio.CurrentValuePaise != 425000 {
		// Fell back to CurrentPricePaise (2500, 3500)
		t.Fatalf("expected fallback CurrentValuePaise 425000, got %d", fallbackPortfolio.CurrentValuePaise)
	}

	// Verify Positions() and Pnl() wrapper helpers
	positions, err := svc.Positions(userUUID.String())
	if err != nil || len(positions) != 2 {
		t.Fatalf("Positions() failed: %v, len=%d", err, len(positions))
	}
	pnlResp, err := svc.Pnl(userUUID.String())
	if err != nil || len(pnlResp.Positions) != 0 {
		t.Fatalf("Pnl() should return summary with nil positions list: %v", err)
	}
}

func TestPortfolioService_FNO_PositionsRepricingAndQuoteStates(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Kolkata")
	now := time.Date(2026, 9, 25, 14, 0, 0, 0, loc)
	userUUID := uuid.New()

	// Setup 6 F&O Positions representing all supported directions:
	// 1. Long CE: NIFTY 25000 CE, qty +25, avg 10,000 paise (₹100)
	// 2. Short CE: NIFTY 25200 CE, qty -25, avg 8,000 paise (₹80)
	// 3. Long PE: NIFTY 24800 PE, qty +25, avg 9,000 paise (₹90)
	// 4. Short PE: NIFTY 24500 PE, qty -25, avg 6,000 paise (₹60)
	// 5. Long Future: NIFTY24SEPFUT, qty +25, avg 2,500,000 paise (₹25,000)
	// 6. Short Future: BANKNIFTY24SEPFUT, qty -15, avg 5,200,000 paise (₹52,000)
	testPositions := []model.Position{
		{
			UUID:              uuid.New(),
			UserUUID:          userUUID,
			Symbol:            "NIFTY 25000 CE",
			Product:           model.OrderProductFNO,
			Quantity:          25,
			AveragePricePaise: 10000,
			CostBasisPaise:    250000,
		},
		{
			UUID:              uuid.New(),
			UserUUID:          userUUID,
			Symbol:            "NIFTY 25200 CE",
			Product:           model.OrderProductFNO,
			Quantity:          -25,
			AveragePricePaise: 8000,
			CostBasisPaise:    200000,
		},
		{
			UUID:              uuid.New(),
			UserUUID:          userUUID,
			Symbol:            "NIFTY 24800 PE",
			Product:           model.OrderProductFNO,
			Quantity:          25,
			AveragePricePaise: 9000,
			CostBasisPaise:    225000,
		},
		{
			UUID:              uuid.New(),
			UserUUID:          userUUID,
			Symbol:            "NIFTY 24500 PE",
			Product:           model.OrderProductFNO,
			Quantity:          -25,
			AveragePricePaise: 6000,
			CostBasisPaise:    150000,
		},
		{
			UUID:              uuid.New(),
			UserUUID:          userUUID,
			Symbol:            "NIFTY24SEPFUT",
			Product:           model.OrderProductFNO,
			Quantity:          25,
			AveragePricePaise: 2500000,
			CostBasisPaise:    62500000,
		},
		{
			UUID:              uuid.New(),
			UserUUID:          userUUID,
			Symbol:            "BANKNIFTY24SEPFUT",
			Product:           model.OrderProductFNO,
			Quantity:          -15,
			AveragePricePaise: 5200000,
			CostBasisPaise:    78000000,
		},
	}

	quoteMap := map[string]*marketDTO.QuoteResponse{
		// Long CE gained +₹50 (now ₹150 / 15,000 paise) -> +₹1,250 (+125,000 paise)
		"NIFTY 25000 CE": {
			Symbol:     "NIFTY 25000 CE",
			PricePaise: 15000,
			Source:     "angelone_live",
			UpdatedAt:  now.Add(-10 * time.Second).UTC().Format(time.RFC3339),
		},
		// Short CE dropped -₹20 (now ₹60 / 6,000 paise) -> +₹500 (+50,000 paise)
		"NIFTY 25200 CE": {
			Symbol:     "NIFTY 25200 CE",
			PricePaise: 6000,
			Source:     "angelone_live",
			UpdatedAt:  now.Add(-15 * time.Second).UTC().Format(time.RFC3339),
		},
		// Long PE dropped -₹30 (now ₹60 / 6,000 paise) -> -₹750 (-75,000 paise)
		"NIFTY 24800 PE": {
			Symbol:     "NIFTY 24800 PE",
			PricePaise: 6000,
			Source:     "angelone_live",
			UpdatedAt:  now.Add(-20 * time.Second).UTC().Format(time.RFC3339),
		},
		// Short PE gained +₹10 (now ₹70 / 7,000 paise) -> -₹250 (-25,000 paise)
		"NIFTY 24500 PE": {
			Symbol:     "NIFTY 24500 PE",
			PricePaise: 7000,
			Source:     "angelone_live",
			UpdatedAt:  now.Add(-25 * time.Second).UTC().Format(time.RFC3339),
		},
		// Long Future gained +₹200 (now ₹25,200 / 2,520,000 paise) -> +₹5,000 (+500,000 paise)
		"NIFTY24SEPFUT": {
			Symbol:     "NIFTY24SEPFUT",
			PricePaise: 2520000,
			Source:     "angelone_live",
			UpdatedAt:  now.Add(-5 * time.Second).UTC().Format(time.RFC3339),
		},
		// Short Future dropped -₹500 (now ₹51,500 / 5,150,000 paise) -> +₹7,500 (+750,000 paise)
		"BANKNIFTY24SEPFUT": {
			Symbol:     "BANKNIFTY24SEPFUT",
			PricePaise: 5150000,
			Source:     "angelone_live",
			UpdatedAt:  now.Add(-8 * time.Second).UTC().Format(time.RFC3339),
		},
	}

	svc := New(nil)
	svc.SetNowFunc(func() time.Time { return now })
	svc.SetListPositionsFunc(func(u uuid.UUID) ([]model.Position, error) {
		return testPositions, nil
	})
	svc.SetRealizedPnlFunc(func(u uuid.UUID, f time.Time) (int64, error) {
		return 50000, nil // +₹500 realized
	})
	svc.SetCurrentQuoteFunc(func(sym string) (*marketDTO.QuoteResponse, error) {
		if q, ok := quoteMap[sym]; ok {
			return q, nil
		}
		return nil, errors.New("quote not found")
	})

	// 1. Verify all 6 F&O positions reprice correctly with fresh quotes
	t.Run("All 6 F&O directions reprice correctly with real-time quotes", func(t *testing.T) {
		portfolio, err := svc.Get(userUUID.String())
		if err != nil {
			t.Fatalf("Get() error: %v", err)
		}
		if portfolio.ValuationStatus != "REALTIME" {
			t.Errorf("expected ValuationStatus REALTIME, got %s", portfolio.ValuationStatus)
		}

		expectedPnl := map[string]int64{
			"NIFTY 25000 CE":    125000, // Long CE: (150-100)*25 = +125,000
			"NIFTY 25200 CE":    50000,  // Short CE: (80-60)*25 = +50,000
			"NIFTY 24800 PE":    -75000, // Long PE: (60-90)*25 = -75,000
			"NIFTY 24500 PE":    -25000, // Short PE: (60-70)*25 = -25,000
			"NIFTY24SEPFUT":     500000, // Long Future: (25200-25000)*25 = +500,000
			"BANKNIFTY24SEPFUT": 750000, // Short Future: (52000-51500)*15 = +750,000
		}

		totalExpectedUnrealized := int64(125000 + 50000 - 75000 - 25000 + 500000 + 750000) // 1,325,000 paise (+₹13,250)

		for _, pos := range portfolio.Positions {
			exp, ok := expectedPnl[pos.Symbol]
			if !ok {
				t.Errorf("unexpected symbol in positions: %s", pos.Symbol)
				continue
			}
			if pos.UnrealizedPnlPaise != exp {
				t.Errorf("symbol %s: expected unrealized PnL %d, got %d", pos.Symbol, exp, pos.UnrealizedPnlPaise)
			}
			if pos.QuoteStatus != "FRESH" {
				t.Errorf("symbol %s: expected QuoteStatus FRESH, got %s", pos.Symbol, pos.QuoteStatus)
			}
			if !pos.IsQuoteAvailable {
				t.Errorf("symbol %s: expected IsQuoteAvailable true", pos.Symbol)
			}
			if pos.IsQuoteStale {
				t.Errorf("symbol %s: expected IsQuoteStale false", pos.Symbol)
			}
		}

		if portfolio.UnrealizedPnlPaise != totalExpectedUnrealized {
			t.Errorf("total unrealized PnL: expected %d, got %d", totalExpectedUnrealized, portfolio.UnrealizedPnlPaise)
		}
		if portfolio.TotalPnlPaise != totalExpectedUnrealized+50000 {
			t.Errorf("total PnL: expected %d, got %d", totalExpectedUnrealized+50000, portfolio.TotalPnlPaise)
		}
	})

	// 2. Dynamic Repricing: When Redis quote changes, portfolio value and P&L update immediately
	t.Run("Portfolio reprices dynamically when quote moves", func(t *testing.T) {
		// NIFTY 25000 CE surges from ₹150 to ₹200 (20,000 paise)
		quoteMap["NIFTY 25000 CE"].PricePaise = 20000

		portfolio, err := svc.Get(userUUID.String())
		if err != nil {
			t.Fatalf("Get() error: %v", err)
		}

		// New Long CE PnL: (200 - 100) * 25 = +₹2,500 (250,000 paise)
		for _, pos := range portfolio.Positions {
			if pos.Symbol == "NIFTY 25000 CE" {
				if pos.UnrealizedPnlPaise != 250000 {
					t.Errorf("expected updated Long CE PnL 250000, got %d", pos.UnrealizedPnlPaise)
				}
				if pos.CurrentPricePaise != 20000 {
					t.Errorf("expected updated Long CE price 20000, got %d", pos.CurrentPricePaise)
				}
			}
		}
	})

	// 3. Stale Quote Handling (> 2 minutes old)
	t.Run("Stale quotes are flagged as STALE and degrade valuation status", func(t *testing.T) {
		// Make BANKNIFTY future quote 5 minutes old
		quoteMap["BANKNIFTY24SEPFUT"].UpdatedAt = now.Add(-5 * time.Minute).UTC().Format(time.RFC3339)

		portfolio, err := svc.Get(userUUID.String())
		if err != nil {
			t.Fatalf("Get() error: %v", err)
		}
		if portfolio.ValuationStatus != "STALE" {
			t.Errorf("expected ValuationStatus STALE, got %s", portfolio.ValuationStatus)
		}

		for _, pos := range portfolio.Positions {
			if pos.Symbol == "BANKNIFTY24SEPFUT" {
				if pos.QuoteStatus != "STALE" {
					t.Errorf("expected BANKNIFTY QuoteStatus STALE, got %s", pos.QuoteStatus)
				}
				if !pos.IsQuoteStale {
					t.Errorf("expected BANKNIFTY IsQuoteStale true")
				}
			}
		}
	})

	// 4. Missing Quote Handling: Never falls back to average cost basis to fake zero P&L
	t.Run("Missing quotes are marked UNAVAILABLE and never faked as zero PnL", func(t *testing.T) {
		// Remove quote for NIFTY 24800 PE completely
		delete(quoteMap, "NIFTY 24800 PE")

		portfolio, err := svc.Get(userUUID.String())
		if err != nil {
			t.Fatalf("Get() error: %v", err)
		}
		if portfolio.ValuationStatus != "DEGRADED" {
			t.Errorf("expected ValuationStatus DEGRADED when quote missing, got %s", portfolio.ValuationStatus)
		}

		for _, pos := range portfolio.Positions {
			if pos.Symbol == "NIFTY 24800 PE" {
				if pos.QuoteStatus != "UNAVAILABLE" {
					t.Errorf("expected NIFTY 24800 PE QuoteStatus UNAVAILABLE, got %s", pos.QuoteStatus)
				}
				if pos.IsQuoteAvailable {
					t.Errorf("expected NIFTY 24800 PE IsQuoteAvailable false")
				}
			}
		}
	})
}
