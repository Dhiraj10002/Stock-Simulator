package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
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
	{ID: 1, Symbol: "RELIANCE", DisplaySymbol: "RELIANCE", Name: "Reliance Industries", Underlying: "RELIANCE", Token: "2885", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 2, Symbol: "TCS", DisplaySymbol: "TCS", Name: "Tata Consultancy Services", Underlying: "TCS", Token: "11536", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 3, Symbol: "INFY", DisplaySymbol: "INFY", Name: "Infosys Ltd", Underlying: "INFY", Token: "1594", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 4, Symbol: "HDFCBANK", DisplaySymbol: "HDFCBANK", Name: "HDFC Bank Ltd", Underlying: "HDFCBANK", Token: "1333", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 5, Symbol: "TATAMOTORS", DisplaySymbol: "TATAMOTORS", Name: "Tata Motors Ltd", Underlying: "TATAMOTORS", Token: "3456", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 6, Symbol: "BHARTIARTL", DisplaySymbol: "BHARTIARTL", Name: "Bharti Airtel Ltd", Underlying: "BHARTIARTL", Token: "10604", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 7, Symbol: "ETERNAL", DisplaySymbol: "ETERNAL", Name: "Eternal (formerly Zomato)", Underlying: "ETERNAL", Token: "5097", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 9, Symbol: "SUZLON", DisplaySymbol: "SUZLON", Name: "Suzlon Energy Ltd", Underlying: "SUZLON", Token: "772", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 10, Symbol: "TRENT", DisplaySymbol: "TRENT", Name: "Trent Ltd", Underlying: "TRENT", Token: "1964", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 11, Symbol: "ADANIENT", DisplaySymbol: "ADANIENT", Name: "Adani Enterprises Ltd", Underlying: "ADANIENT", Token: "25", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 12, Symbol: "YESBANK", DisplaySymbol: "YESBANK", Name: "Yes Bank Ltd", Underlying: "YESBANK", Token: "11915", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 13, Symbol: "BEL", DisplaySymbol: "BEL", Name: "Bharat Electronics Ltd", Underlying: "BEL", Token: "383", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 14, Symbol: "SBIN", DisplaySymbol: "SBIN", Name: "State Bank of India", Underlying: "SBIN", Token: "3045", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 15, Symbol: "ICICIBANK", DisplaySymbol: "ICICIBANK", Name: "ICICI Bank Ltd", Underlying: "ICICIBANK", Token: "4963", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 16, Symbol: "ATGL", DisplaySymbol: "ATGL", Name: "Adani Total Gas Ltd", Underlying: "ATGL", Token: "14927", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 17, Symbol: "POONAWALLA", DisplaySymbol: "POONAWALLA", Name: "Poonawalla Fincorp", Underlying: "POONAWALLA", Token: "2837", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 18, Symbol: "TATACHEM", DisplaySymbol: "TATACHEM", Name: "Tata Chemicals Ltd", Underlying: "TATACHEM", Token: "3405", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 19, Symbol: "TATAPOWER", DisplaySymbol: "TATAPOWER", Name: "Tata Power Co Ltd", Underlying: "TATAPOWER", Token: "3426", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 20, Symbol: "PRAJIND", DisplaySymbol: "PRAJIND", Name: "Praj Industries Ltd", Underlying: "PRAJIND", Token: "2705", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 21, Symbol: "BAJFINANCE", DisplaySymbol: "BAJFINANCE", Name: "Bajaj Finance Ltd", Underlying: "BAJFINANCE", Token: "317", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 22, Symbol: "AXISBANK", DisplaySymbol: "AXISBANK", Name: "Axis Bank Ltd", Underlying: "AXISBANK", Token: "5900", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 23, Symbol: "KOTAKBANK", DisplaySymbol: "KOTAKBANK", Name: "Kotak Mahindra Bank", Underlying: "KOTAKBANK", Token: "1922", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 24, Symbol: "APARINDS", DisplaySymbol: "APARINDS", Name: "Apar Industries Ltd", Underlying: "APARINDS", Token: "10794", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 25, Symbol: "MARUTI", DisplaySymbol: "MARUTI", Name: "Maruti Suzuki India", Underlying: "MARUTI", Token: "10999", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, TickSize: "0.05", Active: true, IsTradable: true},
	// Indices
	{ID: 26, Symbol: "NIFTY", DisplaySymbol: "NIFTY 50", Name: "NIFTY 50", Underlying: "NIFTY", Token: "99926000", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "INDEX", LotSize: 25, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 27, Symbol: "BANKNIFTY", DisplaySymbol: "NIFTY BANK", Name: "NIFTY BANK", Underlying: "BANKNIFTY", Token: "99926009", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "INDEX", LotSize: 15, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 28, Symbol: "FINNIFTY", DisplaySymbol: "NIFTY FINANCIAL", Name: "NIFTY FINANCIAL SERVICES", Underlying: "FINNIFTY", Token: "99926037", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "INDEX", LotSize: 25, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 29, Symbol: "MIDCPNIFTY", DisplaySymbol: "NIFTY MIDCAP SELECT", Name: "NIFTY MIDCAP SELECT", Underlying: "MIDCPNIFTY", Token: "99926074", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "INDEX", LotSize: 50, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 30, Symbol: "SENSEX", DisplaySymbol: "BSE SENSEX", Name: "BSE SENSEX", Underlying: "SENSEX", Token: "99919000", Exchange: "BSE", ExchangeSegment: "BSE", InstrumentType: "INDEX", LotSize: 10, TickSize: "0.05", Active: true, IsTradable: true},
	// Benchmark Derivatives
	{ID: 31, Symbol: "NIFTY24SEPFUT", DisplaySymbol: "NIFTY SEP FUT", Name: "NIFTY 50 Futures", Underlying: "NIFTY", Token: "NFO_NIFTY_FUT", Exchange: "NFO", ExchangeSegment: "NFO", InstrumentType: "FUTIDX", Expiry: "2026-09-24", LotSize: 25, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 32, Symbol: "BANKNIFTY24SEPFUT", DisplaySymbol: "BANKNIFTY SEP FUT", Name: "BANKNIFTY Futures", Underlying: "BANKNIFTY", Token: "NFO_BN_FUT", Exchange: "NFO", ExchangeSegment: "NFO", InstrumentType: "FUTIDX", Expiry: "2026-09-24", LotSize: 15, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 33, Symbol: "RELIANCE24SEPFUT", DisplaySymbol: "RELIANCE SEP FUT", Name: "RELIANCE Futures", Underlying: "RELIANCE", Token: "NFO_REL_FUT", Exchange: "NFO", ExchangeSegment: "NFO", InstrumentType: "FUTSTK", Expiry: "2026-09-24", LotSize: 250, TickSize: "0.05", Active: true, IsTradable: true},
	{ID: 34, Symbol: "TCS24SEPFUT", DisplaySymbol: "TCS SEP FUT", Name: "TCS Futures", Underlying: "TCS", Token: "NFO_TCS_FUT", Exchange: "NFO", ExchangeSegment: "NFO", InstrumentType: "FUTSTK", Expiry: "2026-09-24", LotSize: 175, TickSize: "0.05", Active: true, IsTradable: true},
}

