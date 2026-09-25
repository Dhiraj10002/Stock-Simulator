package service

import (
	"strings"
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

func TestParseAngelScripItem(t *testing.T) {
	// 1. Standard Equity
	eqRaw := AngelScripItem{
		Token:          "2885",
		Symbol:         "RELIANCE-EQ",
		Name:           "RELIANCE",
		Expiry:         "",
		Strike:         "-1.000000",
		LotSize:        "1",
		InstrumentType: "",
		ExchSeg:        "NSE",
		TickSize:       "5.000000",
	}
	eqInst, ok := ParseAngelScripItem(eqRaw)
	if !ok || eqInst == nil {
		t.Fatalf("expected valid equity instrument")
	}
	if eqInst.Token != "2885" || eqInst.Symbol != "RELIANCE-EQ" || eqInst.DisplaySymbol != "RELIANCE" {
		t.Errorf("unexpected equity mapping: %+v", eqInst)
	}
	if eqInst.TickSize != "0.05" {
		t.Errorf("expected tick size 0.05, got %s", eqInst.TickSize)
	}
	if eqInst.InstrumentType != "EQUITY" {
		t.Errorf("expected instrument type EQUITY, got %s", eqInst.InstrumentType)
	}

	// 2. Index AMXIDX
	idxRaw := AngelScripItem{
		Token:          "99926000",
		Symbol:         "NIFTY 50",
		Name:           "NIFTY",
		Expiry:         "",
		Strike:         "-1.000000",
		LotSize:        "25",
		InstrumentType: "AMXIDX",
		ExchSeg:        "NSE",
		TickSize:       "5.000000",
	}
	idxInst, ok := ParseAngelScripItem(idxRaw)
	if !ok || idxInst == nil {
		t.Fatalf("expected valid index instrument")
	}
	if idxInst.InstrumentType != "INDEX" || idxInst.LotSize != 25 {
		t.Errorf("unexpected index mapping: %+v", idxInst)
	}

	// 3. NFO Option with strike in paise
	optRaw := AngelScripItem{
		Token:          "45678",
		Symbol:         "NIFTY24SEP25000CE",
		Name:           "NIFTY",
		Expiry:         "24SEP2026",
		Strike:         "2500000.000000",
		LotSize:        "25",
		InstrumentType: "OPTIDX",
		ExchSeg:        "NFO",
		TickSize:       "5.000000",
	}
	optInst, ok := ParseAngelScripItem(optRaw)
	if !ok || optInst == nil {
		t.Fatalf("expected valid option instrument")
	}
	if optInst.Strike != "25000" {
		t.Errorf("expected normalized strike 25000, got %s", optInst.Strike)
	}
	if optInst.OptionType != "CE" {
		t.Errorf("expected option type CE, got %s", optInst.OptionType)
	}
	if optInst.InstrumentType != "OPTIDX" {
		t.Errorf("expected instrument type OPTIDX, got %s", optInst.InstrumentType)
	}

	// 4. Unsupported commodity segment (MCX)
	mcxRaw := AngelScripItem{
		Token:   "123",
		Symbol:  "GOLD",
		ExchSeg: "MCX",
	}
	_, ok = ParseAngelScripItem(mcxRaw)
	if ok {
		t.Errorf("expected MCX commodity to be filtered out of equity/derivative master")
	}
}

func TestSyncFromReader(t *testing.T) {
	mockJSON := `[
		{"token":"2885","symbol":"RELIANCE-EQ","name":"RELIANCE","expiry":"","strike":"-1.000000","lotsize":"1","instrumenttype":"","exch_seg":"NSE","tick_size":"5.000000"},
		{"token":"11536","symbol":"TCS-EQ","name":"TCS","expiry":"","strike":"-1.000000","lotsize":"1","instrumenttype":"","exch_seg":"NSE","tick_size":"5.000000"},
		{"token":"99926000","symbol":"NIFTY 50","name":"NIFTY","expiry":"","strike":"-1.000000","lotsize":"25","instrumenttype":"AMXIDX","exch_seg":"NSE","tick_size":"5.000000"},
		{"token":"45678","symbol":"NIFTY24SEP25000CE","name":"NIFTY","expiry":"24SEP2026","strike":"2500000.000000","lotsize":"25","instrumenttype":"OPTIDX","exch_seg":"NFO","tick_size":"5.000000"},
		{"token":"999","symbol":"CRUDEOIL","name":"CRUDEOIL","expiry":"","strike":"-1.000000","lotsize":"100","instrumenttype":"","exch_seg":"MCX","tick_size":"1.000000"}
	]`

	svc := NewService(nil) // in-memory test without DB writes
	stats, err := svc.SyncFromReader(t.Context(), strings.NewReader(mockJSON), SyncOptions{BatchSize: 2})
	if err != nil {
		t.Fatalf("unexpected error in SyncFromReader: %v", err)
	}

	if stats.TotalProcessed != 5 {
		t.Errorf("expected 5 total processed, got %d", stats.TotalProcessed)
	}
	if stats.TotalUpserted != 4 {
		t.Errorf("expected 4 total upserted, got %d", stats.TotalUpserted)
	}
	if stats.TotalSkipped != 1 {
		t.Errorf("expected 1 total skipped (MCX), got %d", stats.TotalSkipped)
	}
}
