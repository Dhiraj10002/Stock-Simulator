package service

import (
	"testing"

	marketDto "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
)

func TestOptionChainService_AuthoritativeMetadata(t *testing.T) {
	svc := New(nil)

	// 1. Verify NIFTY option chain returns authoritative lot size of 25 (resolving past conflict with 50)
	chain, err := svc.GetOptionChain("NIFTY", "")
	if err != nil {
		t.Fatalf("unexpected error getting NIFTY option chain: %v", err)
	}

	if chain.UnderlyingSymbol != "NIFTY" {
		t.Fatalf("expected underlying NIFTY, got %s", chain.UnderlyingSymbol)
	}
	if chain.LotSize != 25 {
		t.Fatalf("expected authoritative NIFTY lot size 25, got %d", chain.LotSize)
	}
	if len(chain.Strikes) != 21 {
		t.Fatalf("expected 21 strike rows, got %d", len(chain.Strikes))
	}

	for _, row := range chain.Strikes {
		if row.Call.LotSize != 25 {
			t.Fatalf("expected call lot size 25, got %d", row.Call.LotSize)
		}
		if row.Put.LotSize != 25 {
			t.Fatalf("expected put lot size 25, got %d", row.Put.LotSize)
		}
		if row.Call.OptionType != "CE" {
			t.Fatalf("expected call option type CE, got %s", row.Call.OptionType)
		}
		if row.Put.OptionType != "PE" {
			t.Fatalf("expected put option type PE, got %s", row.Put.OptionType)
		}
	}

	// 2. Verify BANKNIFTY option chain returns authoritative lot size of 15
	bnChain, err := svc.GetOptionChain("BANKNIFTY", "")
	if err != nil {
		t.Fatalf("unexpected error getting BANKNIFTY option chain: %v", err)
	}
	if bnChain.LotSize != 15 {
		t.Fatalf("expected authoritative BANKNIFTY lot size 15, got %d", bnChain.LotSize)
	}
	for _, row := range bnChain.Strikes {
		if row.Call.LotSize != 15 || row.Put.LotSize != 15 {
			t.Fatalf("expected BANKNIFTY leg lot size 15, got call=%d put=%d", row.Call.LotSize, row.Put.LotSize)
		}
	}

	// 3. Verify RELIANCE option chain returns authoritative lot size of 250
	relChain, err := svc.GetOptionChain("RELIANCE", "")
	if err != nil {
		t.Fatalf("unexpected error getting RELIANCE option chain: %v", err)
	}
	if relChain.LotSize != 250 {
		t.Fatalf("expected authoritative RELIANCE lot size 250, got %d", relChain.LotSize)
	}
}

func TestOptionChainService_LiveVsSyntheticGating(t *testing.T) {
	// A. LIVE Mode: When live market quotes are missing, do not fabricate prices or seed Redis
	mktLive := &marketService.Service{}
	mktLive.SetFeedMode(marketDto.FeedModeLive)
	svcLive := New(mktLive)

	chainLive, err := svcLive.GetOptionChain("NIFTY", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if chainLive.FeedMode != string(marketDto.FeedModeLive) {
		t.Fatalf("expected FeedMode LIVE, got %s", chainLive.FeedMode)
	}
	for _, strike := range chainLive.Strikes {
		if strike.Call.IsAvailable {
			t.Errorf("expected strike call to be unavailable in LIVE mode without live feed, got available")
		}
		if strike.Call.LTPPaise != 0 {
			t.Errorf("expected zero fake price for call in LIVE mode, got %d", strike.Call.LTPPaise)
		}
		if strike.Call.QuoteStatus != string(marketDto.QuoteSourceUnavailable) {
			t.Errorf("expected quote status unavailable, got %s", strike.Call.QuoteStatus)
		}
		if strike.Put.IsAvailable {
			t.Errorf("expected strike put to be unavailable in LIVE mode without live feed, got available")
		}
		if strike.Put.LTPPaise != 0 {
			t.Errorf("expected zero fake price for put in LIVE mode, got %d", strike.Put.LTPPaise)
		}
	}

	// B. SYNTHETIC Mode: Explicit simulation generates Black-Scholes pricing
	mktSynth := &marketService.Service{}
	mktSynth.SetFeedMode(marketDto.FeedModeSynthetic)
	svcSynth := New(mktSynth)

	chainSynth, err := svcSynth.GetOptionChain("NIFTY", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if chainSynth.FeedMode != string(marketDto.FeedModeSynthetic) {
		t.Fatalf("expected FeedMode SYNTHETIC, got %s", chainSynth.FeedMode)
	}
	for _, strike := range chainSynth.Strikes {
		if !strike.Call.IsAvailable {
			t.Errorf("expected strike call to be available in SYNTHETIC mode")
		}
		if strike.Call.LTPPaise <= 0 {
			t.Errorf("expected positive simulated price for call, got %d", strike.Call.LTPPaise)
		}
		if strike.Call.QuoteStatus != string(marketDto.QuoteSourceSyntheticGBM) {
			t.Errorf("expected synthetic quote status, got %s", strike.Call.QuoteStatus)
		}
		if !strike.Put.IsAvailable {
			t.Errorf("expected strike put to be available in SYNTHETIC mode")
		}
		if strike.Put.LTPPaise <= 0 {
			t.Errorf("expected positive simulated price for put, got %d", strike.Put.LTPPaise)
		}
	}

	// C. UNAVAILABLE Mode: Explicit unavailable state marks all contracts unavailable
	mktUnavail := &marketService.Service{}
	mktUnavail.SetFeedMode(marketDto.FeedModeUnavailable)
	svcUnavail := New(mktUnavail)

	chainUnavail, err := svcUnavail.GetOptionChain("NIFTY", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if chainUnavail.FeedMode != string(marketDto.FeedModeUnavailable) {
		t.Fatalf("expected FeedMode UNAVAILABLE, got %s", chainUnavail.FeedMode)
	}
	for _, strike := range chainUnavail.Strikes {
		if strike.Call.IsAvailable || strike.Put.IsAvailable {
			t.Errorf("expected all strikes unavailable in UNAVAILABLE mode")
		}
	}
}
