package middleware

import (
	"net/http"
	"runtime/debug"

	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/logger"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if recovered := recover(); recovered != nil {
				logger.Error("request panicked",
					zap.Any("error", recovered),
					zap.ByteString("stack", debug.Stack()),
				)
				response.Error(c, http.StatusInternalServerError, "Internal server error", nil)
				c.Abort()
			}
		}()

		c.Next()
	}
}
