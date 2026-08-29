package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/redis/go-redis/v9"
)

type Service struct{ client *redis.Client }

const QuoteUpdatesChannel = "market:updates"

func New(redisURL string) (*Service, error) {
	if redisURL == "" {
		redisURL = "redis://localhost:6379/0"
	}
	options, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, err
	}
	return &Service{client: redis.NewClient(options)}, nil
}

func (s *Service) CurrentQuote(symbol string) (*dto.QuoteResponse, error) {
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	if symbol == "" {
		return nil, fmt.Errorf("symbol is required")
	}
	values, err := s.client.HGetAll(context.Background(), quoteKey(symbol)).Result()
	if err != nil {
		return nil, err
	}
	if len(values) == 0 {
		return nil, fmt.Errorf("quote not found for %s", symbol)
	}
	price, err := strconv.ParseInt(values["price_paise"], 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid stored quote")
	}
	return &dto.QuoteResponse{Symbol: symbol, PricePaise: price, Source: values["source"], UpdatedAt: values["updated_at"]}, nil
}

func (s *Service) HistoricalQuotes(symbol string, limit int) ([]dto.CandleResponse, error) {
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	if symbol == "" {
		return nil, fmt.Errorf("symbol is required")
	}
	if limit <= 0 || limit > 500 {
		return nil, fmt.Errorf("limit must be between 1 and 500")
	}
	items, err := s.client.LRange(context.Background(), historyKey(symbol), 0, int64(limit-1)).Result()
	if err != nil {
		return nil, err
	}
	result := make([]dto.CandleResponse, 0, len(items))
	for i := len(items) - 1; i >= 0; i-- {
		var candle dto.CandleResponse
		if err := json.Unmarshal([]byte(items[i]), &candle); err != nil {
			return nil, fmt.Errorf("invalid stored candle")
		}
		result = append(result, candle)
	}
	return result, nil
}

// SubscribeQuotes returns a Redis Pub/Sub subscription for live quote updates.
// The caller owns the returned subscription and must close it when finished.
func (s *Service) SubscribeQuotes(ctx context.Context) *redis.PubSub {
	return s.client.Subscribe(ctx, QuoteUpdatesChannel)
}

func quoteKey(symbol string) string   { return "market:quote:" + symbol }
func historyKey(symbol string) string { return "market:history:" + symbol }
