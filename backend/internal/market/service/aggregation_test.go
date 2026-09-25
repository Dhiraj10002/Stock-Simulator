package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
)

func TestMarketAggregation_FeedUnavailable(t *testing.T) {
	svc := &Service{}
	svc.SetFeedMode(dto.FeedModeUnavailable)

	ctx := context.Background()
	_, err := svc.GetMarketMovers(ctx, 10)
	if !errors.Is(err, ErrQuoteUnavailable) {
		t.Fatalf("expected ErrQuoteUnavailable when FeedMode is UNAVAILABLE, got %v", err)
	}

	_, err = svc.GetMarketBreadth(ctx)
	if !errors.Is(err, ErrQuoteUnavailable) {
		t.Fatalf("expected ErrQuoteUnavailable for Breadth when FeedMode is UNAVAILABLE, got %v", err)
	}
}

func TestMarketAggregation_NilClient(t *testing.T) {
	svc := &Service{}
	svc.SetFeedMode(dto.FeedModeLive)

	ctx := context.Background()
	_, err := svc.GetMarketMovers(ctx, 10)
	if !errors.Is(err, ErrQuoteUnavailable) {
		t.Fatalf("expected ErrQuoteUnavailable when client is nil, got %v", err)
	}

	_, err = svc.GetMarketBreadth(ctx)
	if !errors.Is(err, ErrQuoteUnavailable) {
		t.Fatalf("expected ErrQuoteUnavailable for Breadth when client is nil, got %v", err)
	}
}