var activationMu sync.Mutex

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
	isTradable := inst.IsTradable
	if !active {
		isTradable = false
	} else if !inst.IsTradable && inst.SnapshotVersion == "" {
		isTradable = true
	}

	return dto.InstrumentResponse{
		ID:              inst.ID,
		Symbol:          inst.Symbol,
		DisplaySymbol:   displaySymbol,
		Name:            inst.Name,
		Exchange:        exchange,
		Token:           inst.Token,
		InstrumentType:  instType,
		Underlying:      underlying,
		Expiry:          inst.Expiry,
		Strike:          strike,
		OptionType:      optType,
		LotSize:         lotSize,
		TickSize:        tickSize,
		Active:          active,
		IsTradable:      isTradable,
		SnapshotVersion: inst.SnapshotVersion,
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

	var hasInstruments bool
	if err := db.Raw("SELECT EXISTS (SELECT 1 FROM instruments LIMIT 1)").Scan(&hasInstruments).Error; err != nil {
		return nil, err
	}
	if !hasInstruments {
		return s.filterDefaults(query, exchange, instrumentType, underlying, activeOnly, limit), nil
	}

	tx := db.Model(&model.Instrument{})
	if activeOnly {
		tx = tx.Where("(active = ? OR active IS NULL) AND (is_tradable = ? OR is_tradable IS NULL)", true, true)
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
	if err := tx.Order("is_tradable DESC, active DESC, id ASC").Limit(limit).Find(&results).Error; err != nil {
		return nil, err
	}

	out := make([]dto.InstrumentResponse, 0, len(results))
	for _, r := range results {
		if activeOnly && r.Expiry != "" {
			exp, err := ParseExpiryDate(r.Expiry, nil)
			if err != nil || !time.Now().Before(exp) {
				continue
			}
		}
		out = append(out, ToCanonicalInstrument(r))
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
		err := db.Where("UPPER(symbol) = ? OR UPPER(symbol) = ? OR UPPER(symbol) = ?", clean, cleanNoEq, cleanNoEq+"-EQ").
			Order("CASE WHEN UPPER(exchange_segment) = 'NSE' THEN 0 ELSE 1 END").
			Order("is_tradable DESC, active DESC").
			Order("id DESC").First(&inst).Error
		if err == nil {
			resp := ToCanonicalInstrument(inst)
			return &resp, nil
		}

		canonical := alias.ResolveCanonicalSymbol(cleanNoEq)
		if canonical != "" && canonical != cleanNoEq {
			err = db.Where("UPPER(symbol) = ? OR UPPER(symbol) = ?", canonical, canonical+"-EQ").
				Order("CASE WHEN UPPER(exchange_segment) = 'NSE' THEN 0 ELSE 1 END").
				Order("is_tradable DESC, active DESC").
				Order("id DESC").First(&inst).Error
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
		if activeOnly && (!inst.Active || !inst.IsTradable) {
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
			if segment == "NFO" { // NFO master strikes are in paise, including strikes below ₹1,000
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
		IsTradable:       true,
	}, true
}

// ParseExpiryDate parses Indian market expiry strings (e.g. "24SEP2026", "2026-09-24", "24-09-2026") into a 15:30 IST timestamp.
func ParseExpiryDate(expiry string, loc *time.Location) (time.Time, error) {
	clean := strings.ToUpper(strings.TrimSpace(expiry))
	if clean == "" {
		return time.Time{}, fmt.Errorf("empty expiry date")
	}
	if loc == nil {
		loc = time.FixedZone("IST", 5*3600+1800)
	}
	layouts := []string{
		"02Jan2006",
		"02JAN2006",
		"2006-01-02",
		"02-01-2006",
		"02-Jan-2006",
		"02-JAN-2006",
	}
	for _, layout := range layouts {
		if t, err := time.ParseInLocation(layout, clean, loc); err == nil {
			return time.Date(t.Year(), t.Month(), t.Day(), 15, 30, 0, 0, loc), nil
		}
	}
	return time.Time{}, fmt.Errorf("unrecognized expiry date layout: %s", expiry)
}

// StageSnapshot parses and validates instruments from reader, saves them with snapshot_version,
// and records a STAGED InstrumentSnapshot.
func (s *Service) StageSnapshot(ctx context.Context, version, source string, r io.Reader, opts ...SyncOptions) (*model.InstrumentSnapshot, *SyncStats, error) {
	start := time.Now()
	if version == "" {
		version = fmt.Sprintf("master-%s", time.Now().UTC().Format("20060102-150405.000000000"))
	}
	if source == "" {
		source = "angelone_openapi"
	}

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
		return nil, nil, fmt.Errorf("failed reading json stream opening: %w", err)
	}
	if delim, ok := t.(json.Delim); !ok || delim != '[' {
		return nil, nil, fmt.Errorf("expected json array opening '[' but got %v", t)
	}

	stats := &SyncStats{}
	var batch []model.Instrument
	seenTokens := make(map[string]bool)
	seenContracts := make(map[string]bool)
	var validationErrors []string

	eqCount := 0
	futCount := 0
	optCount := 0
	idxCount := 0

	var members []model.Instrument
	flushBatch := func() error {
		members = append(members, batch...)
		stats.TotalUpserted += len(batch)
		batch = nil
		return nil
	}

	loc, _ := time.LoadLocation("Asia/Kolkata")
	if loc == nil {
		loc = time.FixedZone("IST", 5*3600+1800)
	}

	for dec.More() {
		select {
		case <-ctx.Done():
			return nil, stats, ctx.Err()
		default:
		}

		var raw AngelScripItem
		if err := dec.Decode(&raw); err != nil {
			return nil, stats, fmt.Errorf("failed decoding scrip item: %w", err)
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

		contractKey := inst.ExchangeSegment + ":" + inst.Symbol
		if seenContracts[contractKey] {
			validationErrors = append(validationErrors, "duplicate contract "+contractKey)
			stats.TotalSkipped++
			continue
		}
		seenContracts[contractKey] = true
		// Check duplicate tokens within the same exchange segment
		tokenKey := fmt.Sprintf("%s:%s", inst.ExchangeSegment, inst.Token)
		if seenTokens[tokenKey] {
			if len(validationErrors) < 100 {
				validationErrors = append(validationErrors, fmt.Sprintf("duplicate token %s for symbol %s", tokenKey, inst.Symbol))
			}
			stats.TotalSkipped++
			continue
		}
		seenTokens[tokenKey] = true

		// Check contract specifications for derivatives
		if inst.ExchangeSegment == "NFO" || inst.ExchangeSegment == "BFO" {
			rawLot, _ := strconv.ParseInt(raw.LotSize, 10, 64)
			if rawLot <= 0 {
				if len(validationErrors) < 100 {
					validationErrors = append(validationErrors, fmt.Sprintf("invalid lot size %d for derivative %s", rawLot, inst.Symbol))
				}
				stats.TotalSkipped++
				continue
			}
			{
				if _, err := ParseExpiryDate(inst.Expiry, loc); err != nil {
					if len(validationErrors) < 100 {
						validationErrors = append(validationErrors, fmt.Sprintf("invalid expiry format %q for derivative %s", inst.Expiry, inst.Symbol))
					}
					stats.TotalSkipped++
					continue
				}
			}
		}

		// Tally instrument categories
		switch inst.InstrumentType {
		case "EQUITY":
			eqCount++
		case "FUTSTK", "FUTIDX":
			futCount++
		case "OPTSTK", "OPTIDX":
			optCount++
		case "INDEX":
			idxCount++
		}

		inst.SnapshotVersion = version
		inst.IsTradable = true
		inst.Active = true

		batch = append(batch, *inst)
		if len(batch) >= batchSize {
			if err := flushBatch(); err != nil {
				return nil, stats, err
			}
		}
	}

	// Malformed/trailing streams must never become activatable.
	closing, err := dec.Token()
	if err != nil || closing != json.Delim(']') {
		return nil, stats, fmt.Errorf("incomplete master array")
	}
	var trailing any
	if err := dec.Decode(&trailing); err != io.EOF {
		return nil, stats, fmt.Errorf("trailing master data")
	}

	if err := flushBatch(); err != nil {
		return nil, stats, err
	}

	stats.DurationMs = time.Since(start).Milliseconds()

	valErrorsJoined := strings.Join(validationErrors, "\n")
	payload, err := json.Marshal(members)
	if err != nil {
		return nil, stats, err
	}
	snapshot := &model.InstrumentSnapshot{
		Payload: string(payload), Partial: targetUnderlyings != nil || (targetSegments != nil && !(targetSegments["NSE"] && targetSegments["BSE"] && targetSegments["NFO"] && targetSegments["BFO"])),
		Version:          version,
		Source:           source,
		TotalInstruments: stats.TotalUpserted,
		EquityCount:      eqCount,
		FuturesCount:     futCount,
		OptionsCount:     optCount,
		IndexCount:       idxCount,
		Status:           model.SnapshotStatusStaged,
		ValidationErrors: valErrorsJoined,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}

	if len(members) == 0 || valErrorsJoined != "" {
		snapshot.Status = model.SnapshotStatusFailed
	}
	if s.db != nil {
		if err := s.db.WithContext(ctx).Create(snapshot).Error; err != nil {
			return nil, stats, fmt.Errorf("save immutable staged snapshot: %w", err)
		}
	}

	return snapshot, stats, nil
}

// ActivateSnapshot atomically activates a staged snapshot and soft-retires contracts not in the new snapshot version.
func (s *Service) ActivateSnapshot(ctx context.Context, version string) (*model.InstrumentSnapshot, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database required for activation")
	}
	activationMu.Lock()
	defer activationMu.Unlock()
	var snapshot model.InstrumentSnapshot
	now := time.Now()
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if tx.Dialector.Name() == "postgres" {
			if err := tx.Exec("SELECT pg_advisory_xact_lock(81003261003)").Error; err != nil {
				return err
			}
		}
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("version = ?", version).First(&snapshot).Error; err != nil {
			return err
		}
		if snapshot.Status != model.SnapshotStatusStaged || snapshot.ValidationErrors != "" || snapshot.Partial {
			return fmt.Errorf("snapshot is not a validated complete staged master")
		}
		var members []model.Instrument
		if err := json.Unmarshal([]byte(snapshot.Payload), &members); err != nil || len(members) == 0 {
			return fmt.Errorf("snapshot members unavailable")
		}
		var oldCount int64
		if err := tx.Model(&model.Instrument{}).Where("active = ? AND is_tradable = ?", true, true).Count(&oldCount).Error; err != nil {
			return err
		}
		if oldCount > 20 && int64(len(members))*100 < oldCount*80 {
			return fmt.Errorf("master shrank more than 20 percent; operator review required")
		}
		if err := tx.Model(&model.Instrument{}).Where("active = ? OR is_tradable = ?", true, true).Updates(map[string]any{"active": false, "is_tradable": false}).Error; err != nil {
			return err
		}
		var priorRows []model.Instrument
		if err := tx.Find(&priorRows).Error; err != nil {
			return err
		}
		priorMap := map[string]model.Instrument{}
		for _, row := range priorRows {
			priorMap[row.Symbol+"|"+row.ExchangeSegment] = row
		}
		for i := range members {
			inst := &members[i]
			inst.ID = 0
			inst.CreatedAt = time.Time{}
			inst.UpdatedAt = time.Time{}
			inst.Active = true
			inst.IsTradable = true
			if inst.Expiry != "" {
				expiry, err := ParseExpiryDate(inst.Expiry, nil)
				if err != nil {
					return err
				}
				if !now.Before(expiry) {
					inst.Active = false
					inst.IsTradable = false
				}
			}
			prior, found := priorMap[inst.Symbol+"|"+inst.ExchangeSegment]
			if found && prior.Expiry != "" && (prior.Expiry != inst.Expiry || prior.Strike != inst.Strike || prior.InstrumentType != inst.InstrumentType) {
				return fmt.Errorf("historical derivative identity changed: %s", inst.Symbol)
			}

		}
		if err := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "symbol"}, {Name: "exchange_segment"}}, DoUpdates: clause.AssignmentColumns([]string{"token", "display_symbol", "exchange", "name", "underlying", "underlying_symbol", "expiry", "strike", "option_type", "lot_size", "instrument_type", "tick_size", "active", "is_tradable", "snapshot_version", "updated_at"})}).CreateInBatches(&members, 500).Error; err != nil {
			return err
		}

		if err := tx.Model(&model.InstrumentSnapshot{}).Where("status = ?", model.SnapshotStatusActive).Update("status", model.SnapshotStatusRetired).Error; err != nil {
			return err
		}
		snapshot.Status = model.SnapshotStatusActive
		snapshot.ActivatedAt = &now
		return tx.Save(&snapshot).Error
	})
	return &snapshot, err
}

