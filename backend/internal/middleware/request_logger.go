package middleware

import (
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/logger"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// RequestLogger emits structured HTTP access logs with request_id, user_id (if authenticated),
// order_id (if targeted), path, method, status, client_ip, and latency.
// Sensitive headers and credentials are strictly excluded.
func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		startedAt := time.Now()
		c.Next()

		latency := time.Since(startedAt)
		reqID := c.GetString(RequestIDKey)
		if reqID == "" {
			reqID = c.GetHeader("X-Request-ID")
		}

		fields := []zap.Field{
			logger.RequestID(reqID),
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.Int("status", c.Writer.Status()),
			logger.Latency(latency),
			zap.Int64("latency_ms", latency.Milliseconds()),
			zap.String("client_ip", c.ClientIP()),
		}

		// Attach user_id if present from auth middleware
		if userID := c.GetString("user_id"); userID != "" {
			fields = append(fields, logger.UserID(userID))
		}

		// Attach order_id if present from path parameter or context
		orderID := c.Param("id")
		if orderID == "" {
			orderID = c.Param("uuid")
		}
		if orderID != "" {
			fields = append(fields, logger.OrderID(orderID))
		}

		// Log query parameters only after scrubbing sensitive fields
		if rawQuery := c.Request.URL.RawQuery; rawQuery != "" {
			fields = append(fields, zap.String("query", logger.SanitizeText(rawQuery)))
		}

		logger.Info("http request completed", fields...)
	}
}
