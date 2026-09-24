package service

import (
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/alias"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"gorm.io/gorm"
)

// DefaultCanonicalInstruments are the core institutional instruments supported by the platform.
var DefaultCanonicalInstruments = []model.Instrument{
	{ID: 1, Symbol: "RELIANCE", DisplaySymbol: "RELIANCE", Name: "Reliance Industries", Underlying: "RELIANCE", Token: "2885", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 2, Symbol: "TCS", DisplaySymbol: "TCS", Name: "Tata Consultancy Services", Underlying: "TCS", Token: "11536", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 3, Symbol: "INFY", DisplaySymbol: "INFY", Name: "Infosys Ltd", Underlying: "INFY", Token: "1594", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 4, Symbol: "HDFCBANK", DisplaySymbol: "HDFCBANK", Name: "HDFC Bank Ltd", Underlying: "HDFCBANK", Token: "1333", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 5, Symbol: "TATAMOTORS", DisplaySymbol: "TATAMOTORS", Name: "Tata Motors Ltd", Underlying: "TATAMOTORS", Token: "3456", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 6, Symbol: "BHARTIARTL", DisplaySymbol: "BHARTIARTL", Name: "Bharti Airtel Ltd", Underlying: "BHARTIARTL", Token: "10604", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 7, Symbol: "ETERNAL", DisplaySymbol: "ETERNAL", Name: "Eternal Materials", Underlying: "ETERNAL", Token: "5097", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 8, Symbol: "ZOMATO", DisplaySymbol: "ZOMATO", Name: "Zomato Ltd", Underlying: "ZOMATO", Token: "5097", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 9, Symbol: "SUZLON", DisplaySymbol: "SUZLON", Name: "Suzlon Energy Ltd", Underlying: "SUZLON", Token: "772", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 10, Symbol: "TRENT", DisplaySymbol: "TRENT", Name: "Trent Ltd", Underlying: "TRENT", Token: "1964", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 11, Symbol: "ADANIENT", DisplaySymbol: "ADANIENT", Name: "Adani Enterprises Ltd", Underlying: "ADANIENT", Token: "25", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 12, Symbol: "YESBANK", DisplaySymbol: "YESBANK", Name: "Yes Bank Ltd", Underlying: "YESBANK", Token: "11915", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 13, Symbol: "BEL", DisplaySymbol: "BEL", Name: "Bharat Electronics Ltd", Underlying: "BEL", Token: "383", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 14, Symbol: "SBIN", DisplaySymbol: "SBIN", Name: "State Bank of India", Underlying: "SBIN", Token: "3045", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 15, Symbol: "ICICIBANK", DisplaySymbol: "ICICIBANK", Name: "ICICI Bank Ltd", Underlying: "ICICIBANK", Token: "4963", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 16, Symbol: "ATGL", DisplaySymbol: "ATGL", Name: "Adani Total Gas Ltd", Underlying: "ATGL", Token: "14927", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 17, Symbol: "POONAWALLA", DisplaySymbol: "POONAWALLA", Name: "Poonawalla Fincorp", Underlying: "POONAWALLA", Token: "2837", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 18, Symbol: "TATACHEM", DisplaySymbol: "TATACHEM", Name: "Tata Chemicals Ltd", Underlying: "TATACHEM", Token: "3405", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 19, Symbol: "TATAPOWER", DisplaySymbol: "TATAPOWER", Name: "Tata Power Co Ltd", Underlying: "TATAPOWER", Token: "3426", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 20, Symbol: "PRAJIND", DisplaySymbol: "PRAJIND", Name: "Praj Industries Ltd", Underlying: "PRAJIND", Token: "2705", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 21, Symbol: "BAJFINANCE", DisplaySymbol: "BAJFINANCE", Name: "Bajaj Finance Ltd", Underlying: "BAJFINANCE", Token: "317", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 22, Symbol: "AXISBANK", DisplaySymbol: "AXISBANK", Name: "Axis Bank Ltd", Underlying: "AXISBANK", Token: "5900", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 23, Symbol: "KOTAKBANK", DisplaySymbol: "KOTAKBANK", Name: "Kotak Mahindra Bank", Underlying: "KOTAKBANK", Token: "1922", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 24, Symbol: "APARINDS", DisplaySymbol: "APARINDS", Name: "Apar Industries Ltd", Underlying: "APARINDS", Token: "10794", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 25, Symbol: "MARUTI", DisplaySymbol: "MARUTI", Name: "Maruti Suzuki India", Underlying: "MARUTI", Token: "10999", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	// Indices
	{ID: 26, Symbol: "NIFTY", DisplaySymbol: "NIFTY 50", Name: "NIFTY 50", Underlying: "NIFTY", Token: "99926000", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "INDEX", LotSize: 25, TickSize: "0.05", Active: true},
	{ID: 27, Symbol: "BANKNIFTY", DisplaySymbol: "NIFTY BANK", Name: "NIFTY BANK", Underlying: "BANKNIFTY", Token: "99926009", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "INDEX", LotSize: 15, TickSize: "0.05", Active: true},
	{ID: 28, Symbol: "FINNIFTY", DisplaySymbol: "NIFTY FINANCIAL", Name: "NIFTY FINANCIAL SERVICES", Underlying: "FINNIFTY", Token: "99926037", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "INDEX", LotSize: 25, TickSize: "0.05", Active: true},
	{ID: 29, Symbol: "MIDCPNIFTY", DisplaySymbol: "NIFTY MIDCAP SELECT", Name: "NIFTY MIDCAP SELECT", Underlying: "MIDCPNIFTY", Token: "99926074", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "INDEX", LotSize: 50, TickSize: "0.05", Active: true},
	{ID: 30, Symbol: "SENSEX", DisplaySymbol: "BSE SENSEX", Name: "BSE SENSEX", Underlying: "SENSEX", Token: "99919000", Exchange: "BSE", ExchangeSegment: "BSE", InstrumentType: "INDEX", LotSize: 10, TickSize: "0.05", Active: true},
	// Benchmark Derivatives
	{ID: 31, Symbol: "NIFTY24SEPFUT", DisplaySymbol: "NIFTY SEP FUT", Name: "NIFTY 50 Futures", Underlying: "NIFTY", Token: "NFO_NIFTY_FUT", Exchange: "NFO", ExchangeSegment: "NFO", InstrumentType: "FUTIDX", Expiry: "2026-09-24", LotSize: 25, TickSize: "0.05", Active: true},
	{ID: 32, Symbol: "BANKNIFTY24SEPFUT", DisplaySymbol: "BANKNIFTY SEP FUT", Name: "BANKNIFTY Futures", Underlying: "BANKNIFTY", Token: "NFO_BN_FUT", Exchange: "NFO", ExchangeSegment: "NFO", InstrumentType: "FUTIDX", Expiry: "2026-09-24", LotSize: 15, TickSize: "0.05", Active: true},
	{ID: 33, Symbol: "RELIANCE24SEPFUT", DisplaySymbol: "RELIANCE SEP FUT", Name: "RELIANCE Futures", Underlying: "RELIANCE", Token: "NFO_REL_FUT", Exchange: "NFO", ExchangeSegment: "NFO", InstrumentType: "FUTSTK", Expiry: "2026-09-24", LotSize: 250, TickSize: "0.05", Active: true},
	{ID: 34, Symbol: "TCS24SEPFUT", DisplaySymbol: "TCS SEP FUT", Name: "TCS Futures", Underlying: "TCS", Token: "NFO_TCS_FUT", Exchange: "NFO", ExchangeSegment: "NFO", InstrumentType: "FUTSTK", Expiry: "2026-09-24", LotSize: 175, TickSize: "0.05", Active: true},
}

// Service provides access to authoritative canonical instruments.
type Service struct {
	db *gorm.DB
}

// NewService creates a new instrument service.
func NewService(db *gorm.DB) *Service {
	return &Service{db: db}
}

// FormatCanonicalDisplaySymbol formats human-friendly display symbols (e.g. "NIFTY 24OCT 25000 CE", "TCS").
func FormatCanonicalDisplaySymbol(symbol, expiry, strikeStr, optionType, name string) string {
	cleanSym := strings.ToUpper(strings.TrimSpace(symbol))
	cleanSym = strings.TrimSuffix(cleanSym, "-EQ")

	if strings.Contains(cleanSym, "FUT") {
		// e.g. NIFTY24SEPFUT -> NIFTY SEP FUT
		parts := strings.Split(cleanSym, " ")
		if len(parts) >= 2 {
			return cleanSym
		}
		// Attempt split
		for _, m := range []string{"JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"} {
			if idx := strings.Index(cleanSym, m); idx > 0 {
				under := cleanSym[:idx]
				under = strings.TrimRight(under, "0123456789")
				return fmt.Sprintf("%s %s FUT", under, m)
			}
		}
		return cleanSym
	}

	if (strings.HasSuffix(cleanSym, "CE") || strings.HasSuffix(cleanSym, "PE")) && strikeStr != "" && strikeStr != "-1" {
		parts := strings.Split(cleanSym, " ")
		if len(parts) >= 3 {
			return cleanSym
		}
		sVal, _ := strconv.ParseFloat(strikeStr, 64)
		sFormatted := fmt.Sprintf("%.0f", sVal)
		if sVal == 0 {
			sFormatted = strikeStr
		}
		opt := optionType
		if opt == "" {
			if strings.HasSuffix(cleanSym, "CE") {
				opt = "CE"
			} else {
				opt = "PE"
			}
		}
		under := strings.TrimRight(cleanSym, "0123456789CEPE ")
		for _, m := range []string{"JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"} {
			if idx := strings.Index(cleanSym, m); idx > 0 {
				under = cleanSym[:idx]
				under = strings.TrimRight(under, "0123456789")
				return fmt.Sprintf("%s %s %s %s", under, m, sFormatted, opt)
			}
		}
		return fmt.Sprintf("%s %s %s", under, sFormatted, opt)
	}

	return cleanSym
}

// ToCanonicalInstrument maps a model.Instrument to the public canonical identity DTO.
func ToCanonicalInstrument(inst model.Instrument) dto.InstrumentResponse {
	exchange := inst.Exchange
	if exchange == "" {
		if inst.ExchangeSegment != "" {
			exchange = inst.ExchangeSegment
		} else if strings.Contains(inst.Symbol, "FUT") || strings.Contains(inst.Symbol, "CE") || strings.Contains(inst.Symbol, "PE") {
			exchange = "NFO"
		} else {
			exchange = "NSE"
		}
	}

	underlying := inst.Underlying
	if underlying == "" {
		if inst.UnderlyingSymbol != "" {
			underlying = inst.UnderlyingSymbol
		} else if inst.Name != "" {
			underlying = inst.Name
		} else {
			underlying = inst.Symbol
		}
	}

	displaySymbol := inst.DisplaySymbol
	if displaySymbol == "" {
		displaySymbol = FormatCanonicalDisplaySymbol(inst.Symbol, inst.Expiry, inst.Strike, inst.OptionType, inst.Name)
	}

	instType := inst.InstrumentType
	if instType == "" {
		if exchange == "NFO" {
			if strings.Contains(inst.Symbol, "CE") || strings.Contains(inst.Symbol, "PE") {
				if underlying == "NIFTY" || underlying == "BANKNIFTY" || underlying == "FINNIFTY" || underlying == "MIDCPNIFTY" || underlying == "SENSEX" {
					instType = "OPTIDX"
				} else {
					instType = "OPTSTK"
				}
			} else {
				if underlying == "NIFTY" || underlying == "BANKNIFTY" || underlying == "FINNIFTY" || underlying == "MIDCPNIFTY" || underlying == "SENSEX" {
					instType = "FUTIDX"
				} else {
					instType = "FUTSTK"
				}
			}
		} else if underlying == "NIFTY" || underlying == "BANKNIFTY" || underlying == "FINNIFTY" || underlying == "MIDCPNIFTY" || underlying == "SENSEX" {
			instType = "INDEX"
		} else {
			instType = "EQUITY"
		}
	}

	optType := inst.OptionType
	if optType == "XX" || optType == "-1" {
		optType = ""
	}
	if optType == "" {
		if strings.HasSuffix(inst.Symbol, "CE") {
			optType = "CE"
		} else if strings.HasSuffix(inst.Symbol, "PE") {
			optType = "PE"
		}
	}

	var strike float64
	if inst.Strike != "" && inst.Strike != "-1" && inst.Strike != "-1.000000" {
		if val, err := strconv.ParseFloat(inst.Strike, 64); err == nil && val > 0 {
			strike = val
		}
	}

	lotSize := inst.LotSize
	if lotSize <= 0 {
		switch underlying {
		case "NIFTY":
			lotSize = 25
		case "BANKNIFTY":
			lotSize = 15
		case "FINNIFTY":
			lotSize = 25
		case "MIDCPNIFTY":
			lotSize = 50
		case "SENSEX":
			lotSize = 10
		default:
			lotSize = 1
		}
	}

	var tickSize float64 = 0.05
	if inst.TickSize != "" {
		if val, err := strconv.ParseFloat(inst.TickSize, 64); err == nil && val > 0 {
			if val >= 1.0 { // e.g. 5 paise
				tickSize = val / 100.0
			} else {
				tickSize = val
			}
		}
	}
	tickSize = math.Round(tickSize*10000) / 10000

	active := inst.Active
	if !active && inst.Symbol != "" {
		active = true
	}

	return dto.InstrumentResponse{
		ID:             inst.ID,
		Symbol:         inst.Symbol,
		DisplaySymbol:  displaySymbol,
		Exchange:       exchange,
		Token:          inst.Token,
		InstrumentType: instType,
		Underlying:     underlying,
		Expiry:         inst.Expiry,
		Strike:         strike,
		OptionType:     optType,
		LotSize:        lotSize,
		TickSize:       tickSize,
		Active:         active,
	}
}

// List returns instruments matching filters. If DB is unavailable or empty, it serves default canonical records.
func (s *Service) List(query, exchange, instrumentType, underlying string, activeOnly bool, limit int) ([]dto.InstrumentResponse, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}

	db := s.db
	if db == nil {
		db = database.GetDB()
	}

	if db == nil {
		return s.filterDefaults(query, exchange, instrumentType, underlying, activeOnly, limit), nil
	}

	var dbCount int64
	_ = db.Model(&model.Instrument{}).Count(&dbCount).Error
	if dbCount == 0 {
		return s.filterDefaults(query, exchange, instrumentType, underlying, activeOnly, limit), nil
	}

	tx := db.Model(&model.Instrument{})
	if activeOnly {
		tx = tx.Where("active = ?", true)
	}
	if exchange != "" && exchange != "ALL" {
		tx = tx.Where("exchange = ? OR exchange_segment = ?", exchange, exchange)
	}
	if instrumentType != "" && instrumentType != "ALL" {
		tx = tx.Where("instrument_type = ?", instrumentType)
	}
	if underlying != "" {
		tx = tx.Where("UPPER(underlying) = ? OR UPPER(underlying_symbol) = ? OR UPPER(name) = ?", strings.ToUpper(underlying), strings.ToUpper(underlying), strings.ToUpper(underlying))
	}

	if query != "" {
		escaped := strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(query)
		pattern := "%" + escaped + "%"
		canonical := alias.ResolveCanonicalSymbol(strings.ToUpper(strings.TrimSpace(query)))
		if canonical != "" && canonical != strings.ToUpper(strings.TrimSpace(query)) {
			tx = tx.Where("symbol ILIKE ? ESCAPE '\\' OR display_symbol ILIKE ? ESCAPE '\\' OR name ILIKE ? ESCAPE '\\' OR symbol ILIKE ?", pattern, pattern, pattern, "%"+canonical+"%")
		} else {
			tx = tx.Where("symbol ILIKE ? ESCAPE '\\' OR display_symbol ILIKE ? ESCAPE '\\' OR name ILIKE ? ESCAPE '\\'", pattern, pattern, pattern)
		}
	}

	var results []model.Instrument
	if err := tx.Limit(limit).Find(&results).Error; err != nil {
		return nil, err
	}

	out := make([]dto.InstrumentResponse, len(results))
	for i, r := range results {
		out[i] = ToCanonicalInstrument(r)
	}
	return out, nil
}