// GetActiveSnapshot returns the currently active instrument snapshot metadata.
func (s *Service) GetActiveSnapshot(ctx context.Context) (*model.InstrumentSnapshot, error) {
	if s.db == nil {
		return &model.InstrumentSnapshot{
			Version:          "builtin-canonical",
			Source:           "memory",
			TotalInstruments: len(DefaultCanonicalInstruments),
			EquityCount:      24,
			FuturesCount:     4,
			OptionsCount:     0,
			IndexCount:       5,
			Status:           model.SnapshotStatusActive,
		}, nil
	}

	var snap model.InstrumentSnapshot
	err := s.db.WithContext(ctx).Where("status = ?", model.SnapshotStatusActive).Order("activated_at DESC, id DESC").First(&snap).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			var count int64
			_ = s.db.WithContext(ctx).Model(&model.Instrument{}).Where("active = ? AND is_tradable = ?", true, true).Count(&count).Error
			return &model.InstrumentSnapshot{
				Version:          "initial-master",
				Source:           "database",
				TotalInstruments: int(count),
				Status:           model.SnapshotStatusActive,
			}, nil
		}
		return nil, err
	}
	return &snap, nil
}

// ListSnapshots returns the history of instrument snapshots.
func (s *Service) ListSnapshots(ctx context.Context, limit int) ([]model.InstrumentSnapshot, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if s.db == nil {
		return []model.InstrumentSnapshot{
			{
				Version:          "builtin-canonical",
				Source:           "memory",
				TotalInstruments: len(DefaultCanonicalInstruments),
				EquityCount:      24,
				FuturesCount:     4,
				OptionsCount:     0,
				IndexCount:       5,
				Status:           model.SnapshotStatusActive,
			},
		}, nil
	}
	var snaps []model.InstrumentSnapshot
	err := s.db.WithContext(ctx).Order("id DESC").Limit(limit).Find(&snaps).Error
	return snaps, err
}

