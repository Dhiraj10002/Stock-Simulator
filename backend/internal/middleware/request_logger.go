package middleware

import (
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/logger"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		startedAt := time.Now()
		c.Next()

		logger.Info("http request",
			zap.String("request_id", c.GetString(RequestIDKey)),
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.Int("status", c.Writer.Status()),
			zap.Duration("latency", time.Since(startedAt)),
			zap.String("client_ip", c.ClientIP()),
		)
	}
}
