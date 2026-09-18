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

func (h *TradeHandler) UpdateJournal(c *gin.Context) {
	userID := c.GetString("user_id")
	tradeID := c.Param("uuid")

	var req struct {
		Tag   string `json:"tag"`
		Notes string `json:"notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid journal payload", err.Error())
		return
	}

	if err := h.service.UpdateJournal(userID, tradeID, req.Tag, req.Notes); err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to update trade journal", err.Error())
		return
	}

	response.Success(c, http.StatusOK, "Trade journal updated successfully", gin.H{"uuid": tradeID, "tag": req.Tag, "notes": req.Notes})
}

