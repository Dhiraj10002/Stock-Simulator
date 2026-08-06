package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type APIResponse struct {
	Success bool `json:"success"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
	Errors  any    `json:"errors,omitempty"`
}

func Success(c *gin.Context, statusCode int, message string, data any) {
	c.JSON(statusCode, APIResponse{
		Success: true,
		Message: message,
		Data:    data,
	})
}

func Error(c *gin.Context, statusCode int, message string, errors any) {
	c.JSON(statusCode, APIResponse{
		Success: false,
		Message: message,
		Errors:  errors,
	})
}

// Optional helper
func OK(c *gin.Context, message string, data any) {
	Success(c, http.StatusOK, message, data)
}