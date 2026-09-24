package product

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
)

// ContractSpec defines authoritative trading specifications for an F&O underlying.
type ContractSpec struct {
	UnderlyingSymbol string
	LotSize          int64
	StrikeStep       int64
	TickSize         string
	DefaultSpotPaise int64
}

// StandardContractSpecs defines authoritative contract specifications matching
// Indian exchange standards (NSE/BSE).
var StandardContractSpecs = map[string]ContractSpec{
	"NIFTY":      {UnderlyingSymbol: "NIFTY", LotSize: 25, StrikeStep: 50, TickSize: "0.05", DefaultSpotPaise: 2532000},
	"BANKNIFTY":  {UnderlyingSymbol: "BANKNIFTY", LotSize: 15, StrikeStep: 100, TickSize: "0.05", DefaultSpotPaise: 5215000},
	"FINNIFTY":   {UnderlyingSymbol: "FINNIFTY", LotSize: 25, StrikeStep: 50, TickSize: "0.05", DefaultSpotPaise: 2350000},
	"MIDCPNIFTY": {UnderlyingSymbol: "MIDCPNIFTY", LotSize: 50, StrikeStep: 25, TickSize: "0.05", DefaultSpotPaise: 1250000},
	"SENSEX":     {UnderlyingSymbol: "SENSEX", LotSize: 10, StrikeStep: 100, TickSize: "0.05", DefaultSpotPaise: 8150000},
	"RELIANCE":   {UnderlyingSymbol: "RELIANCE", LotSize: 250, StrikeStep: 20, TickSize: "0.05", DefaultSpotPaise: 124400},
	"TCS":        {UnderlyingSymbol: "TCS", LotSize: 175, StrikeStep: 50, TickSize: "0.05", DefaultSpotPaise: 219000},
	"INFY":       {UnderlyingSymbol: "INFY", LotSize: 400, StrikeStep: 20, TickSize: "0.05", DefaultSpotPaise: 105800},
	"HDFCBANK":   {UnderlyingSymbol: "HDFCBANK", LotSize: 550, StrikeStep: 20, TickSize: "0.05", DefaultSpotPaise: 71300},
	"TATAMOTORS": {UnderlyingSymbol: "TATAMOTORS", LotSize: 575, StrikeStep: 10, TickSize: "0.05", DefaultSpotPaise: 98000},
	"SBIN":       {UnderlyingSymbol: "SBIN", LotSize: 750, StrikeStep: 10, TickSize: "0.05", DefaultSpotPaise: 81000},
}

// GetContractSpec retrieves the authoritative contract spec for an underlying symbol.
func GetContractSpec(symbol string) (ContractSpec, bool) {
	clean := strings.ToUpper(strings.TrimSpace(symbol))
	spec, ok := StandardContractSpecs[clean]
	return spec, ok
}

// ResolveContractLotSize resolves the authoritative lot size for a contract.
// If an instrument record from the database is available with a positive lot size,
// its lot size takes precedence. Otherwise, the standard spec lot size is used,
// falling back to 1 for standard equity.
func ResolveContractLotSize(symbol string, inst *model.Instrument) int64 {
	if inst != nil && inst.LotSize > 0 {
		return inst.LotSize
	}
	clean := strings.ToUpper(strings.TrimSpace(symbol))
	if spec, ok := StandardContractSpecs[clean]; ok && spec.LotSize > 0 {
		return spec.LotSize
	}
	return 1
}

// ValidateTickSize validates that an order price in paise is an exact multiple
// of the instrument's tick size (typically ₹0.05 = 5 paise in Indian exchanges).
func ValidateTickSize(pricePaise int64, tickSizeStr string) error {
	if pricePaise <= 0 {
		return nil
	}
	tickSizePaise := int64(5) // Default: 5 paise (₹0.05)
	if tickSizeStr != "" {
		if f, err := strconv.ParseFloat(strings.TrimSpace(tickSizeStr), 64); err == nil && f > 0 {
			if f <= 0.5 {
				tickSizePaise = int64(math.Round(f * 100))
			} else {
				tickSizePaise = int64(math.Round(f))
			}
		}
	}
	if tickSizePaise <= 0 {
		tickSizePaise = 5
	}
	if pricePaise%tickSizePaise != 0 {
		return fmt.Errorf("price %d paise (₹%.2f) must be a multiple of tick size %d paise (₹%.2f)",
			pricePaise, float64(pricePaise)/100, tickSizePaise, float64(tickSizePaise)/100)
	}
	return nil
}

