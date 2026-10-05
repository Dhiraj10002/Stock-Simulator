// Package product contains product-specific simulator rules. It deliberately
// has no database or HTTP dependencies so order execution can use it without
// coupling delivery settlement to MIS/F&O policy.
package product

import (
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
)

const (
	InstrumentFuture = "FUTURE"
	InstrumentOption = "OPTION"

	// MarginDisclosure provides explicit regulatory and model clarification for simulated margin.
	MarginDisclosure = "Simulated Margin Model: Margin requirements are calculated based on simulator parameters and do not represent broker SPAN + Exposure margin."
)

type Rules struct {
	MISLeverage             int64
	FuturesMarginPercent    int64
	OptionSellMarginPercent int64
}

// MarginDisclosure returns the official simulator margin policy disclosure.
func (r Rules) MarginDisclosure() string {
	return MarginDisclosure
}

func FromConfig(cfg *config.Config) Rules {
	if cfg == nil {
		return Rules{MISLeverage: 5, FuturesMarginPercent: 20, OptionSellMarginPercent: 30}
	}
	mis := cfg.MISLeverage
	if mis <= 0 {
		mis = 5
	}
	fut := cfg.FuturesMarginPercent
	if fut <= 0 {
		fut = 20
	}
	opt := cfg.OptionSellMarginPercent
	if opt <= 0 {
		opt = 30
	}
	return Rules{MISLeverage: mis, FuturesMarginPercent: fut, OptionSellMarginPercent: opt}
}

func (r Rules) Margin(product, instrumentType, side string, notional int64) (int64, error) {
	if notional <= 0 {
		return 0, fmt.Errorf("position notional must be positive")
	}
	switch product {
	case model.OrderProductIntraday:
		if r.MISLeverage <= 0 {
			return 0, fmt.Errorf("MIS leverage must be positive")
		}
		return notional / r.MISLeverage, nil
	case model.OrderProductFNO:
		switch instrumentType {
		case InstrumentFuture:
			return percentage(notional, r.FuturesMarginPercent)
		case InstrumentOption:
			if side == model.OrderSideBuy {
				return notional, nil // long option premium payable
			}
			return percentage(notional, r.OptionSellMarginPercent)
		default:
			return 0, fmt.Errorf("unsupported F&O instrument type")
		}
	default:
		return 0, fmt.Errorf("unsupported margin product")
	}
}

func ValidateMISOrder(now time.Time) error {
	return calendar.ValidateMISCutoff(now)
}

func ValidateFNOInstrument(instrument model.Instrument, quantity int64) (string, error) {
	if quantity <= 0 || instrument.LotSize <= 0 || quantity%instrument.LotSize != 0 {
		return "", fmt.Errorf("F&O quantity must be an exact multiple of instrument lot size %d", instrument.LotSize)
	}
	underlying := strings.TrimSpace(instrument.UnderlyingSymbol)
	if underlying == "" {
		underlying = strings.TrimSpace(instrument.Name)
	}
	if underlying == "" {
		return "", fmt.Errorf("F&O instrument has no explicit underlying symbol")
	}
	kind := classifyInstrument(instrument.InstrumentType)
	if kind == "" {
		return "", fmt.Errorf("unsupported F&O instrument type %q", instrument.InstrumentType)
	}
	return kind, nil
}

func classifyInstrument(instrumentType string) string {
	upper := strings.ToUpper(strings.TrimSpace(instrumentType))
	switch {
	case strings.Contains(upper, "FUT"):
		return InstrumentFuture
	case strings.Contains(upper, "OPT"):
		return InstrumentOption
	default:
		return ""
	}
}

func percentage(notional, percent int64) (int64, error) {
	if percent <= 0 || percent > 100 || notional > math.MaxInt64/percent {
		return 0, fmt.Errorf("invalid margin percentage")
	}
	return notional * percent / 100, nil
}

// IsSupportedTradingInstrument is independent of imported/legacy tradability flags.
func IsSupportedTradingInstrument(instrument model.Instrument) bool {
	segment := strings.ToUpper(strings.TrimSpace(instrument.ExchangeSegment))
	if segment == "" {
		segment = strings.ToUpper(strings.TrimSpace(instrument.Exchange))
	}
	kind := strings.ToUpper(strings.TrimSpace(instrument.InstrumentType))
	if kind == "INDEX" || kind == "AMXIDX" || strings.HasPrefix(instrument.Token, "999") {
		return false
	}
	if classifyInstrument(kind) != "" {
		return segment == "NFO"
	}
	return segment == "NSE" && (kind == "" || kind == "EQ" || kind == "EQUITY")
}

// ValidateNewInstrument also rejects retired legacy rows without a snapshot version.
// Managed position exits bypass this opening policy, while retaining product validation.
func ValidateNewInstrument(instrument model.Instrument, orderProduct string) error {
	if !IsSupportedTradingInstrument(instrument) {
		return fmt.Errorf("instrument %q is not tradable; only NSE equities and NFO derivatives are supported", instrument.Symbol)
	}
	if !instrument.Active || !instrument.IsTradable {
		return fmt.Errorf("instrument %q is retired or not tradable", instrument.Symbol)
	}
	return ValidateInstrumentProduct(instrument, orderProduct)
}

// ValidateInstrumentProduct keeps cash indices view-only and derivatives out of cash products.
func ValidateInstrumentProduct(instrument model.Instrument, orderProduct string) error {
	kind := strings.ToUpper(strings.TrimSpace(instrument.InstrumentType))
	if kind == "INDEX" || kind == "AMXIDX" || strings.HasPrefix(instrument.Token, "999") {
		return fmt.Errorf("cash indices are view-only; trade an eligible ETF or derivative contract")
	}
	derivative := classifyInstrument(kind) != ""
	if derivative && orderProduct != model.OrderProductFNO {
		return fmt.Errorf("derivative contracts require FNO product")
	}
	if !derivative && orderProduct == model.OrderProductFNO {
		return fmt.Errorf("FNO product requires a derivative contract")
	}
	return nil
}
