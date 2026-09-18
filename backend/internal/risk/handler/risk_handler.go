package handler

import (
	"net/http"

	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/risk/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type RiskHandler struct {
	service *service.RiskService
}

func New(market *marketService.Service) *RiskHandler {
	return &RiskHandler{service: service.New(market)}
}

func (h *RiskHandler) GetOverview(c *gin.Context) {
	userID := c.GetString("user_id")
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid user identity", nil)
		return
	}

	overview, err := h.service.GetOverview(userUUID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error(), nil)
		return
	}

	response.Success(c, http.StatusOK, "Risk overview retrieved successfully", overview)
}
