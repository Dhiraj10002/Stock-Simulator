package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/cache"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/alias"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/product"
	"github.com/redis/go-redis/v9"
)

var (
	// ErrQuoteNotFound indicates that no quote exists for the symbol in Redis or the upstream worker.
	ErrQuoteNotFound = errors.New("quote not found")

	// ErrQuoteStale indicates that the quote timestamp is older than the maximum executable age.
	ErrQuoteStale = errors.New("market quote is stale")

	// ErrQuoteIneligible indicates that the quote source is not eligible for execution under the current feed mode.
	ErrQuoteIneligible = errors.New("quote source is not eligible for execution")

	// ErrQuoteUnavailable indicates that the quote service or market feed is unavailable.
	ErrQuoteUnavailable = errors.New("market data unavailable")

	// ErrInstrumentNotFound indicates that the requested symbol does not exist in the canonical instrument master.
	ErrInstrumentNotFound = errors.New("instrument not found in canonical instrument master")
)

type Service struct {
	client            *redis.Client
	timeout           time.Duration
	allowSeededQuotes bool
	feedMode          dto.FeedMode
	instrumentFinder  func(symbol string) (bool, error)
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

func (s *Service) Client() *redis.Client {
	if s == nil {
		return nil
	}
	return s.client
}

func (s *Service) SetClient(c *redis.Client) {
	if s != nil {
		s.client = c
	}
}

func (s *Service) SetInstrumentFinder(fn func(symbol string) (bool, error)) {
	if s != nil {
		s.instrumentFinder = fn
	}
}

func (s *Service) InstrumentFinder() func(symbol string) (bool, error) {
	if s == nil {
		return nil
	}
	return s.instrumentFinder
}

func (s *Service) SetFeedMode(mode dto.FeedMode) {
	if s != nil {
		s.feedMode = dto.NormalizeFeedMode(string(mode))
	}
}

func (s *Service) FeedMode() dto.FeedMode {
	if s == nil {
		return dto.FeedModeLive
	}
	if s.feedMode != "" {
		return s.feedMode
	}
	if env := strings.TrimSpace(os.Getenv("MARKET_FEED_MODE")); env != "" {
		return dto.NormalizeFeedMode(env)
	}
	return dto.FeedModeLive
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
	if _, err := os.Stat("/.dockerenv"); err == nil {
		return "http://market-worker:8085"
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
	// Dynamically load symbol aliases from Redis hash "market:symbol_aliases"
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	_ = alias.LoadFromRedis(ctx, client)

	return &Service{client: client, timeout: timeout}, nil
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

// CachedQuote returns the quote from Redis, identical to CurrentQuote.
func (s *Service) CachedQuote(symbol string) (*dto.QuoteResponse, error) {
	return s.CurrentQuote(symbol)
}

// CurrentQuote retrieves the authoritative quote for a symbol directly and only from Redis.
// Missing quote returns ErrQuoteNotFound.
// Stale quote (> 2 minutes) returns ErrQuoteStale.
// Seeded or auto-generated quotes are strictly rejected in production application flow.
// When market feed is UNAVAILABLE or Redis feed state is UNAVAILABLE, returns ErrQuoteUnavailable.
// Under LIVE feed mode, only authentic angelone_live quotes are served; synthetic quotes are rejected with ErrQuoteIneligible.
// No synchronous HTTP worker rescue is performed.
func (s *Service) CurrentQuote(symbol string) (*dto.QuoteResponse, error) {
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	if symbol == "" {
		return nil, fmt.Errorf("symbol is required")
	}
	mode := s.FeedMode()
	if mode == dto.FeedModeUnavailable {
		return nil, ErrQuoteUnavailable
	}

	if s != nil && s.instrumentFinder != nil {
		found, err := s.instrumentFinder(symbol)
		if err != nil {
			return nil, err
		}
		if !found {
			// In LIVE feed mode: ONLY canonical DB instruments permitted.
			// In SYNTHETIC feed mode: Synthetic F&O contracts permitted.
			if mode == dto.FeedModeSynthetic && product.IsSyntheticContract(symbol) {
				// Synthetic contract permitted in synthetic mode
			} else {
				return nil, fmt.Errorf("%w: %s (real F&O in live mode permits only canonical DB instruments)", ErrInstrumentNotFound, symbol)
			}
		}
	}
	if s == nil || s.client == nil {
		return nil, ErrQuoteUnavailable
	}

	ctx, cancel := cache.Context(context.Background(), s.timeout)
	defer cancel()

	// Check dynamic Redis feed state: if feed is explicitly UNAVAILABLE, quotes cannot be served
	if feedState, err := s.client.HGet(ctx, FeedStateKey, "feed_state").Result(); err == nil {
		if strings.ToUpper(strings.TrimSpace(feedState)) == string(dto.FeedModeUnavailable) {
			return nil, ErrQuoteUnavailable
		}
	}

	values, err := s.client.HGetAll(ctx, quoteKey(symbol)).Result()
	if err != nil {
		return nil, fmt.Errorf("%w: %v", cache.ErrUnavailable, err)
	}

	canonical := alias.ResolveCanonicalSymbol(symbol)
	if len(values) == 0 && canonical != "" && canonical != symbol {
		cValues, cErr := s.client.HGetAll(ctx, quoteKey(canonical)).Result()
		if cErr == nil && len(cValues) > 0 {
			values = cValues
		}
	}

	if len(values) == 0 {
		return nil, ErrQuoteNotFound
	}

	source := values["source"]
	allowSeeded := s != nil && s.allowSeededQuotes
	if !allowSeeded && IsSeededSource(source) {
		return nil, ErrQuoteNotFound
	}

	normSource := dto.NormalizeQuoteSource(source)
	if mode == dto.FeedModeLive && normSource != dto.QuoteSourceAngelOneLive {
		return nil, fmt.Errorf("%w: live feed mode requires angelone_live source, got %q", ErrQuoteIneligible, source)
	}
	if mode == dto.FeedModeSynthetic && normSource == dto.QuoteSourceAngelOneLive {
		return nil, fmt.Errorf("%w: synthetic feed mode cannot use live quote source %q", ErrQuoteIneligible, source)
	}

	price, err := strconv.ParseInt(values["price_paise"], 10, 64)
	if err != nil || price <= 0 {
		return nil, fmt.Errorf("invalid stored quote")
	}

	updatedAtStr, ok := values["updated_at"]
	if !ok || strings.TrimSpace(updatedAtStr) == "" {
		return nil, ErrQuoteStale
	}
	updatedAt, parseErr := time.Parse(time.RFC3339, updatedAtStr)
	if parseErr != nil || time.Since(updatedAt) > maxExecutableQuoteAge {
		return nil, ErrQuoteStale
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
		Source:        source,
		UpdatedAt:     values["updated_at"],
	}, nil
}

// IsSeededSource returns true if the quote source represents a static or fallback
// seed placeholder that has not been produced by an active live or simulated tick feed.
func IsSeededSource(source string) bool {
	switch strings.ToLower(strings.TrimSpace(source)) {
	case "auto_seeded", "initial_seed", "benchmark_fallback", "static_fallback", "mock":
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
	mode := s.FeedMode()
	if err := ValidateExecutableQuoteWithFeedMode(quote, time.Now(), mode, allowSeeded); err != nil {
		return nil, err
	}
	return quote, nil
}

// ValidateExecutableQuoteWithFeedMode validates whether a quote can be safely used
// for order execution and settlement against the authoritative FeedMode matrix.
//
// Eligibility rules:
// - Price must be > 0
// - UpdatedAt must be valid RFC3339
// - UpdatedAt must not be in the future beyond 5 seconds (clock skew tolerance)
// - UpdatedAt must not be older than maxExecutableQuoteAge (2 minutes)
// - Under FeedModeLive: quote source must be QuoteSourceAngelOneLive
// - Under FeedModeSynthetic: quote source must be QuoteSourceSyntheticGBM or QuoteSourceFNOEngine (or QuoteSourceSeed if allowSeeded is true)
// - Under FeedModeUnavailable: all quotes are rejected
// - QuoteSourceSeed is rejected unless allowSeeded is true in simulation mode
func ValidateExecutableQuoteWithFeedMode(quote *dto.QuoteResponse, now time.Time, mode dto.FeedMode, allowSeeded bool) error {
	if quote == nil {
		return fmt.Errorf("%w: market quote is nil", ErrQuoteNotFound)
	}
	if quote.PricePaise <= 0 {
		return fmt.Errorf("market quote has an invalid price: %d", quote.PricePaise)
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
		return ErrQuoteStale
	}

	normMode := dto.NormalizeFeedMode(string(mode))
	if normMode == dto.FeedModeUnavailable {
		return fmt.Errorf("%w: market feed is UNAVAILABLE", ErrQuoteUnavailable)
	}

	normSource := dto.NormalizeQuoteSource(quote.Source)

	if normSource == dto.QuoteSourceSeed {
		if !allowSeeded || normMode != dto.FeedModeSynthetic {
			return fmt.Errorf("%w: seeded quotes (%s) cannot be used for trade execution without explicit simulation mode", ErrQuoteIneligible, quote.Source)
		}
		return nil
	}

	if !dto.IsSourceExecutableInMode(normSource, normMode) {
		return fmt.Errorf("%w: quote source %q (%s) is not eligible for execution in %s feed mode", ErrQuoteIneligible, quote.Source, normSource, normMode)
	}

	return nil
}

// ValidateExecutableQuoteWithMode validates whether a quote can be safely used
// for order execution and settlement. When allowSeeded is false, static seed placeholders
// (auto_seeded, initial_seed, benchmark_fallback, etc.) are strictly rejected.
func ValidateExecutableQuoteWithMode(quote *dto.QuoteResponse, now time.Time, allowSeeded bool) error {
	if quote == nil {
		return fmt.Errorf("%w: market quote is nil", ErrQuoteNotFound)
	}
	if !allowSeeded && IsSeededSource(quote.Source) {
		return fmt.Errorf("%w: seeded quotes (%s) cannot be used for trade execution without explicit simulation mode", ErrQuoteIneligible, quote.Source)
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
		return ErrQuoteStale
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
	if s.instrumentFinder != nil {
		found, err := s.instrumentFinder(symbol)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, fmt.Errorf("%w: %s", ErrInstrumentNotFound, symbol)
		}
	}
	if limit <= 0 || limit > 500 {
		return nil, fmt.Errorf("limit must be between 1 and 500")
	}
	if s == nil || s.client == nil || s.FeedMode() == dto.FeedModeUnavailable {
		return nil, ErrQuoteUnavailable
	}
	ctx, cancel := cache.Context(context.Background(), s.timeout)
	defer cancel()

	if feedState, err := s.client.HGet(ctx, FeedStateKey, "feed_state").Result(); err == nil {
		if strings.ToUpper(strings.TrimSpace(feedState)) == string(dto.FeedModeUnavailable) {
			return nil, ErrQuoteUnavailable
		}
	}
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

const FeedStateKey = "market:feed_state"

// FeedStatus retrieves the authoritative feed provider state from Redis.
func (s *Service) FeedStatus(ctx context.Context) (*dto.FeedStatusResponse, error) {
	if s == nil || s.client == nil {
		return &dto.FeedStatusResponse{
			FeedProvider: "unknown",
			FeedState:    "DISCONNECTED",
			IsSynthetic:  true,
		}, nil
	}
	res, err := s.client.HGetAll(ctx, FeedStateKey).Result()
	if err != nil || len(res) == 0 {
		return &dto.FeedStatusResponse{
			FeedProvider: "unknown",
			FeedState:    "DISCONNECTED",
			IsSynthetic:  true,
		}, nil
	}
	isSynthetic := strings.ToLower(strings.TrimSpace(res["is_synthetic"])) == "true"
	return &dto.FeedStatusResponse{
		FeedProvider: res["feed_provider"],
		FeedState:    res["feed_state"],
		IsSynthetic:  isSynthetic,
		LastTick:     res["last_tick"],
		UpdatedAt:    res["updated_at"],
	}, nil
}

func quoteKey(symbol string) string   { return "market:quote:" + symbol }
func historyKey(symbol string) string { return "market:history:" + symbol }
