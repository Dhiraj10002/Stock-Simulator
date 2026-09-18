package handler

import (
	"net/http"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/analytics/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
)

type AnalyticsHandler struct {
	service *service.AnalyticsService
}

func New() *AnalyticsHandler {
	return &AnalyticsHandler{
		service: service.New(),
	}
}

func (h *AnalyticsHandler) GetPerformanceOverview(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		response.Error(c, http.StatusUnauthorized, "Unauthorized", nil)
		return
	}

	res, err := h.service.GetPerformanceOverview(userID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error(), nil)
		return
	}

	response.Success(c, http.StatusOK, "Performance overview retrieved successfully", res)
}

func (h *AnalyticsHandler) GetPnlCalendar(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		response.Error(c, http.StatusUnauthorized, "Unauthorized", nil)
		return
	}

	month := c.Query("month") // e.g. "2026-09"

	res, err := h.service.GetPnlCalendar(userID, month)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error(), nil)
		return
	}

	response.Success(c, http.StatusOK, "P&L calendar retrieved successfully", res)
}