// ExpireInstruments checks all active derivatives with an expiry date and soft-retires those whose expiry has elapsed.
func (s *Service) ExpireInstruments(ctx context.Context, asOf time.Time) (int64, error) {
	if s.db == nil {
		return 0, nil
	}
	loc, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		loc = time.FixedZone("IST", 5*3600+1800)
	}

	// A master has tens of thousands of option contracts but only a small set
	// of expiry dates. Do not transfer every contract across a remote DB link
	// on each lifecycle tick, or build an unbounded list of SQL ID parameters.
	var expiries []string
	err = s.db.WithContext(ctx).Model(&model.Instrument{}).
		Where("is_tradable = ? AND expiry != '' AND exchange_segment IN ('NFO', 'BFO')", true).
		Distinct().Pluck("expiry", &expiries).Error
	if err != nil {
		return 0, err
	}

	asOfIST := asOf.In(loc)
	var expiredDates []string

	for _, expiry := range expiries {
		expDate, err := ParseExpiryDate(expiry, loc)
		if err == nil {
			if asOfIST.After(expDate) || asOfIST.Equal(expDate) {
				expiredDates = append(expiredDates, expiry)
			}
		}
	}

	if len(expiredDates) == 0 {
		return 0, nil
	}

	res := s.db.WithContext(ctx).Model(&model.Instrument{}).
		Where("is_tradable = ? AND exchange_segment IN ('NFO', 'BFO') AND expiry IN ?", true, expiredDates).
		Updates(map[string]interface{}{"is_tradable": false, "active": false})
	return res.RowsAffected, res.Error
}

