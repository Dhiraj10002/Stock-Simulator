package handler

import (
	"net/http"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/wallet/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
)

type WalletHandler struct{ service *service.WalletService }

func New(cfg *config.Config) *WalletHandler { return &WalletHandler{service: service.New(cfg)} }

func (h *WalletHandler) Get(c *gin.Context) {
	wallet, err := h.service.Get(c.GetString("user_id"))
	if err != nil {
		response.Error(c, http.StatusNotFound, "Wallet not found", nil)
		return
	}
	response.Success(c, http.StatusOK, "Wallet retrieved successfully", wallet)
}

func (h *WalletHandler) Transactions(c *gin.Context) {
	transactions, err := h.service.Transactions(c.GetString("user_id"))
	if err != nil {
		response.Error(c, http.StatusNotFound, "Wallet not found", nil)
		return
	}
	response.Success(c, http.StatusOK, "Wallet transactions retrieved successfully", transactions)
}

func (h *WalletHandler) Reset(c *gin.Context) {
	wallet, err := h.service.Reset(c.GetString("user_id"))
	if err != nil {
		response.Error(c, http.StatusNotFound, "Wallet not found", nil)
		return
	}
	response.Success(c, http.StatusOK, "Wallet reset successfully", wallet)
}
