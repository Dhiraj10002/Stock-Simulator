package handler

import (
	"net/http"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/simulation/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
)

type SimulationHandler struct{ service *service.SimulationService }

func New(cfg *config.Config) *SimulationHandler {
	return &SimulationHandler{service: service.New(cfg)}
}

func (h *SimulationHandler) Reset(c *gin.Context) {
	if err := h.service.Reset(c.GetString("user_id")); err != nil {
		response.Error(c, http.StatusInternalServerError, "Unable to reset simulation", nil)
		return
	}
	response.Success(c, http.StatusOK, "Simulation reset successfully", nil)
}
