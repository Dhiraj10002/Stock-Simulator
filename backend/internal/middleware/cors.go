package middleware

import (
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// CORS returns a Gin middleware that enforces cross-origin request policies.
// Normalizes origins by trimming trailing slashes and comparing case-insensitively,
// and supports preflight caching with Access-Control-Max-Age.
func CORS(allowedOrigins string) gin.HandlerFunc {
	origins := make(map[string]struct{})
	allowAnyOrigin := false
	for _, origin := range strings.Split(allowedOrigins, ",") {
		origin = strings.TrimSpace(origin)
		if origin == "*" {
			allowAnyOrigin = true
			continue
		}
		if origin != "" {
			normalized := strings.TrimRight(strings.ToLower(origin), "/")
			origins[normalized] = struct{}{}
		}
	}

	if !allowAnyOrigin && len(origins) == 0 {
		log.Println("CORS: no allowed origins configured — all cross-origin requests will be rejected")
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" {
			normalizedOrigin := strings.TrimRight(strings.ToLower(strings.TrimSpace(origin)), "/")
			_, allowed := origins[normalizedOrigin]
			if !allowAnyOrigin && !allowed {
				c.AbortWithStatus(http.StatusForbidden)
				return
			}

			if allowAnyOrigin {
				c.Header("Access-Control-Allow-Origin", "*")
			} else {
				c.Header("Access-Control-Allow-Origin", origin)
				c.Header("Access-Control-Allow-Credentials", "true")
				c.Header("Vary", "Origin")
			}
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID, Accept, Origin, X-Requested-With, Cache-Control")
			c.Header("Access-Control-Expose-Headers", "X-Request-ID, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After")
			c.Header("Access-Control-Max-Age", "86400")
		}

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