func TestMarketAggregation_RedisDynamicCalculation(t *testing.T) {
	svc, err := New("redis://localhost:6379/0", time.Second)
	if err != nil || svc.Client() == nil || svc.Client().Ping(t.Context()).Err() != nil {
		t.Skip("skipping test: Redis not reachable on localhost:6379")
	}

	ctx := t.Context()
	client := svc.Client()
	svc.SetFeedMode(dto.FeedModeLive)
	svc.SetAllowSeededQuotes(false)

	testUniverse := []EquityUniverseItem{
		{Symbol: "TEST_GAIN_A", Name: "Gain Stock Alpha", Exchange: "NSE"},
		{Symbol: "TEST_GAIN_B", Name: "Gain Stock Beta", Exchange: "NSE"},
		{Symbol: "TEST_LOSS_A", Name: "Loss Stock Alpha", Exchange: "NSE"},
		{Symbol: "TEST_LOSS_B", Name: "Loss Stock Beta", Exchange: "NSE"},
		{Symbol: "TEST_FLAT", Name: "Flat Stock", Exchange: "NSE"},
		{Symbol: "TEST_STALE", Name: "Stale Stock", Exchange: "NSE"},
		{Symbol: "TEST_SEEDED", Name: "Seeded Mock Stock", Exchange: "NSE"},
	}

	svc.SetEquityProvider(func(ctx context.Context) ([]EquityUniverseItem, error) {
		return testUniverse, nil
	})

	now := time.Now().UTC().Format(time.RFC3339)
	staleTime := time.Now().Add(-5 * time.Minute).UTC().Format(time.RFC3339)

	// Clean up keys before test
	defer func() {
		for _, item := range testUniverse {
			_ = client.Del(ctx, "market:quote:"+item.Symbol).Err()
		}
	}()

	// 1. TEST_GAIN_A: +12.5%, price 2000.00 (200000 paise), volume 100,000
	_ = client.HSet(ctx, "market:quote:TEST_GAIN_A", map[string]interface{}{
		"symbol":         "TEST_GAIN_A",
		"price_paise":    "200000",
		"change_paise":   "25000",
		"change_percent": "12.50",
		"volume":         "100000",
		"source":         "angelone_live",
		"updated_at":     now,
	}).Err()

	// 2. TEST_GAIN_B: +3.2%, price 500.00 (50000 paise), volume 10,000
	_ = client.HSet(ctx, "market:quote:TEST_GAIN_B", map[string]interface{}{
		"symbol":         "TEST_GAIN_B",
		"price_paise":    "50000",
		"change_paise":   "1600",
		"change_percent": "3.20",
		"volume":         "10000",
		"source":         "angelone_live",
		"updated_at":     now,
	}).Err()

	// 3. TEST_LOSS_A: -9.8%, price 1500.00 (150000 paise), volume 80,000
	_ = client.HSet(ctx, "market:quote:TEST_LOSS_A", map[string]interface{}{
		"symbol":         "TEST_LOSS_A",
		"price_paise":    "150000",
		"change_paise":   "-14700",
		"change_percent": "-9.80",
		"volume":         "80000",
		"source":         "angelone_live",
		"updated_at":     now,
	}).Err()

	// 4. TEST_LOSS_B: -1.5%, price 800.00 (80000 paise), volume 5,000
	_ = client.HSet(ctx, "market:quote:TEST_LOSS_B", map[string]interface{}{
		"symbol":         "TEST_LOSS_B",
		"price_paise":    "80000",
		"change_paise":   "-1200",
		"change_percent": "-1.50",
		"volume":         "5000",
		"source":         "angelone_live",
		"updated_at":     now,
	}).Err()

	// 5. TEST_FLAT: 0.0%, price 1000.00 (100000 paise), volume 2,000
	_ = client.HSet(ctx, "market:quote:TEST_FLAT", map[string]interface{}{
		"symbol":         "TEST_FLAT",
		"price_paise":    "100000",
		"change_paise":   "0",
		"change_percent": "0.00",
		"volume":         "2000",
		"source":         "angelone_live",
		"updated_at":     now,
	}).Err()

	// 6. TEST_STALE: Stale quote (5 min old) - should be excluded
	_ = client.HSet(ctx, "market:quote:TEST_STALE", map[string]interface{}{
		"symbol":         "TEST_STALE",
		"price_paise":    "300000",
		"change_paise":   "50000",
		"change_percent": "20.00",
		"volume":         "1000000",
		"source":         "angelone_live",
		"updated_at":     staleTime,
	}).Err()

	// 7. TEST_SEEDED: Seeded quote - should be excluded in live mode
	_ = client.HSet(ctx, "market:quote:TEST_SEEDED", map[string]interface{}{
		"symbol":         "TEST_SEEDED",
		"price_paise":    "300000",
		"change_paise":   "50000",
		"change_percent": "20.00",
		"volume":         "1000000",
		"source":         "auto_seeded",
		"updated_at":     now,
	}).Err()

	t.Run("GetMarketMovers dynamic rankings", func(t *testing.T) {
		movers, err := svc.GetMarketMovers(ctx, 10)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Gainers check
		if len(movers.Gainers) != 2 {
			t.Fatalf("expected 2 gainers, got %d", len(movers.Gainers))
		}
		if movers.Gainers[0].Symbol != "TEST_GAIN_A" || movers.Gainers[0].ChangePercent != 12.50 {
			t.Errorf("expected top gainer TEST_GAIN_A (+12.50%%), got %s (%f)", movers.Gainers[0].Symbol, movers.Gainers[0].ChangePercent)
		}
		if movers.Gainers[1].Symbol != "TEST_GAIN_B" || movers.Gainers[1].ChangePercent != 3.20 {
			t.Errorf("expected 2nd gainer TEST_GAIN_B (+3.20%%), got %s (%f)", movers.Gainers[1].Symbol, movers.Gainers[1].ChangePercent)
		}

		// Losers check (sorted ascending: biggest loss first)
		if len(movers.Losers) != 2 {
			t.Fatalf("expected 2 losers, got %d", len(movers.Losers))
		}
		if movers.Losers[0].Symbol != "TEST_LOSS_A" || movers.Losers[0].ChangePercent != -9.80 {
			t.Errorf("expected top loser TEST_LOSS_A (-9.80%%), got %s (%f)", movers.Losers[0].Symbol, movers.Losers[0].ChangePercent)
		}
		if movers.Losers[1].Symbol != "TEST_LOSS_B" || movers.Losers[1].ChangePercent != -1.50 {
			t.Errorf("expected 2nd loser TEST_LOSS_B (-1.50%%), got %s (%f)", movers.Losers[1].Symbol, movers.Losers[1].ChangePercent)
		}

		// Most Traded check (ranked by Turnover: price * volume)
		// TEST_GAIN_A: 2000 * 100,000 = 200,000,000
		// TEST_LOSS_A: 1500 * 80,000 = 120,000,000
		if len(movers.MostTraded) < 2 {
			t.Fatalf("expected at least 2 most traded stocks, got %d", len(movers.MostTraded))
		}
		if movers.MostTraded[0].Symbol != "TEST_GAIN_A" {
			t.Errorf("expected most traded #1 to be TEST_GAIN_A, got %s", movers.MostTraded[0].Symbol)
		}
		if movers.MostTraded[1].Symbol != "TEST_LOSS_A" {
			t.Errorf("expected most traded #2 to be TEST_LOSS_A, got %s", movers.MostTraded[1].Symbol)
		}

		// Trending check (ranked by TrendingScore)
		if len(movers.Trending) < 2 {
			t.Fatalf("expected at least 2 trending stocks, got %d", len(movers.Trending))
		}
		if movers.Trending[0].Symbol != "TEST_GAIN_A" {
			t.Errorf("expected trending #1 to be TEST_GAIN_A, got %s", movers.Trending[0].Symbol)
		}

		// Stale and seeded stocks should NEVER be present
		for _, g := range movers.Gainers {
			if g.Symbol == "TEST_STALE" || g.Symbol == "TEST_SEEDED" {
				t.Fatalf("SAFETY VIOLATION: %s present in Gainers", g.Symbol)
			}
		}
	})

	t.Run("GetMarketBreadth accurate counts", func(t *testing.T) {
		breadth, err := svc.GetMarketBreadth(ctx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if breadth.Advances != 2 {
			t.Errorf("expected 2 advances, got %d", breadth.Advances)
		}
		if breadth.Declines != 2 {
			t.Errorf("expected 2 declines, got %d", breadth.Declines)
		}
		if breadth.Unchanged != 1 {
			t.Errorf("expected 1 unchanged, got %d", breadth.Unchanged)
		}
		if breadth.Total != 5 {
			t.Errorf("expected 5 total active stocks, got %d", breadth.Total)
		}
		if breadth.AdvanceDeclineRatio != 1.0 {
			t.Errorf("expected AdvanceDeclineRatio 1.0, got %f", breadth.AdvanceDeclineRatio)
		}
		if breadth.AdvancePercent != 40.0 {
			t.Errorf("expected AdvancePercent 40.0%%, got %f", breadth.AdvancePercent)
		}
	})
}
