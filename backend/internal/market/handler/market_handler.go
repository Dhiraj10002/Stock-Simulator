package handler

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/cache"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
)

type Handler struct{ service *service.Service }

func New(redisURL string, timeout time.Duration) (*Handler, error) {
	marketService, err := service.New(redisURL, timeout)
	if err != nil {
		return nil, err
	}
	return &Handler{service: marketService}, nil
}

func (h *Handler) Service() *service.Service { return h.service }

func (h *Handler) Quote(c *gin.Context) {
	quote, err := h.service.CurrentQuote(c.Param("symbol"))
	if err != nil {
		if errors.Is(err, cache.ErrUnavailable) {
			response.Error(c, http.StatusServiceUnavailable, "Market data temporarily unavailable", nil)
			return
		}
		response.Error(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	if quote != nil && quote.PricePaise > 0 {
		band := (quote.PricePaise * 10) / 100
		quote.LowerCircuitPaise = quote.PricePaise - band
		if quote.LowerCircuitPaise < 5 {
			quote.LowerCircuitPaise = 5
		}
		quote.UpperCircuitPaise = quote.PricePaise + band
	}
	response.Success(c, http.StatusOK, "Market quote retrieved successfully", quote)
}

func (h *Handler) History(c *gin.Context) {
	limit := 100
	if rawLimit := c.Query("limit"); rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil {
			response.Error(c, http.StatusBadRequest, "limit must be a number", nil)
			return
		}
		limit = parsed
	}
	candles, err := h.service.HistoricalQuotes(c.Param("symbol"), limit)
	if err != nil {
		if errors.Is(err, cache.ErrUnavailable) {
			response.Error(c, http.StatusServiceUnavailable, "Market data temporarily unavailable", nil)
			return
		}
		response.Error(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	response.Success(c, http.StatusOK, "Market history retrieved successfully", candles)
}