// ParseSyntheticFNOContract parses a synthetic derivative symbol into a canonical model.Instrument.
// It supports Indian exchange standard naming for both Futures (e.g. "NIFTY24SEPFUT", "NIFTY SEP FUT", "RELIANCE FUT")
// and Options (e.g. "NIFTY 25000 CE", "NIFTY 25000 PE", "BANKNIFTY 52000 CE", "RELIANCE 1240 PE", "NIFTY24SEP25000CE").
func ParseSyntheticFNOContract(symbol string) (*model.Instrument, error) {
	clean := strings.ToUpper(strings.TrimSpace(symbol))
	if clean == "" {
		return nil, fmt.Errorf("empty symbol")
	}

	// 1. Identify underlying by greedy prefix matching against known underlyings
	known := []string{
		"MIDCPNIFTY", "BANKNIFTY", "FINNIFTY", "TATAMOTORS", "RELIANCE",
		"BAJFINANCE", "BHARTIARTL", "HDFCBANK", "ICICIBANK", "KOTAKBANK",
		"AXISBANK", "TATACHEM", "TATAPOWER", "SENSEX", "NIFTY",
		"SUZLON", "ZOMATO", "APARINDS", "ETERNAL", "PRAJIND", "TRENT",
		"MARUTI", "ADANIENT", "YESBANK", "BEL", "SBIN", "INFY", "TCS",
	}

	underlying := ""
	for _, u := range known {
		if strings.HasPrefix(clean, u) {
			underlying = u
			break
		}
	}
	if underlying == "" {
		parts := strings.Fields(clean)
		if len(parts) >= 2 {
			underlying = parts[0]
		}
	}
	if underlying == "" {
		return nil, fmt.Errorf("cannot identify F&O underlying from symbol %q", symbol)
	}

	spec, hasSpec := GetContractSpec(underlying)
	lotSize := int64(1)
	tickSize := "0.05"
	if hasSpec && spec.LotSize > 0 {
		lotSize = spec.LotSize
		if spec.TickSize != "" {
			tickSize = spec.TickSize
		}
	} else if strings.Contains(clean, "FUT") || strings.Contains(clean, "CE") || strings.Contains(clean, "PE") {
		lotSize = 25
	}

	isIndex := underlying == "NIFTY" || underlying == "BANKNIFTY" || underlying == "FINNIFTY" || underlying == "MIDCPNIFTY" || underlying == "SENSEX"

	// 2. Check for Future contract
	if strings.Contains(clean, "FUT") {
		instType := "FUTSTK"
		if isIndex {
			instType = "FUTIDX"
		}
		disp := clean
		if !strings.Contains(clean, " ") {
			for _, m := range []string{"JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"} {
				if strings.Contains(clean, m) {
					disp = fmt.Sprintf("%s %s FUT", underlying, m)
					break
				}
			}
		}
		return &model.Instrument{
			Symbol:           clean,
			DisplaySymbol:    disp,
			Name:             underlying + " Futures",
			Underlying:       underlying,
			UnderlyingSymbol: underlying,
			Exchange:         "NFO",
			ExchangeSegment:  "NFO",
			Token:            "SYNTH_" + clean,
			InstrumentType:   instType,
			Expiry:           "2026-09-24",
			Strike:           "0.000000",
			OptionType:       "",
			LotSize:          lotSize,
			TickSize:         tickSize,
			Active:           true,
		}, nil
	}

	// 3. Check for Option contract (CE / PE)
	isCE := strings.HasSuffix(clean, "CE") || strings.Contains(clean, " CE")
	isPE := strings.HasSuffix(clean, "PE") || strings.Contains(clean, " PE")
	if isCE || isPE {
		optType := "CE"
		if isPE {
			optType = "PE"
		}
		instType := "OPTSTK"
		if isIndex {
			instType = "OPTIDX"
		}

		strikeVal := float64(0)
		parts := strings.Fields(clean)
		for _, p := range parts {
			if s, err := strconv.ParseFloat(p, 64); err == nil && s > 0 {
				strikeVal = s
				break
			}
		}

		if strikeVal == 0 {
			re := regexp.MustCompile(`(\d+(?:\.\d+)?)(?:CE|PE)$`)
			matches := re.FindStringSubmatch(clean)
			if len(matches) > 1 {
				s, _ := strconv.ParseFloat(matches[1], 64)
				strikeVal = s
			}
		}

		if strikeVal == 0 {
			if spec.DefaultSpotPaise > 0 {
				strikeVal = float64(spec.DefaultSpotPaise) / 100
			} else {
				strikeVal = 1000
			}
		}

		disp := fmt.Sprintf("%s %.0f %s", underlying, strikeVal, optType)

		return &model.Instrument{
			Symbol:           clean,
			DisplaySymbol:    disp,
			Name:             underlying + " " + optType,
			Underlying:       underlying,
			UnderlyingSymbol: underlying,
			Exchange:         "NFO",
			ExchangeSegment:  "NFO",
			Token:            "SYNTH_" + clean,
			InstrumentType:   instType,
			Expiry:           "2026-09-24",
			Strike:           fmt.Sprintf("%.6f", strikeVal),
			OptionType:       optType,
			LotSize:          lotSize,
			TickSize:         tickSize,
			Active:           true,
		}, nil
	}

	return nil, fmt.Errorf("symbol %q is not a recognized synthetic F&O contract", symbol)
}

// IsSyntheticContract checks if a symbol represents an F&O derivative format eligible for synthetic trading.
func IsSyntheticContract(symbol string) bool {
	clean := strings.ToUpper(strings.TrimSpace(symbol))
	return strings.Contains(clean, "FUT") || strings.Contains(clean, "CE") || strings.Contains(clean, "PE")
}
