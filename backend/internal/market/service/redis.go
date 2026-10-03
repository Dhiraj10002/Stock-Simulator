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
	"sync"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/cache"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/alias"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/product"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
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
	equityProvider    func(ctx context.Context) ([]EquityUniverseItem, error)
	db                *gorm.DB
	workerURL         string
	httpClient        *http.Client

	equityUniverseCache  []EquityUniverseItem
	equityUniverseExpiry time.Time
	equityUniverseMu     sync.RWMutex
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

func (s *Service) SetEquityProvider(fn func(ctx context.Context) ([]EquityUniverseItem, error)) {
	if s != nil {
		s.equityProvider = fn
	}
}

func (s *Service) SetDB(db *gorm.DB) {
	if s != nil {
		s.db = db
	}
}

func (s *Service) DB() *gorm.DB {
	if s == nil {
		return nil
	}
	return s.db
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

func (s *Service) FetchLiveFromWorker(symbol string) (*dto.QuoteResponse, error) {
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

func (s *Service) fetchLiveFromWorker(symbol string) (*dto.QuoteResponse, error) {
	return s.FetchLiveFromWorker(symbol)
}

func fetchLiveFromWorker(symbol string) (*dto.QuoteResponse, error) {
	var s *Service
	return s.FetchLiveFromWorker(symbol)
}

func (s *Service) SetQuote(symbol string, pricePaise int64, volume int64) error {
	if s == nil || s.client == nil {
		return fmt.Errorf("redis client is uninitialized")
	}
	if s.FeedMode() == dto.FeedModeLive {
		return fmt.Errorf("cannot write simulated quote to redis in LIVE feed mode")
	}
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

// CachedQuote returns the quote from Redis, with fallback to derived F&O quote.
// Unlike CurrentQuote which strictly validates staleness for execution, CachedQuote
// returns the latest cached quote data for display and search even if stale.
func (s *Service) CachedQuote(symbol string) (*dto.QuoteResponse, error) {
	q, err := s.CurrentQuote(symbol)
	if err == nil && q != nil && q.PricePaise > 0 {
		return q, nil
	}
	if errors.Is(err, ErrQuoteStale) {
		if cq, cerr := s.rawCachedQuote(symbol); cerr == nil && cq != nil && cq.PricePaise > 0 {
			return cq, nil
		}
	}
	return nil, err
}

func (s *Service) rawCachedQuote(symbol string) (*dto.QuoteResponse, error) {
	if s == nil || s.client == nil {
		return nil, ErrQuoteUnavailable
	}
	ctx, cancel := cache.Context(context.Background(), s.timeout)
	defer cancel()

	values, err := s.client.HGetAll(ctx, quoteKey(symbol)).Result()
	if err != nil || len(values) == 0 {
		canonical := alias.ResolveCanonicalSymbol(symbol)
		if canonical != "" && canonical != symbol {
			values, _ = s.client.HGetAll(ctx, quoteKey(canonical)).Result()
		}
	}
	if len(values) == 0 {
		return nil, ErrQuoteNotFound
	}

	// CachedQuote is display-only, but it must preserve the active feed-mode
	// and source provenance contract. A stale value from a different provider
	// or simulation mode must not become visible in the current display.
	mode := s.FeedMode()
	if mode == dto.FeedModeUnavailable {
		return nil, ErrQuoteUnavailable
	}
	source := values["source"]
	normSource := dto.NormalizeQuoteSource(source)
	allowSeeded := s.AllowSeededQuotes()
	if !dto.IsSourceExecutableInMode(normSource, mode) {
		if !(allowSeeded && mode == dto.FeedModeSynthetic && normSource == dto.QuoteSourceSeed) {
			return nil, fmt.Errorf("%w: cached quote source %q is not eligible for %s feed mode", ErrQuoteIneligible, source, mode)
		}
	}

	updatedAtStr := strings.TrimSpace(values["updated_at"])
	if updatedAtStr == "" {
		return nil, ErrQuoteStale
	}
	updatedAt, err := dto.ParseQuoteTime(updatedAtStr)
	if err != nil || updatedAt.After(time.Now().Add(5*time.Second)) {
		return nil, fmt.Errorf("%w: cached quote timestamp is invalid", ErrQuoteIneligible)
	}

	price, err := strconv.ParseInt(values["price_paise"], 10, 64)
	if err != nil || price <= 0 {
		return nil, fmt.Errorf("invalid stored quote")
	}
	var changePaise int64
	var changePercent float64
	var volume int64
	if cp, ok := values["change_paise"]; ok {
		changePaise, _ = strconv.ParseInt(cp, 10, 64)
	}
	if cp, ok := values["change_percent"]; ok {
		changePercent, _ = strconv.ParseFloat(cp, 64)
	}
	if v, ok := values["volume"]; ok {
		volume, _ = strconv.ParseInt(v, 10, 64)
	}
	openInterest, _ := strconv.ParseInt(values["open_interest"], 10, 64)
	previousClose, _ := strconv.ParseInt(values["previous_close_paise"], 10, 64)
	dayAvailable, _ := strconv.ParseBool(values["day_change_available"])
	return &dto.QuoteResponse{
		OpenInterest:          openInterest,
		OpenInterestAvailable: values["open_interest_available"] == "true",
		OpenPaise:             optionalInt(values, "open_paise"), HighPaise: optionalInt(values, "high_paise"), LowPaise: optionalInt(values, "low_paise"),
		LowerCircuitPaise: optionalInt(values, "lower_circuit_paise"), UpperCircuitPaise: optionalInt(values, "upper_circuit_paise"), Depth: optionalDepth(values),
		PreviousClosePaise: previousClose,
		DayChangeAvailable: dayAvailable && previousClose > 0,
		Symbol:             symbol,
		PricePaise:         price,
		ChangePaise:        changePaise,
		ChangePercent:      changePercent,
		Volume:             volume,
		Source:             values["source"],
		UpdatedAt:          values["updated_at"],
	}, nil
}

// BatchQuotes retrieves quotes for an array of symbols in a single call.
func (s *Service) BatchQuotes(symbols []string) map[string]*dto.QuoteResponse {
	results := make(map[string]*dto.QuoteResponse)
	var mu sync.Mutex
	var wg sync.WaitGroup
	jobs := make(chan string)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for sym := range jobs {
				if q, err := s.CachedQuote(sym); err == nil && q != nil && q.PricePaise > 0 {
					mu.Lock()
					results[sym] = q
					mu.Unlock()
				}
			}
		}()
	}
	seen := make(map[string]bool)
	for _, sym := range symbols {
		clean := strings.ToUpper(strings.TrimSpace(sym))
		if clean != "" && !seen[clean] {
			seen[clean] = true
			jobs <- clean
		}
	}
	close(jobs)
	wg.Wait()
	return results
}

// RenewQuoteSubscriptions keeps existing browser subscriptions alive without
// re-reading every quote or checking the instrument database on each heartbeat.
func (s *Service) RenewQuoteSubscriptions(symbols []string) {
	if s == nil || s.client == nil || s.FeedMode() != dto.FeedModeLive || len(symbols) == 0 {
		return
	}
	members := make([]redis.Z, 0, len(symbols))
	now := float64(time.Now().Unix())
	for _, symbol := range symbols {
		members = append(members, redis.Z{Score: now, Member: symbol})
	}
	ctx, cancel := cache.Context(context.Background(), s.timeout)
	defer cancel()
	_ = s.client.ZAdd(ctx, "market:quote:demand", members...).Err()
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
			// Permitted synthetic F&O contracts can proceed to derivative quote derivation
			if mode == dto.FeedModeSynthetic && product.IsSyntheticContract(symbol) {
				// Synthetic contract permitted
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

	// Demand is consumed asynchronously by the worker; never call the broker in a request.
	if mode == dto.FeedModeLive {
		_ = s.client.ZAdd(ctx, "market:quote:demand", redis.Z{Score: float64(time.Now().Unix()), Member: symbol}).Err()
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
		if mode == dto.FeedModeSynthetic {
			return s.DerivedFNOQuote(symbol)
		}
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
	updatedAt, parseErr := dto.ParseQuoteTime(updatedAtStr)
	if parseErr != nil || time.Since(updatedAt) > maxExecutableQuoteAge {
		return nil, ErrQuoteStale
	}

	var changePaise int64
	var changePercent float64
	var volume int64
	if cp, ok := values["change_paise"]; ok {
		changePaise, _ = strconv.ParseInt(cp, 10, 64)
	}
	if cp, ok := values["change_percent"]; ok {
		changePercent, _ = strconv.ParseFloat(cp, 64)
	}
	if v, ok := values["volume"]; ok {
		volume, _ = strconv.ParseInt(v, 10, 64)
	}
	openInterest, _ := strconv.ParseInt(values["open_interest"], 10, 64)
	previousClose, _ := strconv.ParseInt(values["previous_close_paise"], 10, 64)
	dayAvailable, _ := strconv.ParseBool(values["day_change_available"])
	return &dto.QuoteResponse{
		OpenInterest:          openInterest,
		OpenInterestAvailable: values["open_interest_available"] == "true",
		OpenPaise:             optionalInt(values, "open_paise"), HighPaise: optionalInt(values, "high_paise"), LowPaise: optionalInt(values, "low_paise"),
		LowerCircuitPaise: optionalInt(values, "lower_circuit_paise"), UpperCircuitPaise: optionalInt(values, "upper_circuit_paise"), Depth: optionalDepth(values),
		PreviousClosePaise: previousClose,
		DayChangeAvailable: dayAvailable && previousClose > 0,
		Symbol:             symbol,
		PricePaise:         price,
		ChangePaise:        changePaise,
		ChangePercent:      changePercent,
		Volume:             volume,
		Source:             source,
		UpdatedAt:          values["updated_at"],
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
	if (errors.Is(err, ErrQuoteNotFound) || errors.Is(err, ErrQuoteStale)) && s.FeedMode() == dto.FeedModeLive {
		if wQuote, wErr := s.FetchLiveFromWorker(symbol); wErr == nil && wQuote != nil && wQuote.PricePaise > 0 {
			quote = wQuote
			err = nil
		}
	}
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
	updatedAt, err := dto.ParseQuoteTime(quote.UpdatedAt)
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
	updatedAt, err := dto.ParseQuoteTime(quote.UpdatedAt)
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

func (s *Service) HistoricalQuotes(symbol string, limit int, intervals ...string) ([]dto.CandleResponse, error) {
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	if symbol == "" {
		return nil, fmt.Errorf("symbol is required")
	}
	interval := "ONE_MINUTE"
	if len(intervals) > 0 && intervals[0] != "" {
		interval = intervals[0]
	}
	if interval != "ONE_MINUTE" && interval != "ONE_HOUR" && interval != "ONE_DAY" {
		return nil, fmt.Errorf("unsupported historical interval")
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
	symbol = alias.ResolveCanonicalSymbol(symbol)
	key := historyKey(symbol)
	if interval != "ONE_MINUTE" {
		key += ":" + interval
	}
	if s.FeedMode() == dto.FeedModeLive {
		if err := s.client.ZAdd(ctx, "market:history:demand", redis.Z{Score: float64(time.Now().Unix()), Member: symbol + "|" + interval}).Err(); err != nil {
			return nil, fmt.Errorf("%w: %v", cache.ErrUnavailable, err)
		}
	}
	items, err := s.client.LRange(ctx, key, 0, int64(limit-1)).Result()
	if err != nil {
		return nil, fmt.Errorf("%w: %v", cache.ErrUnavailable, err)
	}
	result := make([]dto.CandleResponse, 0, len(items))
	for i := len(items) - 1; i >= 0; i-- {
		var candle dto.CandleResponse
		if err := json.Unmarshal([]byte(items[i]), &candle); err != nil {
			return nil, fmt.Errorf("invalid stored candle")
		}
		if !ValidHistoricalCandle(candle, s.FeedMode(), s.AllowSeededQuotes(), time.Now()) {
			continue
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
	subscribedCount, _ := strconv.Atoi(res["subscribed_tokens_count"])
	return &dto.FeedStatusResponse{
		FeedProvider:          res["feed_provider"],
		FeedState:             res["feed_state"],
		IsSynthetic:           isSynthetic,
		LastTick:              res["last_tick"],
		UpdatedAt:             res["updated_at"],
		SubscribedTokensCount: subscribedCount,
	}, nil
}

func quoteKey(symbol string) string   { return "market:quote:" + symbol }
func historyKey(symbol string) string { return "market:history:" + symbol }

// ValidHistoricalCandle rejects unknown provenance and cross-mode cached data.
// Historical candles need a valid timestamp, not the freshness of a live tick.
func ValidHistoricalCandle(c dto.CandleResponse, mode dto.FeedMode, allowSeeded bool, now time.Time) bool {
	source := dto.NormalizeQuoteSource(c.Source)
	eligible := dto.IsSourceExecutableInMode(source, mode) || (allowSeeded && mode == dto.FeedModeSynthetic && source == dto.QuoteSourceSeed)
	return eligible && dto.NormalizeFeedMode(c.FeedMode) == mode && c.Timestamp > 0 && c.Timestamp <= now.Unix()+5 && c.OpenPaise > 0 && c.ClosePaise > 0 && c.LowPaise > 0 && c.HighPaise >= c.LowPaise && c.OpenPaise >= c.LowPaise && c.OpenPaise <= c.HighPaise && c.ClosePaise >= c.LowPaise && c.ClosePaise <= c.HighPaise && c.Volume >= 0
}

func (s *Service) ValidateStreamQuote(q *dto.QuoteResponse) error {
	return ValidateExecutableQuoteWithFeedMode(q, time.Now(), s.FeedMode(), s.AllowSeededQuotes())
}

func optionalInt(values map[string]string, key string) int64 {
	n, _ := strconv.ParseInt(values[key], 10, 64)
	return n
}
func optionalDepth(values map[string]string) *dto.MarketDepth {
	var book dto.MarketDepth
	if json.Unmarshal([]byte(values["depth_json"]), &book) != nil || len(book.Bids) != 5 || len(book.Asks) != 5 {
		return nil
	}
	for _, rows := range [][]dto.DepthLevel{book.Bids, book.Asks} {
		for _, row := range rows {
			if row.PricePaise <= 0 || row.Quantity <= 0 {
				return nil
			}
		}
	}
	return &book
}