// SyncFromReader streams an Angel One scrip master JSON array, stages a versioned snapshot, and atomically activates it.
func (s *Service) SyncFromReader(ctx context.Context, r io.Reader, opts ...SyncOptions) (*SyncStats, error) {
	version := fmt.Sprintf("master-%s", time.Now().UTC().Format("20060102-150405.000000000"))
	snapshot, stats, err := s.StageSnapshot(ctx, version, "angelone_openapi", r, opts...)
	if err != nil {
		return stats, err
	}
	if s.db != nil && snapshot != nil {
		if _, err := s.ActivateSnapshot(ctx, version); err != nil {
			return stats, fmt.Errorf("failed activating snapshot %s: %w", version, err)
		}
	}
	return stats, nil
}

// OfficialScripMasterURL is the only remote import source. Local files are
// supported for trusted operators running cmd/sync-instruments, never over HTTP.
const OfficialScripMasterURL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
const maxScripMasterBytes int64 = 128 << 20

func scripMasterHTTPClient() *http.Client {
	return &http.Client{Timeout: 90 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
		return fmt.Errorf("instrument download redirects are not allowed")
	}}
}

// SyncFromScripMaster is an operator-only import operation.
func (s *Service) SyncFromScripMaster(ctx context.Context, source string, opts ...SyncOptions) (*SyncStats, error) {
	if source == "" {
		source = OfficialScripMasterURL
	}
	parsed, err := url.Parse(source)
	if err != nil {
		return nil, fmt.Errorf("invalid instrument source")
	}
	if parsed.Scheme != "" || parsed.Host != "" {
		if source != OfficialScripMasterURL {
			return nil, fmt.Errorf("remote instrument source must be the official HTTPS scrip master URL; use a local file for reviewed offline imports")
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
		if err != nil {
			return nil, err
		}
		resp, err := scripMasterHTTPClient().Do(req)
		if err != nil {
			return nil, fmt.Errorf("instrument download failed: %w", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("instrument download returned HTTP status %d", resp.StatusCode)
		}
		return s.syncBoundedSource(ctx, resp.Body, opts...)
	}
	f, err := os.Open(source)
	if err != nil {
		return nil, fmt.Errorf("failed opening local instrument file: %w", err)
	}
	defer f.Close()
	return s.syncBoundedSource(ctx, f, opts...)
}

// Finish the bounded read before importing, so oversized or failed downloads
// cannot partially update the master. The temporary file is private and removed.
func (s *Service) syncBoundedSource(ctx context.Context, source io.Reader, opts ...SyncOptions) (*SyncStats, error) {
	f, err := os.CreateTemp("", "instrument-master-*.json")
	if err != nil {
		return nil, err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	n, err := io.Copy(f, io.LimitReader(source, maxScripMasterBytes+1))
	if err != nil {
		return nil, fmt.Errorf("reading instrument source: %w", err)
	}
	if n > maxScripMasterBytes {
		return nil, fmt.Errorf("instrument source exceeds 128 MiB limit")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}
	return s.SyncFromReader(ctx, f, opts...)
}

// RunLifecycle preserves expired identities but removes them from current discovery.
func (s *Service) RunLifecycle(ctx context.Context) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		_, _ = s.ExpireInstruments(ctx, time.Now())
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *Service) DerivativeUnderlyings(ctx context.Context) ([]string, error) {
	if s.db == nil {
		return nil, fmt.Errorf("instrument master unavailable")
	}
	var members []model.Instrument
	if err := s.db.WithContext(ctx).Distinct("underlying", "underlying_symbol", "expiry").Where("active = ? AND is_tradable = ? AND instrument_type IN ?", true, true, []string{"FUTIDX", "FUTSTK", "OPTIDX", "OPTSTK"}).Find(&members).Error; err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	for _, inst := range members {
		if isExchangeTestInstrument(inst) {
			continue
		}
		expiry, err := ParseExpiryDate(inst.Expiry, nil)
		if err != nil || !time.Now().Before(expiry) {
			continue
		}
		name := inst.Underlying
		if name == "" {
			name = inst.UnderlyingSymbol
		}
		if name != "" {
			seen[name] = true
		}
	}
	names := make([]string, 0, len(seen))
	for name := range seen {
		names = append(names, name)
	}
	sort.Strings(names)
	return names, nil
}

// DerivativeStocks returns the complete eligible NSE equity universe without
// truncating a general instrument search or presenting derivative-only test names.
func (s *Service) DerivativeStocks(ctx context.Context) ([]dto.InstrumentResponse, error) {
	names, err := s.DerivativeUnderlyings(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]dto.InstrumentResponse, 0)
	if len(names) == 0 {
		return out, nil
	}
	symbols := make([]string, 0, len(names)*2)
	for i, name := range names {
		names[i] = strings.ToUpper(name)
		symbols = append(symbols, names[i], names[i]+"-EQ")
	}
	var equities []model.Instrument
	err = s.db.WithContext(ctx).
		Where("active = ? AND is_tradable = ? AND instrument_type = ?", true, true, "EQUITY").
		Where("exchange = ? OR exchange_segment = ?", "NSE", "NSE").
		Where("UPPER(symbol) IN ?", symbols).
		Order("symbol ASC").Find(&equities).Error
	if err != nil {
		return nil, err
	}
	for _, equity := range equities {
		if isExchangeTestInstrument(equity) {
			continue
		}
		out = append(out, ToCanonicalInstrument(equity))
	}
	return out, nil
}
