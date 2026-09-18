package service

import (
	"testing"

	"github.com/google/uuid"
)

func TestCalculateCharges_DeliveryEquity(t *testing.T) {
	// Buy 100 shares of RELIANCE at ₹2,500 (Turnover: ₹2,50,000 = 25,000,000 paise)
	charges := CalculateCharges("RELIANCE", "BUY", "DELIVERY", 100, 250000)

	// Delivery brokerage should be ₹0
	if charges.BrokeragePaise != 0 {
		t.Errorf("expected 0 delivery brokerage, got %d paise", charges.BrokeragePaise)
	}

	// STT: 0.1% of 25,000,000 = 25,000 paise (₹250)
	if charges.SttPaise != 25000 {
		t.Errorf("expected 25000 paise STT, got %d", charges.SttPaise)
	}

	// Stamp Duty: 0.015% of 25,000,000 = 3,750 paise (₹37.50)
	if charges.StampDutyPaise != 3750 {
		t.Errorf("expected 3750 paise stamp duty, got %d", charges.StampDutyPaise)
	}

	// Exchange Txn: ~0.00297%
	if charges.ExchangeTxnPaise <= 0 {
		t.Errorf("expected positive exchange txn charges, got %d", charges.ExchangeTxnPaise)
	}

	// GST: 18% of taxable services (exchange + sebi)
	if charges.GstPaise <= 0 {
		t.Errorf("expected positive GST, got %d", charges.GstPaise)
	}

	if charges.TotalTaxChargesPaise != charges.BrokeragePaise+charges.SttPaise+charges.ExchangeTxnPaise+charges.SebiChargesPaise+charges.StampDutyPaise+charges.GstPaise {
		t.Errorf("sum of charges breakdown does not match TotalTaxChargesPaise")
	}
}

func TestCalculateCharges_IntradayEquity(t *testing.T) {
	// Sell 100 shares of INFY at ₹1,500 (Turnover: ₹1,50,000 = 15,000,000 paise)
	charges := CalculateCharges("INFY", "SELL", "INTRADAY", 100, 150000)

	// Intraday brokerage: min(₹20, 0.03% of 1,50,000 = ₹45) -> capped at ₹20 = 2000 paise
	if charges.BrokeragePaise != 2000 {
		t.Errorf("expected 2000 paise (₹20) brokerage, got %d", charges.BrokeragePaise)
	}

	// Intraday STT on sell: 0.025% of 15,000,000 = 3,750 paise (₹37.50)
	if charges.SttPaise != 3750 {
		t.Errorf("expected 3750 paise STT, got %d", charges.SttPaise)
	}

	// Stamp duty on sell should be 0
	if charges.StampDutyPaise != 0 {
		t.Errorf("expected 0 stamp duty on sell, got %d", charges.StampDutyPaise)
	}

	// GST must be 18% on (brokerage + exchange + sebi)
	if charges.GstPaise < 360 { // at least 18% of ₹20 = ₹3.60 = 360 paise
		t.Errorf("expected at least 360 paise GST, got %d", charges.GstPaise)
	}
}

func TestCalculateCharges_FNOOptions(t *testing.T) {
	// Buy 25 units (1 lot) of NIFTY 24000 CE at ₹100 premium (Turnover: ₹2,500 = 250,000 paise)
	chargesBuy := CalculateCharges("NIFTY24DEC24000CE", "BUY", "FNO", 25, 10000)

	// F&O flat brokerage: ₹20 = 2000 paise
	if chargesBuy.BrokeragePaise != 2000 {
		t.Errorf("expected 2000 paise F&O brokerage, got %d", chargesBuy.BrokeragePaise)
	}

	// Options STT on Buy should be 0
	if chargesBuy.SttPaise != 0 {
		t.Errorf("expected 0 STT on option buy, got %d", chargesBuy.SttPaise)
	}

	// Stamp duty on option buy: 0.003% of 250,000 = 8 paise
	if chargesBuy.StampDutyPaise != 8 {
		t.Errorf("expected 8 paise stamp duty, got %d", chargesBuy.StampDutyPaise)
	}

	// Sell the same option: STT applies on sell
	chargesSell := CalculateCharges("NIFTY24DEC24000CE", "SELL", "FNO", 25, 10000)
	// STT on option sell: 0.1% of 250,000 = 250 paise (₹2.50)
	if chargesSell.SttPaise != 250 {
		t.Errorf("expected 250 paise STT on option sell, got %d", chargesSell.SttPaise)
	}
}

func TestReportsService_GetContractNote_Empty(t *testing.T) {
	svc := New()
	userUUID := uuid.NewString()

	resp, err := svc.GetContractNote(userUUID, "2026-09-18")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.TradeDate != "2026-09-18" {
		t.Errorf("expected trade date 2026-09-18, got %s", resp.TradeDate)
	}
	if resp.Exchange != "NSE / NFO" {
		t.Errorf("expected exchange NSE / NFO, got %s", resp.Exchange)
	}
	if resp.ContractNoteNumber == "" {
		t.Errorf("expected non-empty contract note number")
	}
}
