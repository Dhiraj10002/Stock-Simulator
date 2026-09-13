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
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
)

const (
	InstrumentFuture = "FUTURE"
	InstrumentOption = "OPTION"
)

type Rules struct {
	MISLeverage             int64
	FuturesMarginPercent    int64
	OptionSellMarginPercent int64
}

func FromConfig(cfg *config.Config) Rules {
	return Rules{MISLeverage: cfg.MISLeverage, FuturesMarginPercent: cfg.FuturesMarginPercent, OptionSellMarginPercent: cfg.OptionSellMarginPercent}
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
	ist, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		return err
	}
	local := now.In(ist)
	cutoff := time.Date(local.Year(), local.Month(), local.Day(), 15, 20, 0, 0, ist)
	if !local.Before(cutoff) {
		return fmt.Errorf("MIS orders are not accepted after 15:20 IST")
	}
	return nil
}

func ValidateFNOInstrument(instrument model.Instrument, quantity int64) (string, error) {
	if quantity <= 0 || instrument.LotSize <= 0 || quantity%instrument.LotSize != 0 {
		return "", fmt.Errorf("F&O quantity must be an exact multiple of instrument lot size %d", instrument.LotSize)
	}
	if strings.TrimSpace(instrument.UnderlyingSymbol) == "" {
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
