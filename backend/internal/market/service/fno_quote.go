package service

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/fno/greeks"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/product"
)

// knownUnderlyings is sorted by length descending so the longest prefix matches first.
var knownUnderlyings = []string{
	"MIDCPNIFTY", "BANKNIFTY", "FINNIFTY", "TATAMOTORS", "RELIANCE",
	"BAJFINANCE", "BHARTIARTL", "HDFCBANK", "ICICIBANK", "KOTAKBANK",
	"AXISBANK", "TATACHEM", "TATAPOWER", "SENSEX", "NIFTY",
	"SUZLON", "ZOMATO", "APARINDS", "ETERNAL", "PRAJIND", "TRENT",
	"MARUTI", "ADANIENT", "YESBANK", "BEL", "SBIN", "INFY", "TCS",
	"ITC", "DLF", "KEI", "WIPRO", "HDFC", "LT",
}

var (
	futRegex = regexp.MustCompile(`^([A-Z&]+?)(\d{1,2})?([A-Z]{3})(\d{2})?FUT$`)
	optRegex = regexp.MustCompile(`^([A-Z&]+?)(\d{1,2})?([A-Z]{3})(\d{2})?(\d+(?:\.\d+)?)(CE|PE)$`)
)

// DerivativeInfo holds parsed components of an F&O derivative symbol.
type DerivativeInfo struct {
	Underlying string
	IsFuture   bool
	IsOption   bool
	IsCall     bool // only valid when IsOption == true
	Strike     float64
	Expiry     string // raw month code e.g. "SEP"
}

// ParseDerivativeSymbol extracts underlying, strike, option type from an F&O symbol.
// Returns nil if the symbol is not a recognized derivative format.
func ParseDerivativeSymbol(symbol string) *DerivativeInfo {
	clean := strings.ToUpper(strings.TrimSpace(symbol))
	if clean == "" {
		return nil
	}

	// 1. Futures: e.g. TCS29SEP26FUT, NIFTY26SEPFUT
	if m := futRegex.FindStringSubmatch(clean); len(m) > 0 {
		return &DerivativeInfo{
			Underlying: m[1],
			IsFuture:   true,
			Expiry:     m[3],
		}
	}

	// 2. Options: e.g. TCS29SEP261940CE, NIFTY06OCT2625550CE
	if m := optRegex.FindStringSubmatch(clean); len(m) > 0 {
		strike, _ := strconv.ParseFloat(m[5], 64)
		return &DerivativeInfo{
			Underlying: m[1],
			IsOption:   true,
			IsCall:     m[6] == "CE",
			Strike:     strike,
			Expiry:     m[3],
		}
	}

	// 3. Spaced format: "TCS 4150 CE", "NIFTY 25000 PE", "TCS SEP FUT"
	parts := strings.Fields(clean)
	if len(parts) >= 2 {
		underlying := parts[0]
		// Check if the underlying is known
		foundUnderlying := false
		for _, u := range knownUnderlyings {
			if underlying == u {
				foundUnderlying = true
				break
			}
		}
		if !foundUnderlying {
			return nil
		}

		lastPart := parts[len(parts)-1]
		if lastPart == "FUT" {
			return &DerivativeInfo{
				Underlying: underlying,
				IsFuture:   true,
			}
		}
		if lastPart == "CE" || lastPart == "PE" {
			strike := float64(0)
			for _, p := range parts[1 : len(parts)-1] {
				if s, err := strconv.ParseFloat(p, 64); err == nil && s > 0 {
					strike = s
					break
				}
			}
			return &DerivativeInfo{
				Underlying: underlying,
				IsOption:   true,
				IsCall:     lastPart == "CE",
				Strike:     strike,
			}
		}
	}

	return nil
}

// DerivedFNOQuote computes a synthetic F&O quote by:
// 1. Parsing the derivative symbol to extract underlying, strike, option type
// 2. Fetching the underlying's live quote from Redis
// 3. Computing the derivative price using Black-Scholes (options) or underlying price (futures)
// 4. In SYNTHETIC mode, seeding the computed quote into Redis for subsequent lookups
//
// Returns nil, ErrQuoteNotFound if the symbol is not a derivative or no underlying quote exists.
func (s *Service) DerivedFNOQuote(symbol string) (*dto.QuoteResponse, error) {
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	if symbol == "" {
		return nil, fmt.Errorf("symbol is required")
	}

	info := ParseDerivativeSymbol(symbol)
	if info == nil {
		return nil, ErrQuoteNotFound
	}

	// Get the underlying's quote
	underlyingQuote, err := s.CurrentQuote(info.Underlying)
	if err != nil || underlyingQuote == nil || underlyingQuote.PricePaise <= 0 {
		// Try with the spec's default spot price
		spec, hasSpec := product.GetContractSpec(info.Underlying)
		if !hasSpec || spec.DefaultSpotPaise <= 0 {
			return nil, ErrQuoteNotFound
		}
		// Use default spot for pricing only
		spotPaise := spec.DefaultSpotPaise
		return s.computeDerivativeQuote(symbol, info, spotPaise, "")
	}

	return s.computeDerivativeQuote(symbol, info, underlyingQuote.PricePaise, underlyingQuote.Source)
}

