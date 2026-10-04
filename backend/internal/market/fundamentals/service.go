// Package fundamentals supplies display-only company metrics. It never supplies
// quotes, margin, execution prices or settlement values.
package fundamentals

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type Metric struct {
	Label string `json:"label"`
	Value string `json:"value"`
}
type Snapshot struct {
	Symbol      string   `json:"symbol"`
	Source      string   `json:"source"`
	Status      string   `json:"status"`
	Message     string   `json:"message,omitempty"`
	RetrievedAt string   `json:"retrieved_at,omitempty"`
	Metrics     []Metric `json:"metrics"`
}
type Service struct {
	key, endpoint, prefix string
	cache                 *redis.Client
	client                *http.Client
	knownEquity           func(context.Context, string) bool
}

// Only official vendor origins are allowed. No user-controlled URL or API key is
// placed in a URL, response, log or client-side bundle.
func New(key, plan string, client *redis.Client, knownEquity func(context.Context, string) bool) *Service {
	hosts := map[string]string{"free": "stock", "developer": "dev", "analyst": "analyst", "pro": "pro"}
	host := hosts[strings.ToLower(strings.TrimSpace(plan))]
	if host == "" {
		host = "stock"
	}
	return &Service{key: strings.TrimSpace(key), endpoint: "https://" + host + ".indianapi.in/stock", prefix: "market:fundamentals:indianapi:", cache: client,
		client: &http.Client{Timeout: 6 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, knownEquity: knownEquity}
}

func unavailable(symbol, status, message string) Snapshot {
	return Snapshot{Symbol: symbol, Source: "IndianAPI", Status: status, Message: message, Metrics: []Metric{}}
}

func (s *Service) Get(ctx context.Context, symbol string) Snapshot {
	ctx, cancel := context.WithTimeout(ctx, 7*time.Second)
	defer cancel()
	symbol = strings.TrimSuffix(strings.ToUpper(strings.TrimSpace(symbol)), "-EQ")
	if len(symbol) == 0 || len(symbol) > 40 || s.knownEquity == nil || !s.knownEquity(ctx, symbol) {
		return unavailable(symbol, "UNAVAILABLE", "Company is not a current NSE equity in the instrument master.")
	}
	if s.key == "" {
		return unavailable(symbol, "NOT_CONFIGURED", "A company fundamentals provider is not configured.")
	}
	if s.cache == nil {
		return unavailable(symbol, "UNAVAILABLE", "Fundamentals cache unavailable.")
	}
	cacheKey := s.prefix + "v1:" + symbol
	if raw, err := s.cache.Get(ctx, cacheKey).Result(); err == nil {
		var snapshot Snapshot
		if json.Unmarshal([]byte(raw), &snapshot) == nil && snapshot.Symbol == symbol {
			return snapshot
		}
	} else if !errors.Is(err, redis.Nil) {
		return unavailable(symbol, "UNAVAILABLE", "Fundamentals cache unavailable.")
	}
	lockToken := uuid.NewString()
	lockKey := cacheKey + ":lock"
	locked, err := s.cache.SetNX(ctx, lockKey, lockToken, 10*time.Second).Result()
	if err != nil || !locked {
		return unavailable(symbol, "UPDATING", "Company fundamentals are being refreshed. Try again shortly.")
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = s.cache.Eval(cleanup, `if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0`, []string{lockKey}, lockToken).Err()
	}()
	// Shared daily budget and short burst gate bound requests across app replicas.
	// These conservative defaults prevent a discovery page consuming the API quota.
	budgetKey := s.prefix + "budget:" + time.Now().UTC().Format("2006-01-02")
	allowed, err := s.cache.Eval(ctx, `local n=tonumber(redis.call('GET',KEYS[1]) or '0'); if n>=25 then return 0 end; if not redis.call('SET',KEYS[2],'1','NX','EX',1) then return 0 end; redis.call('INCR',KEYS[1]); redis.call('EXPIRE',KEYS[1],172800); return 1`, []string{budgetKey, s.prefix + "burst"}).Int()
	if err != nil || allowed != 1 {
		return unavailable(symbol, "RATE_LIMITED", "Fundamentals refresh budget reached. Cached company data remains available.")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.endpoint+"?name="+url.QueryEscape(symbol), nil)
	if err != nil {
		return unavailable(symbol, "UNAVAILABLE", "Fundamentals request unavailable.")
	}
	req.Header.Set("X-API-Key", s.key)
	req.Header.Set("Accept", "application/json")
	result := unavailable(symbol, "UNAVAILABLE", "Company fundamentals provider is unavailable.")
	ttl := 5 * time.Minute
	resp, err := s.client.Do(req)
	if err == nil {
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			raw, readErr := io.ReadAll(io.LimitReader(resp.Body, (2<<20)+1))
			if readErr == nil && len(raw) <= 2<<20 {
				if parsed, parseErr := normalize(raw, symbol); parseErr == nil {
					result = parsed
					ttl = 12 * time.Hour
				} else {
					result.Message = "Provider company identity or metric format could not be verified."
				}
			}
		}
	}
	if raw, err := json.Marshal(result); err == nil {
		_ = s.cache.Set(ctx, cacheKey, raw, ttl).Err()
	}
	return result
}