// GetBySymbol fetches a canonical instrument by symbol.
func (s *Service) GetBySymbol(symbol string) (*dto.InstrumentResponse, error) {
	clean := strings.ToUpper(strings.TrimSpace(symbol))
	cleanNoEq := strings.TrimSuffix(clean, "-EQ")

	db := s.db
	if db == nil {
		db = database.GetDB()
	}

	if db != nil {
		var inst model.Instrument
		err := db.Where("UPPER(symbol) = ? OR UPPER(symbol) = ? OR UPPER(symbol) = ?", clean, cleanNoEq, cleanNoEq+"-EQ").First(&inst).Error
		if err == nil {
			resp := ToCanonicalInstrument(inst)
			return &resp, nil
		}

		canonical := alias.ResolveCanonicalSymbol(cleanNoEq)
		if canonical != "" && canonical != cleanNoEq {
			err = db.Where("UPPER(symbol) = ? OR UPPER(symbol) = ?", canonical, canonical+"-EQ").First(&inst).Error
			if err == nil {
				resp := ToCanonicalInstrument(inst)
				return &resp, nil
			}
		}
	}

	// Fallback to built-in canonical instruments
	for _, inst := range DefaultCanonicalInstruments {
		if strings.EqualFold(inst.Symbol, clean) || strings.EqualFold(inst.Symbol, cleanNoEq) {
			resp := ToCanonicalInstrument(inst)
			return &resp, nil
		}
	}

	return nil, fmt.Errorf("instrument not found: %s", symbol)
}

