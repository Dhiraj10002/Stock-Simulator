package handler

import (
	"net/http"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/portfolio/service"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
)

type PortfolioHandler struct{ service *service.PortfolioService }

func New(market *marketService.Service) *PortfolioHandler {
	return &PortfolioHandler{service: service.New(market)}
}

func (h *PortfolioHandler) Get(c *gin.Context) {
	data, err := h.service.Get(c.GetString("user_id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	response.Success(c, http.StatusOK, "Portfolio retrieved successfully", data)
}

func (h *PortfolioHandler) Positions(c *gin.Context) {
	data, err := h.service.Positions(c.GetString("user_id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	response.Success(c, http.StatusOK, "Portfolio positions retrieved successfully", data)
}

func (h *PortfolioHandler) Pnl(c *gin.Context) {
	data, err := h.service.Pnl(c.GetString("user_id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, err.Error(), nil)
		return
	}
	response.Success(c, http.StatusOK, "Portfolio P&L retrieved successfully", data)
}
