package handler

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type OrderHandler struct{ service *service.OrderService }

func New(market *marketService.Service, cfg *config.Config) *OrderHandler {
	return &OrderHandler{service: service.New(market, cfg)}
}

func (h *OrderHandler) Service() *service.OrderService { return h.service }

// RunMatcher keeps limit orders eligible for execution as fresh Redis quote
// updates arrive. It is started once by the application router.
func (h *OrderHandler) RunMatcher(ctx context.Context) {
	h.service.RunMatcher(ctx)
}

func (h *OrderHandler) RunProductLifecycle(ctx context.Context) {
	h.service.RunProductLifecycle(ctx)
}

func (h *OrderHandler) RunExpirySettlement(ctx context.Context) { h.service.RunExpirySettlement(ctx) }

func (h *OrderHandler) Create(c *gin.Context) {
	var request dto.CreateOrderRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		response.ErrorWithCode(c, http.StatusBadRequest, "INVALID_REQUEST_PAYLOAD", "Invalid order request", err.Error())
		return
	}
	order, err := h.service.Create(c.GetString("user_id"), request)
	if err != nil {
		if errors.Is(err, service.ErrInstrumentNotFound) {
			response.ErrorWithCode(c, http.StatusNotFound, "INSTRUMENT_NOT_FOUND", "Instrument not found in canonical master", nil)
			return
		}
		if errors.Is(err, marketService.ErrQuoteNotFound) {
			response.ErrorWithCode(c, http.StatusNotFound, "QUOTE_NOT_FOUND", "Market quote not found for symbol", nil)
			return
		}
		if errors.Is(err, marketService.ErrQuoteStale) {
			response.ErrorWithCode(c, http.StatusBadRequest, "QUOTE_STALE", "Market quote is stale; cannot execute order", nil)
			return
		}
		if errors.Is(err, marketService.ErrQuoteIneligible) {
			response.ErrorWithCode(c, http.StatusBadRequest, "QUOTE_INELIGIBLE", "Market quote source is not eligible for execution", nil)
			return
		}
		if errors.Is(err, marketService.ErrQuoteUnavailable) {
			response.ErrorWithCode(c, http.StatusServiceUnavailable, "MARKET_DATA_UNAVAILABLE", "Market data is currently unavailable", nil)
			return
		}
		errMsg := err.Error()
		code := "ORDER_CREATION_FAILED"
		switch {
		case strings.Contains(errMsg, "insufficient") && strings.Contains(errMsg, "balance"):
			code = "INSUFFICIENT_FUNDS"
		case strings.Contains(errMsg, "short-selling") || strings.Contains(errMsg, "delivery sell without holdings") || strings.Contains(errMsg, "holdings"):
			code = "INSUFFICIENT_HOLDINGS"
		case strings.Contains(errMsg, "expired"):
			code = "EXPIRED_CONTRACT"
		case strings.Contains(errMsg, "circuit"):
			code = "CIRCUIT_LIMIT_EXCEEDED"
		case strings.Contains(errMsg, "market is closed") || strings.Contains(errMsg, "trading hours"):
			code = "MARKET_CLOSED"
		case strings.Contains(errMsg, "not available yet") || strings.Contains(errMsg, "unsupported") || strings.Contains(errMsg, "supported"):
			code = "UNSUPPORTED_PRODUCT"
		case strings.Contains(errMsg, "tick size"):
			code = "INVALID_TICK_SIZE"
		}
		response.ErrorWithCode(c, http.StatusBadRequest, code, errMsg, nil)
		return
	}
	response.Success(c, http.StatusCreated, "Order created successfully", order)
}

func (h *OrderHandler) List(c *gin.Context) {
	orders, err := h.service.List(c.GetString("user_id"))
	if err != nil {
		response.ErrorWithCode(c, http.StatusBadRequest, "ORDER_LIST_FAILED", err.Error(), nil)
		return
	}
	response.Success(c, http.StatusOK, "Orders retrieved successfully", orders)
}

func (h *OrderHandler) Get(c *gin.Context) {
	order, err := h.service.Get(c.GetString("user_id"), c.Param("id"))
	if err != nil {
		response.ErrorWithCode(c, http.StatusNotFound, "ORDER_NOT_FOUND", "Order not found", nil)
		return
	}
	response.Success(c, http.StatusOK, "Order retrieved successfully", order)
}

func (h *OrderHandler) Cancel(c *gin.Context) {
	if err := h.service.Cancel(c.GetString("user_id"), c.Param("id")); err != nil {
		response.ErrorWithCode(c, http.StatusBadRequest, "ORDER_CANCEL_FAILED", err.Error(), nil)
		return
	}
	response.Success(c, http.StatusOK, "Order cancelled successfully", nil)
}