// Preserve provider labels, units and reporting periods. Do not invent a P/E,
// EPS, currency, market-cap scale or 'as of' date from an undocumented field.
func normalize(raw []byte, symbol string) (Snapshot, error) {
	var payload struct {
		Ticker  string          `json:"tickerId"`
		Metrics json.RawMessage `json:"keyMetrics"`
	}
	if json.Unmarshal(raw, &payload) != nil || !strings.EqualFold(strings.TrimSuffix(payload.Ticker, "-EQ"), symbol) {
		return Snapshot{}, errors.New("identity unverified")
	}
	var metrics any
	d := json.NewDecoder(strings.NewReader(string(payload.Metrics)))
	d.UseNumber()
	if err := d.Decode(&metrics); err != nil {
		return Snapshot{}, err
	}
	result := Snapshot{Symbol: symbol, Source: "IndianAPI", Status: "AVAILABLE", RetrievedAt: time.Now().UTC().Format(time.RFC3339), Metrics: []Metric{}}
	var walk func(any, string, int)
	walk = func(value any, label string, depth int) {
		if depth > 4 || len(result.Metrics) >= 40 {
			return
		}
		switch v := value.(type) {
		case map[string]any:
			keys := make([]string, 0, len(v))
			for k := range v {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			for _, key := range keys {
				next := key
				if label != "" {
					next = label + " · " + key
				}
				walk(v[key], next, depth+1)
			}
		case []any:
			// Labeled rows retain a supplied period/unit; unknown array shapes are omitted.
			for _, row := range v {
				if obj, ok := row.(map[string]any); ok {
					name, _ := obj["label"].(string)
					if name == "" {
						name, _ = obj["name"].(string)
					}
					for _, k := range []string{"period", "unit"} {
						if suffix, ok := obj[k].(string); ok && suffix != "" {
							name += " (" + suffix + ")"
						}
					}
					if name != "" {
						walk(obj["value"], name, depth+1)
					}
				}
			}
		case json.Number:
			if label != "" {
				result.Metrics = append(result.Metrics, Metric{Label: label, Value: v.String()})
			}
		case string:
			v = strings.TrimSpace(v)
			if label != "" && v != "" && len(v) <= 100 && len(label) <= 180 && v != "-" && !strings.EqualFold(v, "null") && !strings.EqualFold(v, "nan") {
				result.Metrics = append(result.Metrics, Metric{Label: label, Value: v})
			}
		}
	}
	walk(metrics, "", 0)
	if len(result.Metrics) == 0 {
		return Snapshot{}, errors.New("no verified metrics")
	}
	return result, nil
}

func (s *Service) Handler(c *gin.Context) {
	response.Success(c, http.StatusOK, "Company fundamentals", s.Get(c.Request.Context(), c.Param("symbol")))
}
