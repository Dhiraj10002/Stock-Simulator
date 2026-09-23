package service

import (
	"math"
	"strings"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/reports/dto"
)

// CalculateCharges computes official Indian stock broking charges and regulatory taxes
// for a single trade execution with integer paise precision.
func CalculateCharges(symbol, side, product string, quantity, pricePaise int64) dto.ChargesBreakdown {
	turnoverPaise := quantity * pricePaise
	isBuy := strings.ToUpper(side) == "BUY"
	upperProduct := strings.ToUpper(product)
	upperSymbol := strings.ToUpper(symbol)

	isFno := upperProduct == "FNO" ||
		(upperProduct != "DELIVERY" && upperProduct != "INTRADAY" && (strings.HasSuffix(upperSymbol, "CE") ||
			strings.HasSuffix(upperSymbol, "PE") ||
			strings.HasSuffix(upperSymbol, "FUT") ||
			strings.Contains(upperSymbol, "00CE") ||
			strings.Contains(upperSymbol, "00PE")))

	isOption := isFno && (strings.HasSuffix(upperSymbol, "CE") || strings.HasSuffix(upperSymbol, "PE") || strings.Contains(upperSymbol, "00CE") || strings.Contains(upperSymbol, "00PE"))
	isFuture := isFno && strings.HasSuffix(upperSymbol, "FUT")

	var brokeragePaise int64
	var sttPaise int64
	var exchangeTxnPaise int64
	var sebiChargesPaise int64
	var stampDutyPaise int64

	// 1. Brokerage
	switch {
	case isFno:
		// Flat ₹20 per executed F&O order
		brokeragePaise = 2000
	case upperProduct == "INTRADAY":
		// 0.03% or ₹20 per executed order, whichever is lower
		calc := int64(math.Round(float64(turnoverPaise) * 0.0003))
		if calc > 2000 {
			brokeragePaise = 2000
		} else {
			brokeragePaise = calc
		}
	default: // "DELIVERY"
		// Zero brokerage for delivery equity investments (standard discount broking model)
		brokeragePaise = 0
	}

	// 2. Securities Transaction Tax (STT)
	switch {
	case isOption:
		// 0.1% on sell turnover (on option premium)
		if !isBuy {
			sttPaise = int64(math.Round(float64(turnoverPaise) * 0.001))
		}
	case isFuture:
		// 0.02% on sell turnover
		if !isBuy {
			sttPaise = int64(math.Round(float64(turnoverPaise) * 0.0002))
		}
	case upperProduct == "INTRADAY":
		// 0.025% on sell turnover
		if !isBuy {
			sttPaise = int64(math.Round(float64(turnoverPaise) * 0.00025))
		}
	default: // "DELIVERY"
		// 0.1% on buy and sell
		sttPaise = int64(math.Round(float64(turnoverPaise) * 0.001))
	}

	// 3. Exchange Transaction Charges (NSE)
	switch {
	case isOption:
		// 0.035% of premium turnover
		exchangeTxnPaise = int64(math.Round(float64(turnoverPaise) * 0.00035))
	case isFuture:
		// 0.00173% of turnover
		exchangeTxnPaise = int64(math.Round(float64(turnoverPaise) * 0.0000173))
	default:
		// Equity (NSE): 0.00297% (approx 0.003%)
		exchangeTxnPaise = int64(math.Round(float64(turnoverPaise) * 0.0000297))
	}

	// 4. SEBI Turnover Charges: ₹10 per crore (0.0001% of turnover)
	sebiChargesPaise = int64(math.Round(float64(turnoverPaise) * 0.000001))

	// 5. Stamp Duty (State Government - levied on BUY orders only)
	if isBuy {
		switch {
		case isOption:
			// 0.003% (₹300 per crore)
			stampDutyPaise = int64(math.Round(float64(turnoverPaise) * 0.00003))
		case isFuture:
			// 0.002% (₹200 per crore)
			stampDutyPaise = int64(math.Round(float64(turnoverPaise) * 0.00002))
		case upperProduct == "INTRADAY":
			// 0.003% (₹300 per crore)
			stampDutyPaise = int64(math.Round(float64(turnoverPaise) * 0.00003))
		default: // "DELIVERY"
			// 0.015% (₹1,500 per crore)
			stampDutyPaise = int64(math.Round(float64(turnoverPaise) * 0.00015))
		}
	}

	// 6. GST (Goods & Services Tax): 18% on (Brokerage + Exchange Txn + SEBI)
	taxableServicesPaise := brokeragePaise + exchangeTxnPaise + sebiChargesPaise
	gstPaise := int64(math.Round(float64(taxableServicesPaise) * 0.18))

	totalChargesPaise := brokeragePaise + sttPaise + exchangeTxnPaise + sebiChargesPaise + stampDutyPaise + gstPaise

	return dto.ChargesBreakdown{
		BrokeragePaise:       brokeragePaise,
		SttPaise:             sttPaise,
		ExchangeTxnPaise:     exchangeTxnPaise,
		SebiChargesPaise:     sebiChargesPaise,
		StampDutyPaise:       stampDutyPaise,
		GstPaise:             gstPaise,
		TotalTaxChargesPaise: totalChargesPaise,
	}
}
