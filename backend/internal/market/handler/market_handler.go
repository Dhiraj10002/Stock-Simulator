package handler

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/cache"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
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

func (h *Handler) SetWorkerURL(workerURL string) {
	if h.service != nil {
		h.service.SetWorkerURL(workerURL)
	}
}

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

func (h *Handler) Status(c *gin.Context) {
	now := time.Now()
	isWeekend := calendar.IsWeekend(now)
	isHoliday, holidayName := calendar.IsTradingHoliday(now)

	ist := now.In(calendar.Location())
	currentMinute := ist.Hour()*60 + ist.Minute()

	status := "CLOSED"
	isOpen := false

	if isWeekend {
		status = "CLOSED"
	} else if isHoliday {
		status = "HOLIDAY"
	} else if currentMinute >= 9*60 && currentMinute < 9*60+15 {
		status = "PRE_OPEN"
	} else if currentMinute >= 9*60+15 && currentMinute < 15*60+30 {
		status = "OPEN"
		isOpen = true
	} else if currentMinute >= 15*60+30 && currentMinute < 16*60 {
		status = "POST_MARKET"
	} else {
		status = "CLOSED"
	}

	feedStatus, _ := h.service.FeedStatus(c.Request.Context())
	feedProvider := "unknown"
	feedState := "DISCONNECTED"
	isSynthetic := true
	lastTick := ""

	if feedStatus != nil {
		if feedStatus.FeedProvider != "" {
			feedProvider = feedStatus.FeedProvider
		}
		if feedStatus.FeedState != "" {
			feedState = feedStatus.FeedState
		}
		isSynthetic = feedStatus.IsSynthetic
		lastTick = feedStatus.LastTick
	}

	response.Success(c, http.StatusOK, "Market status retrieved successfully", gin.H{
		"status":        status,
		"is_open":       isOpen,
		"server_time":   ist.Format(time.RFC3339),
		"holiday_name":  holidayName,
		"feed_provider": feedProvider,
		"feed_state":    feedState,
		"is_synthetic":  isSynthetic,
		"last_tick":     lastTick,
	})
}
