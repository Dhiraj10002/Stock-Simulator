package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
)

// Handler handles HTTP requests for canonical instruments.
type Handler struct {
	svc *service.Service
}

// New creates a new instrument handler.
func New() *Handler {
	return &Handler{
		svc: service.NewService(database.GetDB()),
	}
}

// NewWithService creates an instrument handler with a custom service.
func NewWithService(svc *service.Service) *Handler {
	return &Handler{svc: svc}
}

// List handles GET /api/v1/instruments.
func (h *Handler) List(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	exchange := strings.TrimSpace(c.Query("exchange"))
	instrumentType := strings.TrimSpace(c.Query("instrument_type"))
	underlying := strings.TrimSpace(c.Query("underlying"))
	activeStr := strings.TrimSpace(c.Query("active"))
	limitStr := strings.TrimSpace(c.Query("limit"))

	activeOnly := true
	if activeStr == "false" || activeStr == "0" {
		activeOnly = false
	}

	limit := 100
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	results, err := h.svc.List(q, exchange, instrumentType, underlying, activeOnly, limit)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "failed to query instruments", err.Error())
		return
	}

	response.Success(c, http.StatusOK, "Instruments retrieved successfully", results)
}

// GetBySymbol handles GET /api/v1/instruments/:symbol.
func (h *Handler) GetBySymbol(c *gin.Context) {
	symbol := strings.TrimSpace(c.Param("symbol"))
	if symbol == "" {
		response.Error(c, http.StatusBadRequest, "symbol parameter is required", nil)
		return
	}

	inst, err := h.svc.GetBySymbol(symbol)
	if err != nil {
		response.Error(c, http.StatusNotFound, "Instrument not found", err.Error())
		return
	}

	response.Success(c, http.StatusOK, "Instrument retrieved successfully", inst)
}
