package handler

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	instrumentService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/alias"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
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
		month := m[3]
		strikeVal := m[5]
		oType := m[6]
		return fmt.Sprintf("%s %s %s %s", under, month, strikeVal, oType), oType, under
	}

	// 3. Spaced option e.g. "TCS 4150 CE"
	if strings.Contains(cleanSym, " CE") || strings.Contains(cleanSym, " PE") {
		parts := strings.Fields(cleanSym)
		if len(parts) >= 3 {
			month := "SEP"
			monthRe := regexp.MustCompile(`(?i)[A-Z]{3}`)
			if found := monthRe.FindString(expiry); len(found) == 3 {
				month = strings.ToUpper(found)
			}
			return fmt.Sprintf("%s %s %s %s", parts[0], month, parts[1], parts[2]), parts[2], parts[0]
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

	segment := strings.TrimSpace(c.Query("segment"))
	if segment != "" && segment != "ALL" {
		dbQuery = dbQuery.Where("exchange_segment = ? OR instrument_type = ?", segment, segment)
	}

	// Smart relevance ordering:
	// 1. Exact match (symbol == query or symbol == query + "-EQ")
	// 2. Prefix equity match (symbol LIKE query% and EQ)
	// 3. Prefix equity match on name
	// 4. Prefix futures match (symbol LIKE query% and FUT)
	// 5. Prefix options match (symbol LIKE query% and OPT)
	// 6. Other prefix matches
	// 7. General substring matches
	orderExpr := gorm.Expr(`
		CASE 
			WHEN UPPER(symbol) = UPPER(?) OR UPPER(symbol) = UPPER(?) || '-EQ' THEN 1
			WHEN UPPER(symbol) LIKE UPPER(?) AND (instrument_type = '' OR instrument_type = 'EQ') THEN 2
			WHEN UPPER(name) LIKE UPPER(?) AND (instrument_type = '' OR instrument_type = 'EQ') THEN 3
			WHEN UPPER(symbol) LIKE UPPER(?) AND instrument_type LIKE 'FUT%' THEN 4
			WHEN UPPER(symbol) LIKE UPPER(?) AND instrument_type LIKE 'OPT%' THEN 5
			WHEN UPPER(symbol) LIKE UPPER(?) THEN 6
			ELSE 7
		END,
		LENGTH(symbol) ASC,
		symbol ASC
	`, query, query, prefixPattern, prefixPattern, prefixPattern, prefixPattern, prefixPattern)

	var instruments []model.Instrument
	if err := dbQuery.Order(orderExpr).Limit(100).Find(&instruments).Error; err != nil {
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

	items := make([]dto.StockResponse, 0, len(instruments))
	for _, instrument := range instruments {
		dispName, optType, _ := formatKiteDisplayName(instrument.Symbol, instrument.Expiry, instrument.Strike, instrument.OptionType)
		var pricePaise int64
		var changePct float64

		if h.market != nil {
			if q, err := h.market.CachedQuote(instrument.Symbol); err == nil && q != nil && q.PricePaise > 0 {
				pricePaise = q.PricePaise
				changePct = q.ChangePercent
			}
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