func (s *Service) filterDefaults(query, exchange, instrumentType, underlying string, activeOnly bool, limit int) []dto.InstrumentResponse {
	var filtered []dto.InstrumentResponse
	qUpper := strings.ToUpper(strings.TrimSpace(query))
	exUpper := strings.ToUpper(strings.TrimSpace(exchange))
	tUpper := strings.ToUpper(strings.TrimSpace(instrumentType))
	uUpper := strings.ToUpper(strings.TrimSpace(underlying))

	for _, inst := range DefaultCanonicalInstruments {
		if activeOnly && !inst.Active {
			continue
		}
		if exUpper != "" && exUpper != "ALL" && !strings.EqualFold(inst.Exchange, exUpper) && !strings.EqualFold(inst.ExchangeSegment, exUpper) {
			continue
		}
		if tUpper != "" && tUpper != "ALL" && !strings.EqualFold(inst.InstrumentType, tUpper) {
			continue
		}
		if uUpper != "" && !strings.EqualFold(inst.Underlying, uUpper) {
			continue
		}
		if qUpper != "" {
			if !strings.Contains(strings.ToUpper(inst.Symbol), qUpper) &&
				!strings.Contains(strings.ToUpper(inst.DisplaySymbol), qUpper) &&
				!strings.Contains(strings.ToUpper(inst.Name), qUpper) {
				continue
			}
		}

		filtered = append(filtered, ToCanonicalInstrument(inst))
		if len(filtered) >= limit {
			break
		}
	}
	return filtered
}
