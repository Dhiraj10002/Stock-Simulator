package fundamentals

import (
	"context"
	"encoding/json"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestFundamentalsPreserveUnitsPeriodsAndVerifyIdentity(t *testing.T) {
	raw := []byte(`{"tickerId":"RELIANCE","keyMetrics":{"P/E (TTM)":25.6,"EPS (INR, FY2026)":-12.5,"Dividend yield (%)":0,"Market cap (INR crore)":"20,000","missing":null}}`)
	result, err := normalize(raw, "RELIANCE")
	if err != nil || result.Status != "AVAILABLE" || len(result.Metrics) != 4 {
		t.Fatalf("unexpected metrics: %+v %v", result, err)
	}
	metrics := map[string]string{}
	for _, metric := range result.Metrics {
		metrics[metric.Label] = metric.Value
	}
	if metrics["EPS (INR, FY2026)"] != "-12.5" || metrics["Dividend yield (%)"] != "0" || metrics["Market cap (INR crore)"] != "20,000" {
		t.Fatal(metrics)
	}
	if _, err := normalize(raw, "TCS"); err == nil {
		t.Fatal("wrong identity accepted")
	}
	if _, err := normalize([]byte(`{"companyName":"Reliance","keyMetrics":{"PE":3}}`), "RELIANCE"); err == nil {
		t.Fatal("missing ticker identity accepted")
	}
	if _, err := normalize([]byte(`{"tickerId":"RELIANCE","keyMetrics":{}}`), "RELIANCE"); err == nil {
		t.Fatal("empty metrics accepted")
	}
	rows, err := normalize([]byte(`{"tickerId":"TCS","keyMetrics":[{"label":"EPS","value":100,"period":"FY2025","unit":"INR"}]}`), "TCS")
	if err != nil || rows.Metrics[0].Label != "EPS (FY2025) (INR)" {
		t.Fatalf("lost period/unit: %+v %v", rows, err)
	}
	if _, err := normalize([]byte(`{"tickerId":"TCS","keyMetrics":[{"value":100,"period":"FY2025","unit":"INR"}]}`), "TCS"); err == nil {
		t.Fatal("period and unit without a metric identity were accepted")
	}
}
func TestFundamentalsUnconfiguredUnknownAndCacheFailureAreExplicit(t *testing.T) {
	known := func(_ context.Context, s string) bool { return s == "TCS" }
	s := New("", "free", nil, known)
	if got := s.Get(context.Background(), "TCS-EQ"); got.Status != "NOT_CONFIGURED" || len(got.Metrics) != 0 {
		t.Fatal(got)
	}
	if got := s.Get(context.Background(), "UNKNOWN"); got.Status != "UNAVAILABLE" {
		t.Fatal(got)
	}
	s = New("test-key", "pro", nil, known)
	if got := s.Get(context.Background(), "TCS"); got.Status != "UNAVAILABLE" {
		t.Fatal(got)
	}
	if s.endpoint != "https://pro.indianapi.in/stock" || New("key", "https://elsewhere.invalid", nil, known).endpoint != "https://stock.indianapi.in/stock" {
		t.Fatal("unapproved origin")
	}
}
func TestFundamentalsRedisCacheBudgetAndProviderErrors(t *testing.T) {
	// This integration test uses the disposable Redis configured by CI only.
	rawURL := os.Getenv("TEST_REDIS_URL")
	if rawURL == "" {
		t.Skip("TEST_REDIS_URL not configured")
	}
	options, err := redis.ParseURL(rawURL)
	if err != nil {
		t.Fatal(err)
	}
	r := redis.NewClient(options)
	defer r.Close()
	if err := r.Ping(t.Context()).Err(); err != nil {
		t.Fatal(err)
	}
	prefix := "test:fundamentals:" + uuid.NewString() + ":"
	defer func() {
		keys, _ := r.Keys(t.Context(), prefix+"*").Result()
		if len(keys) > 0 {
			_ = r.Del(t.Context(), keys...).Err()
		}
	}()
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		calls.Add(1)
		if req.Header.Get("X-API-Key") != "fixture-secret" || strings.Contains(req.URL.String(), "fixture-secret") {
			t.Error("API key transport is wrong")
		}
		symbol := req.URL.Query().Get("name")
		if symbol == "BROKEN" {
			w.WriteHeader(500)
			_, _ = w.Write([]byte("fixture-secret vendor error"))
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"tickerId": symbol, "keyMetrics": map[string]any{"PE (TTM)": 25.5}})
	}))
	defer server.Close()
	s := New("fixture-secret", "free", r, func(context.Context, string) bool { return true })
	s.endpoint = server.URL
	s.prefix = prefix
	first := s.Get(t.Context(), "TCS")
	second := s.Get(t.Context(), "TCS")
	if first.Status != "AVAILABLE" || second.RetrievedAt != first.RetrievedAt || calls.Load() != 1 {
		t.Fatalf("cache failed: %+v %+v %d", first, second, calls.Load())
	}
	_ = r.Del(t.Context(), prefix+"burst").Err()
	broken := s.Get(t.Context(), "BROKEN")
	if broken.Status != "UNAVAILABLE" || strings.Contains(broken.Message, "fixture-secret") {
		t.Fatal(broken)
	}
	_ = s.Get(t.Context(), "BROKEN")
	if calls.Load() != 2 {
		t.Fatal("provider failure was not cached")
	}
	budgetKey := prefix + "budget:" + time.Now().UTC().Format("2006-01-02")
	_ = r.Set(t.Context(), budgetKey, 25, time.Hour).Err()
	limited := s.Get(t.Context(), "RELIANCE")
	if limited.Status != "RATE_LIMITED" || calls.Load() != 2 {
		t.Fatal("daily budget bypassed")
	}
}
