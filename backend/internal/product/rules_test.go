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
	if _, err := ValidateFNOInstrument(instrument, 75); err != nil {
		t.Fatal(err)
	}
	if _, err := ValidateFNOInstrument(instrument, 50); err == nil {
		t.Fatal("invalid lot multiple was accepted")
	}
	instrument.UnderlyingSymbol = ""
	if _, err := ValidateFNOInstrument(instrument, 75); err == nil {
		t.Fatal("missing explicit underlying was accepted")
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