func (h *OrderHandler) Execute(c *gin.Context) {
	if c.Request.ContentLength > 0 {
		response.ErrorWithCode(c, http.StatusBadRequest, "EXECUTION_BODY_FORBIDDEN", "Execution price is server-controlled; this endpoint does not accept a request body", nil)
		return
	}
	if err := h.service.Execute(c.GetString("user_id"), c.Param("id")); err != nil {
		if errors.Is(err, marketService.ErrQuoteNotFound) {
			response.ErrorWithCode(c, http.StatusNotFound, "QUOTE_NOT_FOUND", "Market quote not found for symbol", nil)
			return
		}
		if errors.Is(err, marketService.ErrQuoteStale) {
			response.ErrorWithCode(c, http.StatusBadRequest, "QUOTE_STALE", "Market quote is stale; cannot execute order", nil)
			return
		}
		if errors.Is(err, marketService.ErrQuoteIneligible) {
			response.ErrorWithCode(c, http.StatusBadRequest, "QUOTE_INELIGIBLE", "Market quote source is not eligible for execution", nil)
			return
		}
		if errors.Is(err, marketService.ErrQuoteUnavailable) {
			response.ErrorWithCode(c, http.StatusServiceUnavailable, "MARKET_DATA_UNAVAILABLE", "Market data is currently unavailable", nil)
			return
		}
		errMsg := err.Error()
		code := "EXECUTION_FAILED"
		status := http.StatusBadRequest
		switch {
		case strings.Contains(errMsg, "record not found") || strings.Contains(errMsg, "order not found"):
			code = "ORDER_NOT_FOUND"
			status = http.StatusNotFound
		case strings.Contains(errMsg, "database not connected"):
			code = "DATABASE_UNAVAILABLE"
			status = http.StatusServiceUnavailable
		case strings.Contains(errMsg, "market price does not satisfy limit"):
			code = "LIMIT_PRICE_NOT_MET"
		case strings.Contains(errMsg, "status"):
			code = "INVALID_ORDER_STATUS"
		case strings.Contains(errMsg, "insufficient"):
			code = "INSUFFICIENT_FUNDS"
		}
		response.ErrorWithCode(c, status, code, errMsg, nil)
		return
	}

	response.Success(c, http.StatusOK, "Order executed successfully", nil)
}

func (h *OrderHandler) SquareOffMIS(c *gin.Context) {
	userID := c.GetString("user_id")
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		response.ErrorWithCode(c, http.StatusBadRequest, "INVALID_USER_ID", "Invalid user identity", nil)
		return
	}
	closedCount, err := h.service.TriggerManualMISSquareOff(userUUID)
	if err != nil {
		response.ErrorWithCode(c, http.StatusInternalServerError, "MIS_SQUAREOFF_FAILED", fmt.Sprintf("Failed to square off MIS positions: %v", err), nil)
		return
	}
	response.Success(c, http.StatusOK, fmt.Sprintf("Successfully squared off %d intraday position(s) and cancelled pending orders", closedCount), gin.H{
		"closed_positions_count": closedCount,
	})
}

func (h *OrderHandler) ClearHistory(c *gin.Context) {
	userID := c.GetString("user_id")
	deletedCount, err := h.service.ClearHistory(userID)
	if err != nil {
		response.ErrorWithCode(c, http.StatusInternalServerError, "CLEAR_HISTORY_FAILED", err.Error(), nil)
		return
	}
	response.Success(c, http.StatusOK, fmt.Sprintf("Cleared %d order history records", deletedCount), gin.H{
		"deleted_count": deletedCount,
	})
}

func (h *OrderHandler) SquareOffPosition(c *gin.Context) {
	userID := c.GetString("user_id")
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		response.ErrorWithCode(c, http.StatusBadRequest, "INVALID_USER_ID", "Invalid user identity", nil)
		return
	}
	posUUID, err := uuid.Parse(c.Param("uuid"))
	if err != nil {
		response.ErrorWithCode(c, http.StatusBadRequest, "INVALID_POSITION_ID", "Invalid position ID", nil)
		return
	}
	order, err := h.service.SquareOffPosition(userUUID, posUUID)
	if err != nil {
		errMsg := err.Error()
		if strings.Contains(errMsg, "position not found") {
			response.ErrorWithCode(c, http.StatusNotFound, "POSITION_NOT_FOUND", "Position not found", nil)
			return
		}
		if strings.Contains(errMsg, "position is already closed") {
			response.ErrorWithCode(c, http.StatusBadRequest, "POSITION_ALREADY_CLOSED", "Position is already closed", nil)
			return
		}
		if errors.Is(err, marketService.ErrQuoteNotFound) {
			response.ErrorWithCode(c, http.StatusNotFound, "QUOTE_NOT_FOUND", "Market quote not found for symbol", nil)
			return
		}
		if errors.Is(err, marketService.ErrQuoteStale) {
			response.ErrorWithCode(c, http.StatusBadRequest, "QUOTE_STALE", "Market quote is stale; cannot square off position", nil)
			return
		}
		if errors.Is(err, marketService.ErrQuoteIneligible) {
			response.ErrorWithCode(c, http.StatusBadRequest, "QUOTE_INELIGIBLE", "Market quote source is not eligible for execution", nil)
			return
		}
		if errors.Is(err, marketService.ErrQuoteUnavailable) {
			response.ErrorWithCode(c, http.StatusServiceUnavailable, "MARKET_DATA_UNAVAILABLE", "Market data is currently unavailable", nil)
			return
		}
		response.ErrorWithCode(c, http.StatusBadRequest, "SQUAREOFF_FAILED", errMsg, nil)
		return
	}
	response.Success(c, http.StatusOK, "Position squared off successfully", order)
}
