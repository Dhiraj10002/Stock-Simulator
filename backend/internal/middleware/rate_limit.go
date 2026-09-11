package middleware

import (
	"fmt"
	"net/http"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/cache"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/logger"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

var incrementWithExpiry = redis.NewScript(`
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return count
`)

type RateLimiter struct {
	client  *redis.Client
	timeout time.Duration
}

func NewRateLimiter(client *redis.Client, timeout time.Duration) *RateLimiter {
	return &RateLimiter{client: client, timeout: timeout}
}

func (r *RateLimiter) Limit(scope string, maximum int, window time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := cache.Context(c.Request.Context(), r.timeout)
		defer cancel()

		count, err := incrementWithExpiry.Run(ctx, r.client, []string{fmt.Sprintf("rate_limit:%s:%s", scope, c.ClientIP())}, int64(window.Seconds())).Int64()
		if err != nil {
			logger.Warn("Redis rate limit check failed", zap.Error(err))
			response.Error(c, http.StatusServiceUnavailable, "Service temporarily unavailable", nil)
			c.Abort()
			return
		}
		if count > int64(maximum) {
			c.Header("Retry-After", fmt.Sprintf("%d", int64(window.Seconds())))
			response.Error(c, http.StatusTooManyRequests, "Too many requests", nil)
			c.Abort()
			return
		}
		c.Next()
	}
}
