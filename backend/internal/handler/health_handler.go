package handler

import (
	"net/http"

	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
)

type HealthHandler struct{}

func NewHealthHandler() *HealthHandler {
	return &HealthHandler{}
}

func (h *HealthHandler) Health(c *gin.Context) {
	response.Success(
		c,
		http.StatusOK,
		"Stock Simulator API is running",
		gin.H{
			"version": "v1",
		},
	)
}
