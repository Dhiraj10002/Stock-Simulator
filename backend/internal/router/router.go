package router

import (
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/handler"
	"github.com/gin-gonic/gin"
)

func Setup() *gin.Engine {

	router := gin.Default()

	healthHandler := handler.NewHealthHandler()

	api := router.Group("/api/v1")

	api.GET("/health", healthHandler.Health)

	return router
}