func (s *Service) computeDerivativeQuote(symbol string, info *DerivativeInfo, spotPaise int64, underlyingSource string) (*dto.QuoteResponse, error) {
	spotRupees := float64(spotPaise) / 100.0
	mode := s.FeedMode()

	if info.IsFuture {
		// Futures price ≈ spot price (cost-of-carry is small for near-term)
		futurePaise := spotPaise
		source := "fno_engine"
		if mode == dto.FeedModeLive || underlyingSource == string(dto.QuoteSourceAngelOneLive) {
			source = string(dto.QuoteSourceAngelOneLive)
		}

		quote := &dto.QuoteResponse{
			Symbol:        symbol,
			PricePaise:    futurePaise,
			ChangePaise:   0,
			ChangePercent: 0,
			Volume:        100000,
			Source:        source,
			UpdatedAt:     time.Now().Format(time.RFC3339),
		}

		// In SYNTHETIC mode, seed to Redis for subsequent lookups
		if mode == dto.FeedModeSynthetic && s != nil {
			_ = s.SetQuote(symbol, futurePaise, 100000)
		}

		return quote, nil
	}

	if info.IsOption {
		if info.Strike <= 0 {
			return nil, fmt.Errorf("cannot price option without strike")
		}

		// Black-Scholes pricing
		strikeRupees := info.Strike
		timeYears := 7.0 / 365.0 // default ~1 week to expiry

		// Try to parse actual expiry to get better time estimate
		if info.Expiry != "" {
			timeYears = estimateTimeToExpiry(info.Expiry)
		}

		rate := 0.065 // 6.5% risk-free rate (India T-bill rate)
		baseVol := 0.15
		if info.Underlying == "BANKNIFTY" {
			baseVol = 0.18
		}

		moneyness := math.Abs(strikeRupees-spotRupees) / spotRupees
		vol := baseVol + moneyness*0.10

		result := greeks.CalculateGreeks(spotRupees, strikeRupees, timeYears, rate, vol, info.IsCall)
		pricePaise := int64(math.Round(result.Price * 100))
		if pricePaise < 5 {
			pricePaise = 5 // minimum tick
		}

		source := "fno_engine"
		if mode == dto.FeedModeLive || underlyingSource == string(dto.QuoteSourceAngelOneLive) {
			source = string(dto.QuoteSourceAngelOneLive)
		}

		quote := &dto.QuoteResponse{
			Symbol:        symbol,
			PricePaise:    pricePaise,
			ChangePaise:   0,
			ChangePercent: 0,
			Volume:        100000,
			Source:        source,
			UpdatedAt:     time.Now().Format(time.RFC3339),
		}

		// In SYNTHETIC mode, seed to Redis for subsequent lookups
		if mode == dto.FeedModeSynthetic && s != nil {
			_ = s.SetQuote(symbol, pricePaise, 100000)
		}

		return quote, nil
	}

	return nil, ErrQuoteNotFound
}

// estimateTimeToExpiry converts a month code to approximate time-to-expiry in years.
func estimateTimeToExpiry(monthCode string) float64 {
	months := map[string]time.Month{
		"JAN": time.January, "FEB": time.February, "MAR": time.March,
		"APR": time.April, "MAY": time.May, "JUN": time.June,
		"JUL": time.July, "AUG": time.August, "SEP": time.September,
		"OCT": time.October, "NOV": time.November, "DEC": time.December,
	}

	targetMonth, ok := months[strings.ToUpper(monthCode)]
	if !ok {
		return 7.0 / 365.0
	}

	now := time.Now()
	// Find the last Thursday of the target month (typical F&O expiry)
	targetYear := now.Year()
	if targetMonth < now.Month() || (targetMonth == now.Month() && now.Day() > 28) {
		targetYear++
	}

	// Last Thursday of the month
	lastDay := time.Date(targetYear, targetMonth+1, 0, 15, 30, 0, 0, time.FixedZone("IST", 5*3600+30*60))
	for lastDay.Weekday() != time.Thursday {
		lastDay = lastDay.AddDate(0, 0, -1)
	}

	diff := lastDay.Sub(now)
	if diff <= 0 {
		return 1.0 / 365.0 // minimum 1 day
	}

	years := diff.Hours() / (24 * 365)
	if years < 1.0/365.0 {
		years = 1.0 / 365.0
	}
	return years
}
