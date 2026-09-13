package handler

import (
	"net/http"
	"strings"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/stock/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
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
	var instruments []model.Instrument
	if err := database.GetDB().Where("symbol ILIKE ? ESCAPE '\\' OR name ILIKE ? ESCAPE '\\'", pattern, pattern).
		Order("symbol ASC").
		Limit(50).Find(&instruments).Error; err != nil {
		response.Error(c, http.StatusServiceUnavailable, "Instrument search is temporarily unavailable", nil)
		return
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
