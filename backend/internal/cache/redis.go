package cache

import (
	"context"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

// ErrUnavailable identifies a Redis failure without exposing provider details
// to API clients.
var ErrUnavailable = errors.New("cache unavailable")

// NewRedisClient creates a bounded TCP Redis client. redis.ParseURL supports
// both local redis:// URLs and Upstash's TLS-enabled rediss:// URLs.
func NewRedisClient(redisURL string, operationTimeout time.Duration) (*redis.Client, error) {
	options, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	options.DialTimeout = operationTimeout
	options.ReadTimeout = operationTimeout
	options.WriteTimeout = operationTimeout
	options.PoolTimeout = operationTimeout
	options.MaxRetries = 1
	return redis.NewClient(options), nil
}

func Context(parent context.Context, timeout time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(parent, timeout)
}
