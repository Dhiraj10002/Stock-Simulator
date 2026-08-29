package handler

import (
	"net/http"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/trade/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
)

type TradeHandler struct{ service *service.TradeService }

func New() *TradeHandler { return &TradeHandler{service: service.New()} }

func (h *TradeHandler) List(c *gin.Context) {
	trades, err := h.service.List(c.GetString("user_id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	response.Success(c, http.StatusOK, "Trades retrieved successfully", trades)
}
