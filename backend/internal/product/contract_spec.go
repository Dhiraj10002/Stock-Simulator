package product

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
)

// ContractSpec defines simulation defaults for an F&O underlying.
type ContractSpec struct {
	UnderlyingSymbol string
	LotSize          int64
	StrikeStep       int64
	TickSize         string
	DefaultSpotPaise int64
}

// StandardContractSpecs supplies simulation defaults. Live trading must use
// the lot size and tick size on the canonical broker instrument.
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

// GetContractSpec retrieves a simulation specification for an underlying.
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

// Synthetic contracts are simulation fixtures, never authoritative live instruments.
var datedContract = regexp.MustCompile(`^([A-Z&]+)([0-9]{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)([0-9]{2})(FUT|[0-9]+(?:\.[0-9]+)?(?:CE|PE))$`)
var legacyFuture = regexp.MustCompile(`^([A-Z&]+)([0-9]{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)FUT$`)
var spacedContract = regexp.MustCompile(`^([A-Z&]+) (?:([A-Z]{3}) )?(FUT|[0-9]+(?:\.[0-9]+)? (?:CE|PE))$`)

func ParseContractExpiry(value string) (time.Time, error) {
	for _, layout := range []string{"2006-01-02", "02Jan2006", "02-Jan-2006"} {
		if d, err := time.ParseInLocation(layout, strings.TrimSpace(value), calendar.Location()); err == nil {
			return time.Date(d.Year(), d.Month(), d.Day(), 15, 30, 0, 0, d.Location()), nil
		}
	}
	return time.Time{}, fmt.Errorf("invalid contract expiry %q", value)
}

// ParseSyntheticFNOContract accepts dated exchange symbols or explicitly spaced
// simulation symbols. Undated simulation symbols use a rolling 30-day expiry.
func ParseSyntheticFNOContract(symbol string) (*model.Instrument, error) {
	clean := strings.ToUpper(strings.TrimSpace(symbol))
	underlying, suffix := "", ""
	var expiry time.Time
	if m := datedContract.FindStringSubmatch(clean); m != nil {
		underlying, suffix = m[1], m[5]
		var err error
		expiry, err = time.ParseInLocation("02Jan06", m[2]+m[3]+m[4], calendar.Location())
		if err != nil {
			return nil, fmt.Errorf("invalid contract date: %w", err)
		}
	} else if m := legacyFuture.FindStringSubmatch(clean); m != nil {
		underlying, suffix = m[1], "FUT"
		var err error
		expiry, err = time.ParseInLocation("02Jan2006", m[2]+m[3]+strconv.Itoa(time.Now().In(calendar.Location()).Year()), calendar.Location())
		if err != nil {
			return nil, err
		}
	} else if m := spacedContract.FindStringSubmatch(clean); m != nil {
		underlying, suffix = m[1], strings.ReplaceAll(m[3], " ", "")
		expiry = time.Now().In(calendar.Location()).AddDate(0, 0, 30)
		if m[2] != "" {
			month, err := time.Parse("Jan", m[2])
			if err != nil {
				return nil, err
			}
			year := time.Now().In(calendar.Location()).Year()
			expiry = time.Date(year, month.Month()+1, 0, 15, 30, 0, 0, calendar.Location())
			if expiry.Before(time.Now()) {
				expiry = expiry.AddDate(1, 0, 0)
			}
		}
	} else {
		return nil, fmt.Errorf("symbol %q is not a recognized synthetic F&O contract", symbol)
	}
	spec, ok := GetContractSpec(underlying)
	if !ok {
		return nil, fmt.Errorf("no simulation specification for %s", underlying)
	}
	instType, optionType, strike := "FUTSTK", "", float64(0)
	isIndex := underlying == "NIFTY" || underlying == "BANKNIFTY" || underlying == "FINNIFTY" || underlying == "MIDCPNIFTY" || underlying == "SENSEX"
	if isIndex {
		instType = "FUTIDX"
	}
	if suffix != "FUT" {
		optionType = suffix[len(suffix)-2:]
		var err error
		strike, err = strconv.ParseFloat(suffix[:len(suffix)-2], 64)
		if err != nil || strike <= 0 {
			return nil, fmt.Errorf("invalid option strike")
		}
		instType = "OPTSTK"
		if isIndex {
			instType = "OPTIDX"
		}
	}
	return &model.Instrument{Symbol: clean, DisplaySymbol: clean, Name: underlying,
		Underlying: underlying, UnderlyingSymbol: underlying, Exchange: "NFO", ExchangeSegment: "NFO",
		Token: "SYNTH_" + clean, InstrumentType: instType, Expiry: expiry.Format("2006-01-02"),
		Strike: fmt.Sprintf("%.6f", strike), OptionType: optionType, LotSize: spec.LotSize, TickSize: spec.TickSize, Active: true}, nil
}

func IsSyntheticContract(symbol string) bool {
	_, err := ParseSyntheticFNOContract(symbol)
	return err == nil
}
