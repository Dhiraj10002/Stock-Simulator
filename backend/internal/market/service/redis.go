package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/cache"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/redis/go-redis/v9"
)

type Service struct {
	client  *redis.Client
	timeout time.Duration
}

const QuoteUpdatesChannel = "market:updates"

const maxExecutableQuoteAge = 2 * time.Minute

func New(redisURL string, timeout time.Duration) (*Service, error) {
	if redisURL == "" {
		redisURL = "redis://localhost:6379/0"
	}
	client, err := cache.NewRedisClient(redisURL, timeout)
	if err != nil {
		return nil, err
	}
	return &Service{client: client, timeout: timeout}, nil
}

var benchmarkPrices = map[string]int64{
	"RELIANCE":   124390,
	"TCS":        219000,
	"INFY":       105860,
	"HDFCBANK":   71300,
	"NIFTY":      2532000,
	"BANKNIFTY":  5215000,
	"ETERNAL":    27850,
	"APARINDS":   845000, // ₹8,450.00
	"TATAMOTORS": 96550,  // ₹965.50
	"SBIN":       78500,  // ₹785.00
}

func fallbackPriceForSymbol(symbol string) int64 {
	clean := strings.ToUpper(strings.TrimSpace(symbol))
	clean = strings.TrimSuffix(clean, "-EQ")
	clean = strings.TrimSuffix(clean, "-BE")
	clean = strings.TrimSuffix(clean, "-SM")
	if price, ok := benchmarkPrices[clean]; ok {
		return price
	}
	var hash int64
	for _, c := range clean {
		hash = (hash*31 + int64(c)) % 1000000
	}
	if hash < 0 {
		hash = -hash
	}

	// For F&O Option contracts (ending in CE or PE), premium is realistically ₹15.00 to ₹350.00 (1500 to 35000 paise)
	if strings.HasSuffix(clean, "CE") || strings.HasSuffix(clean, "PE") {
		return 1500 + (hash % 33500)
	}

	// Dynamic price between ₹120.00 and ₹4,800.00 for equities
	return (12000 + (hash % 468000))
}

func (s *Service) SetQuote(symbol string, pricePaise int64, volume int64) error {
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	if symbol == "" {
		return fmt.Errorf("symbol is required")
	}
	if pricePaise <= 0 {
		return fmt.Errorf("price must be positive")
	}
	ctx, cancel := cache.Context(context.Background(), s.timeout)
	defer cancel()

	nowStr := time.Now().Format(time.RFC3339)
	return s.client.HSet(ctx, quoteKey(symbol), map[string]interface{}{
		"price_paise": pricePaise,
		"volume":      volume,
		"source":      "fno_engine",
		"updated_at":  nowStr,
	}).Err()
}

func (s *Service) CurrentQuote(symbol string) (*dto.QuoteResponse, error) {
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	if symbol == "" {
		return nil, fmt.Errorf("symbol is required")
	}
	ctx, cancel := cache.Context(context.Background(), s.timeout)
	defer cancel()
	values, err := s.client.HGetAll(ctx, quoteKey(symbol)).Result()
	if err != nil {
		return nil, fmt.Errorf("%w: %v", cache.ErrUnavailable, err)
	}
	if len(values) == 0 {
		price := fallbackPriceForSymbol(symbol)
		nowStr := time.Now().Format(time.RFC3339)
		_ = s.client.HSet(ctx, quoteKey(symbol), map[string]interface{}{
			"price_paise": price,
			"volume":      5000,
			"source":      "auto_seeded",
			"updated_at":  nowStr,
		}).Err()
		return &dto.QuoteResponse{
			Symbol:     symbol,
			PricePaise: price,
			Source:     "auto_seeded",
			UpdatedAt:  nowStr,
		}, nil
	}
	price, err := strconv.ParseInt(values["price_paise"], 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid stored quote")
	}
	return &dto.QuoteResponse{Symbol: symbol, PricePaise: price, Source: values["source"], UpdatedAt: values["updated_at"]}, nil
}

// ExecutableQuote returns a quote that is safe to use for settlement. A
// cached quote without a valid, recent timestamp must never determine money
// movement, even if a price field happens to be present.
func (s *Service) ExecutableQuote(symbol string) (*dto.QuoteResponse, error) {
	quote, err := s.CurrentQuote(symbol)
	if err != nil {
		return nil, err
	}
	if err := validateExecutableQuote(quote, time.Now()); err != nil {
		return nil, err
	}
	return quote, nil
}

func validateExecutableQuote(quote *dto.QuoteResponse, now time.Time) error {
	if quote.PricePaise <= 0 {
		return fmt.Errorf("market quote has an invalid price")
	}
	if strings.TrimSpace(quote.UpdatedAt) == "" {
		return fmt.Errorf("market quote has no update time")
	}
	updatedAt, err := time.Parse(time.RFC3339, quote.UpdatedAt)
	if err != nil {
		return fmt.Errorf("market quote has an invalid update time")
	}
	if updatedAt.After(now.Add(5 * time.Second)) {
		return fmt.Errorf("market quote is in the future")
	}
	if now.Sub(updatedAt) > maxExecutableQuoteAge {
		return fmt.Errorf("market quote is stale")
	}
	return nil
}

func (s *Service) HistoricalQuotes(symbol string, limit int) ([]dto.CandleResponse, error) {
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	if symbol == "" {
		return nil, fmt.Errorf("symbol is required")
	}
	if limit <= 0 || limit > 500 {
		return nil, fmt.Errorf("limit must be between 1 and 500")
	}
	ctx, cancel := cache.Context(context.Background(), s.timeout)
	defer cancel()
	items, err := s.client.LRange(ctx, historyKey(symbol), 0, int64(limit-1)).Result()
	if err != nil {
		return nil, fmt.Errorf("%w: %v", cache.ErrUnavailable, err)
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
