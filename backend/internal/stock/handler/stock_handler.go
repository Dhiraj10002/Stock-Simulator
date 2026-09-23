package handler

import (
	"net/http"
	"strings"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/stock/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type Handler struct{}

func New() *Handler { return &Handler{} }

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
	aliasMap := map[string]string{
		"ZOMATO":     "ETERNAL",
		"TATAMOTORS": "TMPV",
		"LTI":        "LTIM",
		"MINDTREE":   "LTIM",
	}
	if target, ok := aliasMap[queryClean]; ok {
		aliasPattern = "%" + target + "%"
	} else {
		for alias, target := range aliasMap {
			if strings.Contains(queryClean, alias) {
				aliasPattern = "%" + target + "%"
				break
			}
		}
	}

	db := database.GetDB()
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

	items := make([]dto.StockResponse, 0, len(instruments))
	for _, instrument := range instruments {
		items = append(items, dto.StockResponse{
			Token: instrument.Token, Symbol: instrument.Symbol, Name: instrument.Name,
			Expiry: instrument.Expiry, Strike: instrument.Strike, LotSize: instrument.LotSize,
			InstrumentType: instrument.InstrumentType, ExchangeSegment: instrument.ExchangeSegment,
			TickSize: instrument.TickSize,
		})
	}
	response.Success(c, http.StatusOK, "Stocks retrieved successfully", items)
}
