package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/alias"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// DefaultCanonicalInstruments are the core institutional instruments supported by the platform.
var DefaultCanonicalInstruments = []model.Instrument{
	{ID: 1, Symbol: "RELIANCE", DisplaySymbol: "RELIANCE", Name: "Reliance Industries", Underlying: "RELIANCE", Token: "2885", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 2, Symbol: "TCS", DisplaySymbol: "TCS", Name: "Tata Consultancy Services", Underlying: "TCS", Token: "11536", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 3, Symbol: "INFY", DisplaySymbol: "INFY", Name: "Infosys Ltd", Underlying: "INFY", Token: "1594", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 4, Symbol: "HDFCBANK", DisplaySymbol: "HDFCBANK", Name: "HDFC Bank Ltd", Underlying: "HDFCBANK", Token: "1333", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 5, Symbol: "TATAMOTORS", DisplaySymbol: "TATAMOTORS", Name: "Tata Motors Ltd", Underlying: "TATAMOTORS", Token: "3456", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 6, Symbol: "BHARTIARTL", DisplaySymbol: "BHARTIARTL", Name: "Bharti Airtel Ltd", Underlying: "BHARTIARTL", Token: "10604", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
	{ID: 7, Symbol: "ETERNAL", DisplaySymbol: "ETERNAL", Name: "Eternal (formerly Zomato)", Underlying: "ETERNAL", Token: "5097", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true},
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

// AngelScripItem matches the schema of Angel One OpenAPI scrip master JSON records.
type AngelScripItem struct {
	Token          string `json:"token"`
	Symbol         string `json:"symbol"`
	Name           string `json:"name"`
	Expiry         string `json:"expiry"`
	Strike         string `json:"strike"`
	LotSize        string `json:"lotsize"`
	InstrumentType string `json:"instrumenttype"`
	ExchSeg        string `json:"exch_seg"`
	TickSize       string `json:"tick_size"`
}

// SyncStats captures summary metrics from an instrument master synchronization run.
type SyncStats struct {
	TotalProcessed int   `json:"total_processed"`
	TotalUpserted  int   `json:"total_upserted"`
	TotalSkipped   int   `json:"total_skipped"`
	DurationMs     int64 `json:"duration_ms"`
}

// SyncOptions provides filtering and batch size customization for scrip master sync.
type SyncOptions struct {
	BatchSize         int
	TargetSegments    []string
	TargetUnderlyings []string
}

// ParseAngelScripItem validates and normalizes an Angel One scrip record into a canonical model.Instrument.
func ParseAngelScripItem(raw AngelScripItem) (*model.Instrument, bool) {
	token := strings.TrimSpace(raw.Token)
	segment := strings.ToUpper(strings.TrimSpace(raw.ExchSeg))
	if token == "" || segment == "" {
		return nil, false
	}

	// Supported exchanges for canonical trading
	if segment != "NSE" && segment != "NFO" && segment != "BSE" {
		return nil, false
	}

	symbol := strings.ToUpper(strings.TrimSpace(raw.Symbol))
	if symbol == "" {
		return nil, false
	}

	name := strings.TrimSpace(raw.Name)
	underlying := strings.ToUpper(name)
	if underlying == "" {
		underlying = strings.TrimSuffix(symbol, "-EQ")
	}

	expiry := strings.TrimSpace(raw.Expiry)

	// Clean strike price: Angel One often outputs strike in paise (e.g. 2500000.000000) or -1.000000
	strike := ""
	if raw.Strike != "" && raw.Strike != "-1" && raw.Strike != "-1.000000" {
		if val, err := strconv.ParseFloat(raw.Strike, 64); err == nil && val > 0 {
			if val > 100000 { // Stored in paise
				val = val / 100.0
			}
			strike = fmt.Sprintf("%.2f", val)
			strike = strings.TrimSuffix(strike, ".00")
		}
	}

	// Option Type
	optType := strings.ToUpper(strings.TrimSpace(raw.InstrumentType))
	if optType != "CE" && optType != "PE" {
		if strings.HasSuffix(symbol, "CE") {
			optType = "CE"
		} else if strings.HasSuffix(symbol, "PE") {
			optType = "PE"
		} else {
			optType = ""
		}
	}

	// Lot Size
	lotSize, _ := strconv.ParseInt(raw.LotSize, 10, 64)
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

	// Tick Size (Angel One outputs tick_size in paise e.g. 5.000000)
	tickSize := "0.05"
	if raw.TickSize != "" {
		if val, err := strconv.ParseFloat(raw.TickSize, 64); err == nil && val > 0 {
			if val >= 1.0 {
				val = val / 100.0
			}
			tickSize = fmt.Sprintf("%.2f", val)
		}
	}

	// Instrument Type classification
	rawType := strings.ToUpper(strings.TrimSpace(raw.InstrumentType))
	instType := rawType
	if segment == "NSE" {
		if rawType == "AMXIDX" || underlying == "NIFTY" || underlying == "BANKNIFTY" || underlying == "FINNIFTY" || underlying == "MIDCPNIFTY" {
			instType = "INDEX"
		} else if rawType == "" || rawType == "EQ" || strings.HasSuffix(symbol, "-EQ") {
			instType = "EQUITY"
		}
	} else if segment == "BSE" {
		if rawType == "AMXIDX" || underlying == "SENSEX" {
			instType = "INDEX"
		} else if rawType == "" || rawType == "EQ" {
			instType = "EQUITY"
		}
	} else if segment == "NFO" {
		if instType == "" || instType == "OPTSTK" || instType == "OPTIDX" || instType == "FUTSTK" || instType == "FUTIDX" {
			if instType == "" {
				if optType != "" {
					if underlying == "NIFTY" || underlying == "BANKNIFTY" || underlying == "FINNIFTY" || underlying == "MIDCPNIFTY" {
						instType = "OPTIDX"
					} else {
						instType = "OPTSTK"
					}
				} else {
					if underlying == "NIFTY" || underlying == "BANKNIFTY" || underlying == "FINNIFTY" || underlying == "MIDCPNIFTY" {
						instType = "FUTIDX"
					} else {
						instType = "FUTSTK"
					}
				}
			}
		}
	}

	displaySymbol := FormatCanonicalDisplaySymbol(symbol, expiry, strike, optType, name)

	return &model.Instrument{
		Token:            token,
		Symbol:           symbol,
		DisplaySymbol:    displaySymbol,
		Exchange:         segment,
		Name:             name,
		Underlying:       underlying,
		UnderlyingSymbol: underlying,
		Expiry:           expiry,
		Strike:           strike,
		OptionType:       optType,
		LotSize:          lotSize,
		InstrumentType:   instType,
		ExchangeSegment:  segment,
		TickSize:         tickSize,
		Active:           true,
	}, true
}

// SyncFromReader streams an Angel One scrip master JSON array and batch upserts into PostgreSQL.
func (s *Service) SyncFromReader(ctx context.Context, r io.Reader, opts ...SyncOptions) (*SyncStats, error) {
	start := time.Now()
	batchSize := 500
	var targetSegments map[string]bool
	var targetUnderlyings map[string]bool

	if len(opts) > 0 {
		if opts[0].BatchSize > 0 {
			batchSize = opts[0].BatchSize
		}
		if len(opts[0].TargetSegments) > 0 {
			targetSegments = make(map[string]bool)
			for _, seg := range opts[0].TargetSegments {
				targetSegments[strings.ToUpper(strings.TrimSpace(seg))] = true
			}
		}
		if len(opts[0].TargetUnderlyings) > 0 {
			targetUnderlyings = make(map[string]bool)
			for _, u := range opts[0].TargetUnderlyings {
				targetUnderlyings[strings.ToUpper(strings.TrimSpace(u))] = true
			}
		}
	}

	dec := json.NewDecoder(r)

	// Consume leading bracket '['
	t, err := dec.Token()
	if err != nil {
		return nil, fmt.Errorf("failed reading json stream opening: %w", err)
	}
	if delim, ok := t.(json.Delim); !ok || delim != '[' {
		return nil, fmt.Errorf("expected json array opening '[' but got %v", t)
	}

	stats := &SyncStats{}
	var batch []model.Instrument

	flushBatch := func() error {
		if len(batch) == 0 {
			return nil
		}
		if s.db != nil {
			err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
				Columns: []clause.Column{{Name: "token"}, {Name: "exchange_segment"}},
				DoUpdates: clause.AssignmentColumns([]string{
					"symbol", "display_symbol", "exchange", "name", "underlying", "underlying_symbol",
					"expiry", "strike", "option_type", "lot_size", "instrument_type",
					"tick_size", "active", "updated_at",
				}),
			}).Create(&batch).Error
			if err != nil {
				return fmt.Errorf("failed upserting instrument batch: %w", err)
			}
		}
		stats.TotalUpserted += len(batch)
		batch = batch[:0]
		return nil
	}

	for dec.More() {
		select {
		case <-ctx.Done():
			return stats, ctx.Err()
		default:
		}

		var raw AngelScripItem
		if err := dec.Decode(&raw); err != nil {
			return stats, fmt.Errorf("failed decoding scrip item: %w", err)
		}
		stats.TotalProcessed++

		inst, ok := ParseAngelScripItem(raw)
		if !ok {
			stats.TotalSkipped++
			continue
		}

		if targetSegments != nil && !targetSegments[inst.ExchangeSegment] {
			stats.TotalSkipped++
			continue
		}
		if targetUnderlyings != nil && !targetUnderlyings[inst.Underlying] && !targetUnderlyings[inst.Symbol] {
			stats.TotalSkipped++
			continue
		}

		batch = append(batch, *inst)
		if len(batch) >= batchSize {
			if err := flushBatch(); err != nil {
				return stats, err
			}
		}
	}

	// Consume closing bracket ']'
	_, _ = dec.Token()

	if err := flushBatch(); err != nil {
		return stats, err
	}

	stats.DurationMs = time.Since(start).Milliseconds()
	return stats, nil
}

// SyncFromScripMaster downloads or reads the official Angel One scrip master and syncs to database.
func (s *Service) SyncFromScripMaster(ctx context.Context, source string, opts ...SyncOptions) (*SyncStats, error) {
	if source == "" {
		source = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
	}

	if strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://") {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
		if err != nil {
			return nil, fmt.Errorf("failed creating http request: %w", err)
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")

		client := &http.Client{Timeout: 90 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("scrip master download failed from %s: %w", source, err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("scrip master download returned HTTP status %d", resp.StatusCode)
		}

		return s.SyncFromReader(ctx, resp.Body, opts...)
	}

	// Local file source
	f, err := os.Open(source)
	if err != nil {
		return nil, fmt.Errorf("failed opening local scrip master file %s: %w", source, err)
	}
	defer f.Close()

	return s.SyncFromReader(ctx, f, opts...)
}
