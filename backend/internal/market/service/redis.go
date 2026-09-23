package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/cache"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/redis/go-redis/v9"
)

type Service struct {
	client            *redis.Client
	timeout           time.Duration
	allowSeededQuotes bool
	workerURL         string
	httpClient        *http.Client
}

func (s *Service) SetAllowSeededQuotes(allow bool) {
	s.allowSeededQuotes = allow
}

func (s *Service) AllowSeededQuotes() bool {
	if s == nil {
		return false
	}
	return s.allowSeededQuotes
}

func (s *Service) SetWorkerURL(workerURL string) {
	if s != nil {
		s.workerURL = strings.TrimRight(strings.TrimSpace(workerURL), "/")
	}
}

func (s *Service) SetHTTPClient(client *http.Client) {
	if s != nil {
		s.httpClient = client
	}
}

func (s *Service) WorkerURL() string {
	if s != nil && s.workerURL != "" {
		return s.workerURL
	}
	if env := strings.TrimRight(strings.TrimSpace(os.Getenv("MARKET_WORKER_URL")), "/"); env != "" {
		return env
	}
	return "http://127.0.0.1:8085"
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
	"PRAJIND":    31215,   // ₹312.15
	"BAJFINANCE": 102130,  // ₹1,021.30
	"AXISBANK":   125000,  // ₹1,250.00
	"KOTAKBANK":  41480,   // ₹414.80
	"APARINDS":   1894500, // ₹18,945.00
	"RELIANCE":   124740,  // ₹1,247.40
	"TCS":        212870,  // ₹2,128.70
	"INFY":       103850,  // ₹1,038.50
	"HDFCBANK":   164280,  // ₹1,642.80
	"TATAMOTORS": 30165,   // ₹301.65 (TMPV)
	"TMPV":       30165,   // ₹301.65
	"TMCV":       44450,   // ₹444.50
	"BHARTIARTL": 189330,  // ₹1,893.30
	"ETERNAL":    33590,   // ₹335.90
	"ZOMATO":     33590,   // ₹335.90
	"SUZLON":     7450,    // ₹74.50
	"TRENT":      714000,  // ₹7,140.00
	"ADANIENT":   302000,  // ₹3,020.00
	"BEL":        39330,   // ₹393.30
	"SBIN":       78500,   // ₹785.00
	"ICICIBANK":  121530,  // ₹1,215.30
	"NIFTY":      2335000, // ₹23,350.00
	"BANKNIFTY":  5625000, // ₹56,250.00
	"FINNIFTY":   2552000, // ₹25,520.00
	"MIDCPNIFTY": 1448000, // ₹14,480.00
	"SENSEX":     7450000, // ₹74,500.00
}

var workerHTTPClient = &http.Client{
	Timeout: 3 * time.Second,
}

func (s *Service) fetchLiveFromWorker(symbol string) (*dto.QuoteResponse, error) {
	baseURL := s.WorkerURL()
	if baseURL == "" || baseURL == "disabled" || baseURL == "none" {
		return nil, fmt.Errorf("market worker integration is disabled")
	}
	client := workerHTTPClient
	if s != nil && s.httpClient != nil {
		client = s.httpClient
	}
	resp, err := client.Get(fmt.Sprintf("%s/quote?symbol=%s", baseURL, url.QueryEscape(symbol)))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("worker returned status %d", resp.StatusCode)
	}
	var quote dto.QuoteResponse
	if err := json.NewDecoder(resp.Body).Decode(&quote); err != nil {
		return nil, err
	}
	return &quote, nil
}

func fetchLiveFromWorker(symbol string) (*dto.QuoteResponse, error) {
	var s *Service
	return s.fetchLiveFromWorker(symbol)
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
	if len(values) == 0 || values["source"] == "auto_seeded" {
		if liveQuote, err := s.fetchLiveFromWorker(symbol); err == nil && liveQuote != nil && liveQuote.PricePaise > 0 {
			return liveQuote, nil
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
	}
	price, err := strconv.ParseInt(values["price_paise"], 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid stored quote")
	}
	var changePaise int64
	var changePercent float64
	if cp, ok := values["change_paise"]; ok {
		changePaise, _ = strconv.ParseInt(cp, 10, 64)
	}
	if cp, ok := values["change_percent"]; ok {
		changePercent, _ = strconv.ParseFloat(cp, 64)
	}
	return &dto.QuoteResponse{
		Symbol:        symbol,
		PricePaise:    price,
		ChangePaise:   changePaise,
		ChangePercent: changePercent,
		Source:        values["source"],
		UpdatedAt:     values["updated_at"],
	}, nil
}

// IsSeededSource returns true if the quote source represents a static or fallback
// seed placeholder that has not been produced by an active live or simulated tick feed.
func IsSeededSource(source string) bool {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "auto_seeded", "initial_seed", "benchmark_fallback", "static_fallback":
		return true
	default:
		return false
	}
}

// ExecutableQuote returns a quote that is safe to use for settlement. A
// cached quote without a valid, recent timestamp or an unpermitted seeded quote
// must never determine money movement, even if a price field happens to be present.
func (s *Service) ExecutableQuote(symbol string) (*dto.QuoteResponse, error) {
	quote, err := s.CurrentQuote(symbol)
	if err != nil {
		return nil, err
	}
	allowSeeded := s != nil && s.allowSeededQuotes
	if err := validateExecutableQuoteWithMode(quote, time.Now(), allowSeeded); err != nil {
		return nil, err
	}
	return quote, nil
}

// ValidateExecutableQuoteWithMode validates whether a quote can be safely used
// for order execution and settlement. When allowSeeded is false, static seed placeholders
// (auto_seeded, initial_seed, benchmark_fallback, etc.) are strictly rejected.
func ValidateExecutableQuoteWithMode(quote *dto.QuoteResponse, now time.Time, allowSeeded bool) error {
	if quote == nil {
		return fmt.Errorf("market quote is nil")
	}
	if !allowSeeded && IsSeededSource(quote.Source) {
		return fmt.Errorf("seeded quotes (%s) cannot be used for trade execution without explicit simulation mode", quote.Source)
	}
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

func ValidateExecutableQuote(quote *dto.QuoteResponse, now time.Time) error {
	return ValidateExecutableQuoteWithMode(quote, now, false)
}

func validateExecutableQuoteWithMode(quote *dto.QuoteResponse, now time.Time, allowSeeded bool) error {
	return ValidateExecutableQuoteWithMode(quote, now, allowSeeded)
}

func validateExecutableQuote(quote *dto.QuoteResponse, now time.Time) error {
	return ValidateExecutableQuoteWithMode(quote, now, false)
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
