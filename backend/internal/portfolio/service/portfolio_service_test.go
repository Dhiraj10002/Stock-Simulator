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
