package middleware

import (
	"crypto/subtle"
	"github.com/gin-gonic/gin"
	"net"
	"net/http"
)

// Only a server-held secret grants permission to override the rate-limit IP.
// Caddy's trusted proxy list and user authentication remain unchanged.
func FrontendClientIP(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		supplied := c.GetHeader("X-Frontend-Proxy-Secret")
		if len(secret) >= 32 && subtle.ConstantTimeCompare([]byte(supplied), []byte(secret)) == 1 {
			if ip := net.ParseIP(c.GetHeader("X-Frontend-Client-IP")); ip != nil {
				c.Set("frontend_client_ip", ip.String())
			}
		}
		c.Next()
	}
}
func BodyLimit(bytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.ContentLength > bytes {
			c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{"success": false, "message": "Request body too large"})
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, bytes)
		c.Next()
	}
}
