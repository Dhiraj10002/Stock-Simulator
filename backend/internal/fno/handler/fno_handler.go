package handler

import (
	"net/http"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/fno/service"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
)

type FNOHandler struct {
	service *service.OptionChainService
}

func New(market *marketService.Service) *FNOHandler {
	return &FNOHandler{
		service: service.New(market),
	}
}

func (h *FNOHandler) GetOptionChain(c *gin.Context) {
	symbol := c.DefaultQuery("symbol", "NIFTY")
	expiry := c.Query("expiry")

	chain, err := h.service.GetOptionChain(symbol, expiry)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error(), nil)
		return
	}

	response.Success(c, http.StatusOK, "Option chain retrieved successfully", chain)
}
