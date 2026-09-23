package service

import (
	"testing"
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
