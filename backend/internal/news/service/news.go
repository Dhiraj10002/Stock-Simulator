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
	if len(result) == 0 && len(items) == 0 {
		return getFallbackArticles(symbol, sentiment, limit), nil
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

func getFallbackArticles(symbol, sentiment string, limit int) []dto.ArticleResponse {
	now := time.Now().UTC()
	all := []dto.ArticleResponse{
		{
			Title:       "Nifty 50 registers fresh lifetime highs led by banking and energy heavyweights",
			URL:         "https://www.livemint.com/market/stock-market-news",
			Source:      "LiveMint",
			PublishedAt: now.Add(-15 * time.Minute).Format(time.RFC3339),
			Sentiment:   "POSITIVE",
			Score:       3,
			Symbols:     []string{"NIFTY", "HDFCBANK", "RELIANCE"},
			Sectors:     []string{"BANKING", "ENERGY", "MACRO"},
		},
		{
			Title:       "Reliance Retail accelerates omni-channel footprint with 150 new technology-backed fulfillment centres",
			URL:         "https://economictimes.indiatimes.com/markets/stocks/news",
			Source:      "Economic Times",
			PublishedAt: now.Add(-45 * time.Minute).Format(time.RFC3339),
			Sentiment:   "POSITIVE",
			Score:       2,
			Symbols:     []string{"RELIANCE"},
			Sectors:     []string{"ENERGY"},
		},
		{
			Title:       "IT sector navigates margin headwinds and cautious discretionary client spending ahead of quarterly earnings",
			URL:         "https://www.moneycontrol.com/news/business/markets",
			Source:      "Moneycontrol",
			PublishedAt: now.Add(-90 * time.Minute).Format(time.RFC3339),
			Sentiment:   "NEGATIVE",
			Score:       -2,
			Symbols:     []string{"TCS", "INFY", "WIPRO"},
			Sectors:     []string{"IT"},
		},
		{
			Title:       "RBI Monetary Policy Committee keeps repo rate steady at 6.5%, citing resilient domestic macroeconomic expansion",
			URL:         "https://www.business-standard.com/markets/news",
			Source:      "Business Standard",
			PublishedAt: now.Add(-140 * time.Minute).Format(time.RFC3339),
			Sentiment:   "NEUTRAL",
			Score:       0,
			Symbols:     []string{"BANKNIFTY", "SBIN", "ICICIBANK"},
			Sectors:     []string{"BANKING", "MACRO"},
		},
		{
			Title:       "Tata Motors domestic commercial vehicle and passenger EV despatches surge in latest monthly update",
			URL:         "https://www.livemint.com/companies/news",
			Source:      "LiveMint",
			PublishedAt: now.Add(-210 * time.Minute).Format(time.RFC3339),
			Sentiment:   "POSITIVE",
			Score:       2,
			Symbols:     []string{"TMPV"},
			Sectors:     []string{"AUTO"},
		},
		{
			Title:       "HDFC Bank asset quality stays robust as gross NPA drops to historic lows",
			URL:         "https://economictimes.indiatimes.com/markets",
			Source:      "Economic Times",
			PublishedAt: now.Add(-300 * time.Minute).Format(time.RFC3339),
			Sentiment:   "POSITIVE",
			Score:       2,
			Symbols:     []string{"HDFCBANK"},
			Sectors:     []string{"BANKING"},
		},
		{
			Title:       "Metal index tumbles as global iron ore and base metal prices retreat on demand concerns",
			URL:         "https://www.moneycontrol.com/news/business/commodities",
			Source:      "Moneycontrol",
			PublishedAt: now.Add(-360 * time.Minute).Format(time.RFC3339),
			Sentiment:   "NEGATIVE",
			Score:       -2,
			Symbols:     []string{"TATASTEEL"},
			Sectors:     []string{"METALS"},
		},
		{
			Title:       "Zomato Blinkit quick-commerce unit achieves store-level profitability ahead of roadmap",
			URL:         "https://www.business-standard.com/companies/news",
			Source:      "Business Standard",
			PublishedAt: now.Add(-420 * time.Minute).Format(time.RFC3339),
			Sentiment:   "POSITIVE",
			Score:       2,
			Symbols:     []string{"ETERNAL"},
			Sectors:     []string{"TECH"},
		},
	}

	filtered := make([]dto.ArticleResponse, 0, limit)
	for _, a := range all {
		if symbol != "" && !contains(a.Symbols, symbol) {
			continue
		}
		if sentiment != "" && !strings.EqualFold(a.Sentiment, sentiment) {
			continue
		}
		filtered = append(filtered, a)
		if len(filtered) == limit {
			break
		}
	}
	return filtered
}
