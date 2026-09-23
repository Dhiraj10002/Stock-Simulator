package handler

import (
	"context"
	"fmt"
	"net/http"

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
		response.Error(c, http.StatusBadRequest, "Invalid order request", err.Error())
		return
	}
	order, err := h.service.Create(c.GetString("user_id"), request)
	if err != nil {
		response.Error(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	response.Success(c, http.StatusCreated, "Order created successfully", order)
}

func (h *OrderHandler) List(c *gin.Context) {
	orders, err := h.service.List(c.GetString("user_id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	response.Success(c, http.StatusOK, "Orders retrieved successfully", orders)
}

func (h *OrderHandler) Get(c *gin.Context) {
	order, err := h.service.Get(c.GetString("user_id"), c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusNotFound, "Order not found", nil)
		return
	}
	response.Success(c, http.StatusOK, "Order retrieved successfully", order)
}

func (h *OrderHandler) Cancel(c *gin.Context) {
	if err := h.service.Cancel(c.GetString("user_id"), c.Param("id")); err != nil {
		response.Error(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	response.Success(c, http.StatusOK, "Order cancelled successfully", nil)
}

func (h *OrderHandler) Execute(c *gin.Context) {
	if c.Request.ContentLength > 0 {
		response.Error(c, http.StatusBadRequest, "Execution price is server-controlled; this endpoint does not accept a request body", nil)
		return
	}
	if err := h.service.Execute(c.GetString("user_id"), c.Param("id")); err != nil {
		response.Error(c, http.StatusBadRequest, err.Error(), nil)
		return
	}

	response.Success(c, http.StatusOK, "Order executed successfully", nil)
}

func (h *OrderHandler) SquareOffMIS(c *gin.Context) {
	userID := c.GetString("user_id")
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid user identity", nil)
		return
	}
	closedCount, err := h.service.TriggerManualMISSquareOff(userUUID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, fmt.Sprintf("Failed to square off MIS positions: %v", err), nil)
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
		response.Error(c, http.StatusInternalServerError, err.Error(), nil)
		return
	}
	response.Success(c, http.StatusOK, fmt.Sprintf("Cleared %d order history records", deletedCount), gin.H{
		"deleted_count": deletedCount,
	})
}
