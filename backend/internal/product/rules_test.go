package product

import (
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
)

func TestMarginRules(t *testing.T) {
	rules := Rules{MISLeverage: 5, FuturesMarginPercent: 20, OptionSellMarginPercent: 30}
	for _, test := range []struct {
		product, instrumentType, side string
		want                          int64
	}{
		{model.OrderProductIntraday, "", model.OrderSideBuy, 20_000},
		{model.OrderProductFNO, InstrumentFuture, model.OrderSideBuy, 20_000},
		{model.OrderProductFNO, InstrumentOption, model.OrderSideBuy, 100_000},
		{model.OrderProductFNO, InstrumentOption, model.OrderSideSell, 30_000},
	} {
		got, err := rules.Margin(test.product, test.instrumentType, test.side, 100_000)
		if err != nil || got != test.want {
			t.Fatalf("Margin(%s, %s, %s) = (%d, %v), want (%d, nil)", test.product, test.instrumentType, test.side, got, err, test.want)
		}
	}
}

func TestFNOInstrumentRequiresExplicitUnderlyingAndLot(t *testing.T) {
	instrument := model.Instrument{LotSize: 75, InstrumentType: "OPTIDX", UnderlyingSymbol: "NIFTY"}
	
	// Valid multiples of lot size
	for _, qty := range []int64{75, 150, 300} {
		kind, err := ValidateFNOInstrument(instrument, qty)
		if err != nil || kind != InstrumentOption {
			t.Fatalf("ValidateFNOInstrument for qty %d: got (%q, %v), want (%q, nil)", qty, kind, err, InstrumentOption)
		}
	}

	// Invalid lot multiples
	for _, qty := range []int64{0, -75, 50, 100, 149} {
		if _, err := ValidateFNOInstrument(instrument, qty); err == nil {
			t.Fatalf("invalid lot quantity %d was unexpectedly accepted", qty)
		}
	}

	// Zero or negative lot size
	invalidLotInst := model.Instrument{LotSize: 0, InstrumentType: "OPTIDX", UnderlyingSymbol: "NIFTY"}
	if _, err := ValidateFNOInstrument(invalidLotInst, 75); err == nil {
		t.Fatal("zero lot size was unexpectedly accepted")
	}

	// Underlying symbol resolution: falls back to Name if UnderlyingSymbol is empty
	nameFallbackInst := model.Instrument{LotSize: 75, InstrumentType: "OPTIDX", UnderlyingSymbol: "", Name: "NIFTY"}
	if _, err := ValidateFNOInstrument(nameFallbackInst, 75); err != nil {
		t.Fatalf("underlying name fallback failed: %v", err)
	}

	// Missing both UnderlyingSymbol and Name
	noUnderlyingInst := model.Instrument{LotSize: 75, InstrumentType: "OPTIDX", UnderlyingSymbol: "   ", Name: " "}
	if _, err := ValidateFNOInstrument(noUnderlyingInst, 75); err == nil {
		t.Fatal("missing explicit underlying was accepted")
	}

	// Instrument classification tests
	futInst := model.Instrument{LotSize: 50, InstrumentType: "FUTIDX", UnderlyingSymbol: "BANKNIFTY"}
	if kind, err := ValidateFNOInstrument(futInst, 50); err != nil || kind != InstrumentFuture {
		t.Fatalf("FUTIDX classification: got (%q, %v), want (%q, nil)", kind, err, InstrumentFuture)
	}

	futStk := model.Instrument{LotSize: 250, InstrumentType: "FUTSTK", UnderlyingSymbol: "RELIANCE"}
	if kind, err := ValidateFNOInstrument(futStk, 250); err != nil || kind != InstrumentFuture {
		t.Fatalf("FUTSTK classification: got (%q, %v), want (%q, nil)", kind, err, InstrumentFuture)
	}

	optStk := model.Instrument{LotSize: 250, InstrumentType: "OPTSTK", UnderlyingSymbol: "RELIANCE"}
	if kind, err := ValidateFNOInstrument(optStk, 250); err != nil || kind != InstrumentOption {
		t.Fatalf("OPTSTK classification: got (%q, %v), want (%q, nil)", kind, err, InstrumentOption)
	}

	unknownInst := model.Instrument{LotSize: 25, InstrumentType: "BOND", UnderlyingSymbol: "GOI"}
	if _, err := ValidateFNOInstrument(unknownInst, 25); err == nil {
		t.Fatal("unsupported instrument type BOND was accepted")
	}
}

func TestMarginRules_EdgeCases(t *testing.T) {
	rules := Rules{MISLeverage: 5, FuturesMarginPercent: 20, OptionSellMarginPercent: 30}

	// Zero or negative notional
	if _, err := rules.Margin(model.OrderProductIntraday, "", model.OrderSideBuy, 0); err == nil {
		t.Fatal("zero notional should return error")
	}
	if _, err := rules.Margin(model.OrderProductIntraday, "", model.OrderSideBuy, -100); err == nil {
		t.Fatal("negative notional should return error")
	}

	// Unsupported product
	if _, err := rules.Margin("COMMODITY", "", model.OrderSideBuy, 10000); err == nil {
		t.Fatal("unsupported product should return error")
	}

	// Unsupported FNO instrument type
	if _, err := rules.Margin(model.OrderProductFNO, "SWAP", model.OrderSideBuy, 10000); err == nil {
		t.Fatal("unsupported FNO instrument type should return error")
	}

	// MIS leverage zero or negative
	badRules := Rules{MISLeverage: 0, FuturesMarginPercent: 20, OptionSellMarginPercent: 30}
	if _, err := badRules.Margin(model.OrderProductIntraday, "", model.OrderSideBuy, 10000); err == nil {
		t.Fatal("zero MIS leverage should return error")
	}
}

func TestMISCutoff(t *testing.T) {
	ist, _ := time.LoadLocation("Asia/Kolkata")
	// 2026-09-16 is Wednesday (trading day)
	if err := ValidateMISOrder(time.Date(2026, 9, 16, 15, 19, 59, 0, ist)); err != nil {
		t.Fatal(err)
	}
	if err := ValidateMISOrder(time.Date(2026, 9, 16, 15, 20, 0, 0, ist)); err == nil {
		t.Fatal("MIS order at cutoff was accepted")
	}
	// Sunday (2026-09-13) must be rejected
	if err := ValidateMISOrder(time.Date(2026, 9, 13, 15, 0, 0, 0, ist)); err == nil {
		t.Fatal("MIS order on Sunday was accepted")
	}
}
