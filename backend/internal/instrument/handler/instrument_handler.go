package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
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

// Service returns the underlying instrument Service.
func (h *Handler) Service() *service.Service {
	if h == nil {
		return nil
	}
	return h.svc
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

// GetActiveSnapshot handles GET /api/v1/instruments/snapshots/active.
func (h *Handler) GetActiveSnapshot(c *gin.Context) {
	snap, err := h.svc.GetActiveSnapshot(c.Request.Context())
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "failed to get active instrument snapshot", err.Error())
		return
	}
	resp := formatSnapshotResponse(snap)
	response.Success(c, http.StatusOK, "Active instrument snapshot retrieved successfully", resp)
}

// ListSnapshots handles GET /api/v1/instruments/snapshots.
func (h *Handler) ListSnapshots(c *gin.Context) {
	limitStr := strings.TrimSpace(c.Query("limit"))
	limit := 20
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	snaps, err := h.svc.ListSnapshots(c.Request.Context(), limit)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "failed to list instrument snapshots", err.Error())
		return
	}

	out := make([]dto.SnapshotResponse, len(snaps))
	for i, s := range snaps {
		out[i] = formatSnapshotResponse(&s)
	}
	response.Success(c, http.StatusOK, "Instrument snapshots retrieved successfully", out)
}

// GetMasterStatus handles GET /api/v1/instruments/master/status.
func (h *Handler) GetMasterStatus(c *gin.Context) {
	snap, err := h.svc.GetActiveSnapshot(c.Request.Context())
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "failed to get master status", err.Error())
		return
	}

	var activatedStr *string
	if snap.ActivatedAt != nil {
		s := snap.ActivatedAt.Format("2006-01-02T15:04:05Z07:00")
		activatedStr = &s
	}

	resp := gin.H{
		"active_version":    snap.Version,
		"source":            snap.Source,
		"status":            snap.Status,
		"total_instruments": snap.TotalInstruments,
		"equity_count":      snap.EquityCount,
		"futures_count":     snap.FuturesCount,
		"options_count":     snap.OptionsCount,
		"index_count":       snap.IndexCount,
		"activated_at":      activatedStr,
	}
	response.Success(c, http.StatusOK, "Instrument master status retrieved successfully", resp)
}

func formatSnapshotResponse(snap *model.InstrumentSnapshot) dto.SnapshotResponse {
	if snap == nil {
		return dto.SnapshotResponse{}
	}
	var actAt *string
	if snap.ActivatedAt != nil {
		s := snap.ActivatedAt.Format("2006-01-02T15:04:05Z07:00")
		actAt = &s
	}
	return dto.SnapshotResponse{
		ID:               snap.ID,
		Version:          snap.Version,
		Source:           snap.Source,
		TotalInstruments: snap.TotalInstruments,
		EquityCount:      snap.EquityCount,
		FuturesCount:     snap.FuturesCount,
		OptionsCount:     snap.OptionsCount,
		IndexCount:       snap.IndexCount,
		Status:           snap.Status,
		ValidationErrors: snap.ValidationErrors,
		ActivatedAt:      actAt,
		CreatedAt:        snap.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

func (h *Handler) DerivativeUnderlyings(c *gin.Context) {
	names, err := h.svc.DerivativeUnderlyings(c.Request.Context())
	if err != nil {
		response.Error(c, http.StatusServiceUnavailable, "Instrument master unavailable", nil)
		return
	}
	response.Success(c, http.StatusOK, "Current eligible underlyings", names)
}

func (h *Handler) DerivativeStocks(c *gin.Context) {
	stocks, err := h.svc.DerivativeStocks(c.Request.Context())
	if err != nil {
		response.Error(c, http.StatusServiceUnavailable, "Eligible stock universe unavailable", nil)
		return
	}
	response.Success(c, http.StatusOK, "Current F&O eligible NSE equities", stocks)
}

func (h *Handler) FuturesCatalog(c *gin.Context) {
	contracts, err := h.svc.FuturesCatalog(c.Request.Context())
	if err != nil {
		response.Error(c, http.StatusServiceUnavailable, "Current futures catalog unavailable", nil)
		return
	}
	response.Success(c, http.StatusOK, "Current canonical futures", contracts)
}
