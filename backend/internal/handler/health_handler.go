package handler

import (
	"net/http"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
)

type HealthHandler struct{}

func NewHealthHandler() *HealthHandler {
	return &HealthHandler{}
}

func (h *HealthHandler) Health(c *gin.Context) {
	dbStatus := "not_configured"
	if db := database.GetDB(); db != nil {
		if sqlDB, err := db.DB(); err == nil {
			if err := sqlDB.PingContext(c.Request.Context()); err == nil {
				dbStatus = "connected"
			} else {
				dbStatus = "unreachable"
			}
		}
	}

	response.Success(
		c,
		http.StatusOK,
		"Stock Simulator API is running",
		gin.H{
			"version":  "v1",
			"status":   "healthy",
			"database": dbStatus,
		},
	)
}
