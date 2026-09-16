package handler

import (
	"net/http"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/ai/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/ai/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
)

type MentorHandler struct{ service *service.MentorService }

func New(cfg *config.Config) *MentorHandler { return &MentorHandler{service: service.New(cfg)} }

func (h *MentorHandler) Analyze(c *gin.Context) {
	var request dto.MentorRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		response.Error(c, http.StatusBadRequest, "Invalid mentor request", err.Error())
		return
	}
	answer, err := h.service.Analyze(c.Request.Context(), c.GetString("user_id"), request.Question)
	if err != nil {
		response.Error(c, http.StatusServiceUnavailable, err.Error(), nil)
		return
	}
	response.Success(c, http.StatusOK, "Educational analysis generated", dto.MentorResponse{Answer: answer})
}

func (h *MentorHandler) Critique(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		response.Error(c, http.StatusUnauthorized, "Unauthorized", nil)
		return
	}

	critique, err := h.service.Critique(c.Request.Context(), userID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "Failed to generate trade critique", err.Error())
		return
	}

	response.Success(c, http.StatusOK, "Trade post-mortem critique generated", critique)
}
