package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/cache"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/news/dto"
	"github.com/redis/go-redis/v9"
)

const itemsKey = "news:items"

type NewsService struct {
	client  *redis.Client
	timeout time.Duration
}

func New(redisURL string, timeout time.Duration) (*NewsService, error) {
	if redisURL == "" {
		redisURL = "redis://localhost:6379/0"
	}
	client, err := cache.NewRedisClient(redisURL, timeout)
	if err != nil {
		return nil, err
	}
	return &NewsService{client: client, timeout: timeout}, nil
}

func (s *NewsService) List(symbol string, limit int) ([]dto.ArticleResponse, error) {
	return s.ListWithFilters(symbol, "", limit)
}

func (s *NewsService) ListWithFilters(symbol, sentiment string, limit int) ([]dto.ArticleResponse, error) {
	if limit <= 0 || limit > 100 {
		return nil, fmt.Errorf("limit must be between 1 and 100")
	}
	ctx, cancel := cache.Context(context.Background(), s.timeout)
	defer cancel()
	items, err := s.client.LRange(ctx, itemsKey, 0, 199).Result()
	if err != nil {
		return nil, fmt.Errorf("%w: %v", cache.ErrUnavailable, err)
	}
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	sentiment = strings.ToUpper(strings.TrimSpace(sentiment))
	result := make([]dto.ArticleResponse, 0, limit)
	for _, item := range items {
		var article dto.ArticleResponse
		if json.Unmarshal([]byte(item), &article) != nil {
			continue
		}
		if symbol != "" && !contains(article.Symbols, symbol) {
			continue
		}
		if sentiment != "" && !strings.EqualFold(article.Sentiment, sentiment) {
			continue
		}
		result = append(result, article)
		if len(result) == limit {
			break
		}
	}
	return result, nil
}

func contains(symbols []string, target string) bool {
	for _, symbol := range symbols {
		if strings.EqualFold(symbol, target) {
			return true
		}
	}
	return false
}

// Status distinguishes retained articles from a currently healthy ingestion loop.
func (s *NewsService) Status() (map[string]any, error) {
	ctx, cancel := cache.Context(context.Background(), s.timeout)
	defer cancel()
	values, err := s.client.HGetAll(ctx, "news:health").Result()
	if err != nil {
		return nil, err
	}
	state := "UNAVAILABLE"
	poll, pe := time.Parse(time.RFC3339, values["last_poll"])
	success, se := time.Parse(time.RFC3339, values["last_success"])
	interval, _ := time.ParseDuration(values["poll_interval_seconds"] + "s")
	if interval < time.Minute {
		interval = time.Minute
	}
	if interval > time.Hour {
		interval = time.Hour
	}
	if pe == nil && se == nil && !poll.After(time.Now().Add(5*time.Second)) && !success.After(time.Now().Add(5*time.Second)) {
		state = "STALE"
		if time.Since(poll) <= 2*interval && time.Since(success) <= 2*interval {
			state = "LIVE"
		}
	}
	return map[string]any{"status": state, "last_poll": values["last_poll"], "last_success": values["last_success"]}, nil
}
