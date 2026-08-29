package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/news/dto"
	"github.com/redis/go-redis/v9"
)

const itemsKey = "news:items"

type NewsService struct{ client *redis.Client }

func New(redisURL string) (*NewsService, error) {
	if redisURL == "" {
		redisURL = "redis://localhost:6379/0"
	}
	options, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	return &NewsService{client: redis.NewClient(options)}, nil
}

func (s *NewsService) List(symbol string, limit int) ([]dto.ArticleResponse, error) {
	if limit <= 0 || limit > 100 {
		return nil, fmt.Errorf("limit must be between 1 and 100")
	}
	items, err := s.client.LRange(context.Background(), itemsKey, 0, 199).Result()
	if err != nil {
		return nil, err
	}
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	result := make([]dto.ArticleResponse, 0, limit)
	for _, item := range items {
		var article dto.ArticleResponse
		if json.Unmarshal([]byte(item), &article) != nil {
			continue
		}
		if symbol != "" && !contains(article.Symbols, symbol) {
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
