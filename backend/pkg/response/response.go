package response

import "github.com/gin-gonic/gin"

type APIResponse struct {
	Success   bool   `json:"success"`
	Message   string `json:"message"`
	Code      string `json:"code,omitempty"`
	RequestID string `json:"request_id,omitempty"`
	Data      any    `json:"data,omitempty"`
	Errors    any    `json:"errors,omitempty"`
}

func getRequestID(c *gin.Context) string {
	if c == nil {
		return ""
	}
	if reqID := c.GetString("request_id"); reqID != "" {
		return reqID
	}
	if reqID := c.Writer.Header().Get("X-Request-ID"); reqID != "" {
		return reqID
	}
	return c.GetHeader("X-Request-ID")
}

func Success(c *gin.Context, status int, message string, data any) {
	c.JSON(status, APIResponse{
		Success:   true,
		Message:   message,
		RequestID: getRequestID(c),
		Data:      data,
	})
}

func Error(c *gin.Context, status int, message string, errors any) {
	code := ""
	if strErr, ok := errors.(string); ok && strErr != "" {
		code = strErr
	}
	c.JSON(status, APIResponse{
		Success:   false,
		Message:   message,
		Code:      code,
		RequestID: getRequestID(c),
		Errors:    errors,
	})
}

func ErrorWithCode(c *gin.Context, status int, code, message string, errors any) {
	if errors == nil && code != "" {
		errors = code
	}
	c.JSON(status, APIResponse{
		Success:   false,
		Message:   message,
		Code:      code,
		RequestID: getRequestID(c),
		Errors:    errors,
	})
}
