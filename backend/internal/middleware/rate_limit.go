package middleware

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/cache"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/logger"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// tokenBucketScript implements atomic Token Bucket rate limiting in Redis.
// Returns: {allowed (1 or 0), remaining_tokens, retry_after_seconds}
var tokenBucketScript = redis.NewScript(`
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])

local data = redis.call("HMGET", key, "tokens", "last_updated")
local tokens = tonumber(data[1])
local last_updated = tonumber(data[2])

if not tokens then
    tokens = capacity
    last_updated = now
else
    local elapsed_sec = math.max(0, (now - last_updated) / 1000.0)
    tokens = math.min(capacity, tokens + (elapsed_sec * refill_rate))
    last_updated = now
end

local allowed = 0
local remaining = math.floor(tokens)
local retry_after = 0

if tokens >= requested then
    tokens = tokens - requested
    allowed = 1
    remaining = math.floor(tokens)
    redis.call("HMSET", key, "tokens", tokens, "last_updated", now)
    redis.call("EXPIRE", key, ttl)
else
    local needed = requested - tokens
    retry_after = math.ceil(needed / refill_rate)
    if retry_after < 1 then
        retry_after = 1
    end
    redis.call("HMSET", key, "tokens", tokens, "last_updated", now)
    redis.call("EXPIRE", key, ttl)
end

return {allowed, remaining, retry_after}
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
		if r.client == nil {
			c.Next()
			return
		}

		ctx, cancel := cache.Context(c.Request.Context(), r.timeout)
		defer cancel()

		// Key by user_id if authenticated, otherwise by client IP
		var identifier string
		if userID := c.GetString("user_id"); userID != "" {
			identifier = "user:" + userID
		} else {
			identifier = "ip:" + c.ClientIP()
		}

		key := fmt.Sprintf("rate_limit:%s:%s", scope, identifier)
		refillRate := float64(maximum) / window.Seconds()
		nowMs := time.Now().UnixNano() / int64(time.Millisecond)
		ttlSeconds := int64(window.Seconds() * 2)
		if ttlSeconds < 60 {
			ttlSeconds = 60
		}

		res, err := tokenBucketScript.Run(ctx, r.client, []string{key}, maximum, refillRate, nowMs, 1, ttlSeconds).Slice()
		if err != nil {
			logger.Warn("Redis token bucket rate limit check failed", zap.Error(err), zap.String("key", key))
			// Fail open on Redis connectivity error to prevent full service outage
			c.Next()
			return
		}

		if len(res) < 3 {
			c.Next()
			return
		}

		allowed, _ := res[0].(int64)
		remaining, _ := res[1].(int64)
		retryAfter, _ := res[2].(int64)

		c.Header("X-RateLimit-Limit", strconv.Itoa(maximum))
		c.Header("X-RateLimit-Remaining", strconv.FormatInt(remaining, 10))

		if allowed != 1 {
			c.Header("Retry-After", strconv.FormatInt(retryAfter, 10))
			response.Error(c, http.StatusTooManyRequests, "Too many requests. Please slow down.", nil)
			c.Abort()
			return
		}

		c.Next()
	}
}
