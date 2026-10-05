package handler

import (
	"fmt"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	"gorm.io/gorm/clause"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	instrumentService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/alias"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/product"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/stock/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var (
	futRegex = regexp.MustCompile(`^([A-Z&]+?)(\d{1,2})?([A-Z]{3})(\d{2})?FUT$`)
	optRegex = regexp.MustCompile(`^([A-Z&]+?)(\d{1,2})?([A-Z]{3})(\d{2})?(\d+(?:\.\d+)?)(CE|PE)$`)
)

type Handler struct {
	market *marketService.Service
}

func New(market ...*marketService.Service) *Handler {
	var m *marketService.Service
	if len(market) > 0 {
		m = market[0]
	}
	return &Handler{market: m}
}

func formatKiteDisplayName(symbol, expiry, strike, optionType string) (displayName, optType, under string) {
	cleanSym := strings.ToUpper(strings.TrimSpace(symbol))
	cleanSym = strings.TrimSuffix(cleanSym, "-EQ")

	// 1. Futures: e.g. KEI27OCT26FUT, TCS29SEP26FUT, KEI26SEPFUT, NIFTY26SEPFUT
	if m := futRegex.FindStringSubmatch(cleanSym); len(m) > 0 {
		under = m[1]
		month := m[3]
		return fmt.Sprintf("%s %s FUT", under, month), "", under
	}

	// 2. Options: e.g. TCS29SEP261940CE, TCS27OCT262300CE, KEI27OCT264500PE
	if m := optRegex.FindStringSubmatch(cleanSym); len(m) > 0 {
		under = m[1]
		oType := m[6]
		// The optional year in a broker symbol is ambiguous: TCS26DEC1920PE
		// can be misread as year 19, strike 20. The master strike is in rupees.
		return instrumentService.FormatCanonicalDisplaySymbol(symbol, expiry, strike, oType, ""), oType, under
	}

	// 3. Spaced option e.g. "TCS 4150 CE"
	if strings.Contains(cleanSym, " CE") || strings.Contains(cleanSym, " PE") {
		parts := strings.Fields(cleanSym)
		if len(parts) >= 3 {
			month := ""
			if date, err := instrumentService.ParseExpiryDate(expiry, calendar.Location()); err == nil {
				month = strings.ToUpper(date.Format("Jan"))
			}
			strikeValue := strike
			if strikeValue == "" {
				strikeValue = parts[1]
			}
			label := strings.Join(strings.Fields(fmt.Sprintf("%s %s %s %s", parts[0], month, strikeValue, parts[2])), " ")
			return label, parts[2], parts[0]
		}
	}

	return cleanSym, optionType, cleanSym
}

// Search returns instruments imported from Angel One's instrument master.
// The worker owns refreshes; this handler is deliberately read-only.
func (h *Handler) Search(c *gin.Context) {
	query := strings.TrimSpace(c.Query("q"))
	if query == "" {
		response.Error(c, http.StatusBadRequest, "q is required", nil)
		return
	}

	// Escape LIKE metacharacters so a user search is treated as text.
	escaped := strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(query)
	pattern := "%" + escaped + "%"
	prefixPattern := escaped + "%"
	aliasPattern := ""
	queryClean := strings.ToUpper(strings.TrimSpace(query))
	queryClean = strings.TrimSuffix(queryClean, "-EQ")
	canonical := alias.ResolveCanonicalSymbol(queryClean)
	if canonical != "" && canonical != queryClean {
		aliasPattern = "%" + canonical + "%"
	} else {
		for a, target := range alias.GetAllAliases() {
			if strings.Contains(queryClean, a) {
				aliasPattern = "%" + target + "%"
				break
			}
		}
	}

	db := database.GetDB()
	if db == nil {
		response.Error(c, http.StatusServiceUnavailable, "database not connected", nil)
		return
	}
	dbQuery := db.Where("symbol ILIKE ? ESCAPE '\\' OR name ILIKE ? ESCAPE '\\'", pattern, pattern)
	if aliasPattern != "" {
		dbQuery = db.Where("symbol ILIKE ? ESCAPE '\\' OR name ILIKE ? ESCAPE '\\' OR symbol ILIKE ? OR name ILIKE ?", pattern, pattern, aliasPattern, aliasPattern)
	}

	// Imported masters contain historical contracts and non-equity NSE securities.
	dbQuery = dbQuery.Where("active = ?", true).
		Where("instrument_type IN ?", []string{"", "EQ", "EQUITY", "INDEX", "AMXIDX", "FUTSTK", "FUTIDX", "OPTSTK", "OPTIDX"}).
		Where("exchange_segment IN ('NFO', 'BFO') OR instrument_type IN ('INDEX', 'AMXIDX') OR symbol NOT LIKE '%-%' OR symbol LIKE '%-EQ'")
	// Legacy demo tokens cannot be resolved by the live broker.
	if h.market == nil || h.market.FeedMode() != marketDTO.FeedModeSynthetic {
		dbQuery = dbQuery.Where("token ~ '^[0-9]+$'")
	}
	now := time.Now().In(calendar.Location())
	cutoff := now.Format("2006-01-02")
	if now.Hour() > 15 || (now.Hour() == 15 && now.Minute() >= 30) {
		cutoff = now.AddDate(0, 0, 1).Format("2006-01-02")
	}
	dbQuery = dbQuery.Where(`COALESCE(expiry, '') = '' OR
		(CASE WHEN expiry ~ '^\d{4}-\d{2}-\d{2}$' THEN expiry::date
		 WHEN expiry ~ '^\d{2}[A-Za-z]{3}\d{4}$' THEN to_date(expiry, 'DDMONYYYY')
		 WHEN expiry ~ '^\d{2}-[A-Za-z]{3}-\d{4}$' THEN to_date(expiry, 'DD-MON-YYYY') END) >= ?::date`, cutoff)

	segment := strings.TrimSpace(c.Query("segment"))
	if segment == "FUTURES" {
		dbQuery = dbQuery.Where("instrument_type IN ?", []string{"FUTSTK", "FUTIDX"})
	} else if segment == "OPTIONS" {
		dbQuery = dbQuery.Where("instrument_type IN ?", []string{"OPTSTK", "OPTIDX"})
	} else if segment != "" && segment != "ALL" {
		dbQuery = dbQuery.Where("exchange_segment = ? OR instrument_type = ?", segment, segment)
	}

	var instruments []model.Instrument
	if err := dbQuery.Clauses(searchOrder(query, prefixPattern)).Limit(100).Find(&instruments).Error; err != nil {
		// Fallback to simple order if custom order fails
		if errFallback := dbQuery.Order("symbol ASC").Limit(100).Find(&instruments).Error; errFallback != nil {
			response.Error(c, http.StatusServiceUnavailable, "Instrument search is temporarily unavailable", nil)
			return
		}
	}

	if len(instruments) == 0 {
		var dbCount int64
		_ = db.Model(&model.Instrument{}).Count(&dbCount).Error
		if dbCount == 0 {
			qUpper := strings.ToUpper(query)
			segUpper := strings.ToUpper(segment)
			for _, inst := range instrumentService.DefaultCanonicalInstruments {
				if inst.Expiry != "" {
					expiry, err := product.ParseContractExpiry(inst.Expiry)
					if err != nil || !expiry.After(now) {
						continue
					}
				}
				if segUpper != "" && segUpper != "ALL" {
					if !strings.EqualFold(inst.ExchangeSegment, segUpper) && !strings.EqualFold(inst.InstrumentType, segUpper) {
						continue
					}
				}
				if strings.Contains(strings.ToUpper(inst.Symbol), qUpper) ||
					strings.Contains(strings.ToUpper(inst.DisplaySymbol), qUpper) ||
					strings.Contains(strings.ToUpper(inst.Name), qUpper) {
					instruments = append(instruments, inst)
				}
			}
		}
	}

	// Prefer the master symbol over a duplicate display alias in one exchange.
	unique := make([]model.Instrument, 0, len(instruments))
	seen := make(map[string]int)
	for _, inst := range instruments {
		key := inst.ExchangeSegment + ":" + strings.TrimSuffix(strings.ToUpper(inst.Symbol), "-EQ")
		if i, ok := seen[key]; ok {
			if strings.HasSuffix(inst.Symbol, "-EQ") {
				unique[i] = inst
			}
			continue
		}
		seen[key] = len(unique)
		unique = append(unique, inst)
	}
	instruments = unique
	quotes := map[string]*marketDTO.QuoteResponse{}
	if h.market != nil {
		symbols := make([]string, 0, len(instruments))
		for _, inst := range instruments {
			symbols = append(symbols, inst.Symbol)
		}
		quotes = h.market.BatchQuotes(symbols)
	}
	items := make([]dto.StockResponse, 0, len(instruments))
	for _, instrument := range instruments {
		dispName, optType, _ := formatKiteDisplayName(instrument.Symbol, instrument.Expiry, instrument.Strike, instrument.OptionType)
		var pricePaise int64
		var changePct float64

		if q := quotes[instrument.Symbol]; q != nil {
			pricePaise, changePct = q.PricePaise, q.ChangePercent
		}

		items = append(items, dto.StockResponse{
			Token:           instrument.Token,
			Symbol:          instrument.Symbol,
			DisplayName:     dispName,
			Name:            instrument.Name,
			Expiry:          instrument.Expiry,
			Strike:          instrument.Strike,
			OptionType:      optType,
			LotSize:         instrument.LotSize,
			InstrumentType:  instrument.InstrumentType,
			ExchangeSegment: instrument.ExchangeSegment,
			TickSize:        instrument.TickSize,
			PricePaise:      pricePaise,
			ChangePercent:   changePct,
		})
	}
	response.Success(c, http.StatusOK, "Stocks retrieved successfully", items)
}

func searchOrder(query, prefixPattern string) clause.OrderBy {
	return clause.OrderBy{Expression: gorm.Expr(`
		CASE
			WHEN UPPER(symbol) = UPPER(?) OR UPPER(symbol) = UPPER(?) || '-EQ' THEN 1
			WHEN UPPER(symbol) LIKE UPPER(?) AND (instrument_type = '' OR instrument_type IN ('EQ', 'EQUITY')) THEN 2
			WHEN UPPER(name) LIKE UPPER(?) AND (instrument_type = '' OR instrument_type IN ('EQ', 'EQUITY')) THEN 3
			WHEN UPPER(symbol) LIKE UPPER(?) AND instrument_type LIKE 'FUT%' THEN 4
			WHEN UPPER(symbol) LIKE UPPER(?) AND instrument_type LIKE 'OPT%' THEN 5
			WHEN UPPER(symbol) LIKE UPPER(?) THEN 6
			ELSE 7
		END,
		LENGTH(symbol) ASC,
		symbol ASC
	`, query, query, prefixPattern, prefixPattern, prefixPattern, prefixPattern, prefixPattern)}
}
