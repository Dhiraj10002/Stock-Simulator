package service

import (
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
)

func TestToCanonicalInstrument(t *testing.T) {

	m := model.Instrument{
		ID:             42,
		Symbol:         "NIFTY24SEPFUT",
		DisplaySymbol:  "NIFTY SEP FUT",
		Exchange:       "NFO",
		Token:          "12345",
		InstrumentType: "FUTIDX",
		Underlying:     "NIFTY",
		Expiry:         "2026-09-24",
		Strike:         "0",
		OptionType:     "",
		LotSize:        25,
		TickSize:       "0.05",
		Active:         true,
	}

	dto := ToCanonicalInstrument(m)

	if dto.ID != 42 {
		t.Errorf("expected ID 42, got %d", dto.ID)
	}
	if dto.Symbol != "NIFTY24SEPFUT" {
		t.Errorf("expected Symbol NIFTY24SEPFUT, got %s", dto.Symbol)
	}
	if dto.DisplaySymbol != "NIFTY SEP FUT" {
		t.Errorf("expected DisplaySymbol 'NIFTY SEP FUT', got %s", dto.DisplaySymbol)
	}
	if dto.Exchange != "NFO" {
		t.Errorf("expected Exchange NFO, got %s", dto.Exchange)
	}
	if dto.Token != "12345" {
		t.Errorf("expected Token 12345, got %s", dto.Token)
	}
	if dto.InstrumentType != "FUTIDX" {
		t.Errorf("expected InstrumentType FUTIDX, got %s", dto.InstrumentType)
	}
	if dto.Underlying != "NIFTY" {
		t.Errorf("expected Underlying NIFTY, got %s", dto.Underlying)
	}
	if dto.Expiry != "2026-09-24" {
		t.Errorf("expected Expiry 2026-09-24, got %s", dto.Expiry)
	}
	if dto.Strike != 0 {
		t.Errorf("expected Strike 0, got %f", dto.Strike)
	}
	if dto.OptionType != "" {
		t.Errorf("expected OptionType empty, got %s", dto.OptionType)
	}
	if dto.LotSize != 25 {
		t.Errorf("expected LotSize 25, got %d", dto.LotSize)
	}
	if dto.TickSize != 0.05 {
		t.Errorf("expected TickSize 0.05, got %f", dto.TickSize)
	}
	if !dto.Active {
		t.Errorf("expected Active true, got false")
	}
}

func TestFormatCanonicalDisplaySymbol(t *testing.T) {
	tests := []struct {
		symbol     string
		expiry     string
		strikeStr  string
		optionType string
		name       string
		expected   string
	}{
		{"RELIANCE-EQ", "", "", "", "Reliance Industries", "RELIANCE"},
		{"NIFTY24SEPFUT", "2026-09-24", "0", "", "NIFTY Futures", "NIFTY SEP FUT"},
		{"NIFTY 25000 CE", "2026-09-24", "25000", "CE", "", "NIFTY 25000 CE"},
	}

	for _, tt := range tests {
		got := FormatCanonicalDisplaySymbol(tt.symbol, tt.expiry, tt.strikeStr, tt.optionType, tt.name)
		if got != tt.expected {
			t.Errorf("FormatCanonicalDisplaySymbol(%s) = %q; want %q", tt.symbol, got, tt.expected)
		}
	}
}

func TestService_List_And_GetBySymbol_DefaultFallback(t *testing.T) {
	svc := NewService(nil)

	// List all
	list, err := svc.List("", "", "", "", false, 100)
	if err != nil {
		t.Fatalf("unexpected error listing instruments: %v", err)
	}
	if len(list) == 0 {
		t.Fatalf("expected non-empty list of default canonical instruments")
	}

	// Filter by query
	filtered, err := svc.List("RELIANCE", "", "", "", false, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(filtered) == 0 {
		t.Fatalf("expected to find RELIANCE in filtered list")
	}

	// Filter by Exchange
	nfoList, err := svc.List("", "NFO", "", "", false, 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	for _, inst := range nfoList {
		if inst.Exchange != "NFO" {
			t.Errorf("expected Exchange NFO, got %s", inst.Exchange)
		}
	}

	// GetBySymbol found
	rel, err := svc.GetBySymbol("reliance")
	if err != nil {
		t.Fatalf("expected to find RELIANCE, got error: %v", err)
	}
	if rel.Symbol != "RELIANCE" {
		t.Errorf("expected Symbol RELIANCE, got %s", rel.Symbol)
	}
	if rel.Exchange != "NSE" {
		t.Errorf("expected Exchange NSE, got %s", rel.Exchange)
	}

	// GetBySymbol not found
	_, err = svc.GetBySymbol("NON_EXISTENT_SYMBOL_XYZ")
	if err == nil {
		t.Errorf("expected error for non-existent symbol, got nil")
	}
}
