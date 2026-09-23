package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
)

func TestQuoteAgeValidation(t *testing.T) {
	tests := []struct {
		name        string
		updatedAt   time.Time
		shouldError bool
	}{
		{name: "recent quote", updatedAt: time.Now().Add(-time.Minute)},
		{name: "stale quote", updatedAt: time.Now().Add(-maxExecutableQuoteAge - time.Second), shouldError: true},
		{name: "future quote", updatedAt: time.Now().Add(time.Minute), shouldError: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateExecutableQuote(&dto.QuoteResponse{PricePaise: 1, UpdatedAt: test.updatedAt.UTC().Format(time.RFC3339)}, time.Now())
			if (err != nil) != test.shouldError {
				t.Fatalf("err=%v, shouldError=%v", err, test.shouldError)
			}
		})
	}
}

func TestQuoteValidationRejectsInvalidPriceAndTimestamp(t *testing.T) {
	now := time.Now()
	if err := validateExecutableQuote(&dto.QuoteResponse{PricePaise: 0, UpdatedAt: now.UTC().Format(time.RFC3339)}, now); err == nil {
		t.Fatal("expected zero price to be rejected")
	}
	if err := validateExecutableQuote(&dto.QuoteResponse{PricePaise: 1, UpdatedAt: "not-a-time"}, now); err == nil {
		t.Fatal("expected malformed timestamp to be rejected")
	}
}

func TestSeededQuoteRejection(t *testing.T) {
	now := time.Now()
	nowStr := now.UTC().Format(time.RFC3339)

	seedSources := []string{"auto_seeded", "initial_seed", "benchmark_fallback", "static_fallback", "AUTO_SEEDED", "INITIAL_SEED"}
	for _, source := range seedSources {
		t.Run("rejects "+source+" in default mode", func(t *testing.T) {
			quote := &dto.QuoteResponse{
				Symbol:     "RELIANCE",
				PricePaise: 250000,
				Source:     source,
				UpdatedAt:  nowStr,
			}
			err := validateExecutableQuote(quote, now)
			if err == nil {
				t.Fatalf("expected seeded source %q to be rejected in default mode", source)
			}
			// But when explicit simulation mode permits seeded quotes:
			errSim := validateExecutableQuoteWithMode(quote, now, true)
			if errSim != nil {
				t.Fatalf("expected seeded source %q to be accepted in simulation mode, got: %v", source, errSim)
			}
		})
	}

	validSources := []string{"angelone_live", "synthetic", "synthetic_gbm", "fno_engine", ""}
	for _, source := range validSources {
		t.Run("allows non-seed source "+source+" in default mode", func(t *testing.T) {
			quote := &dto.QuoteResponse{
				Symbol:     "RELIANCE",
				PricePaise: 250000,
				Source:     source,
				UpdatedAt:  nowStr,
			}
			err := validateExecutableQuote(quote, now)
			if err != nil {
				t.Fatalf("expected non-seed source %q to be accepted in default mode, got: %v", source, err)
			}
		})
	}
}

func TestServiceAllowSeededQuotes(t *testing.T) {
	svc := &Service{}
	if svc.AllowSeededQuotes() {
		t.Fatal("expected AllowSeededQuotes to be false by default")
	}
	svc.SetAllowSeededQuotes(true)
	if !svc.AllowSeededQuotes() {
		t.Fatal("expected AllowSeededQuotes to be true after SetAllowSeededQuotes(true)")
	}
	svc.SetAllowSeededQuotes(false)
	if svc.AllowSeededQuotes() {
		t.Fatal("expected AllowSeededQuotes to be false after SetAllowSeededQuotes(false)")
	}
}

func TestWorkerURLConfiguration(t *testing.T) {
	svc := &Service{}
	// Default when unset
	origEnv := os.Getenv("MARKET_WORKER_URL")
	_ = os.Unsetenv("MARKET_WORKER_URL")
	defer func() {
		if origEnv != "" {
			_ = os.Setenv("MARKET_WORKER_URL", origEnv)
		} else {
			_ = os.Unsetenv("MARKET_WORKER_URL")
		}
	}()

	if svc.WorkerURL() != "http://127.0.0.1:8085" {
		t.Fatalf("expected default WorkerURL http://127.0.0.1:8085, got %q", svc.WorkerURL())
	}

	// Environment variable configuration (e.g. Docker Compose)
	_ = os.Setenv("MARKET_WORKER_URL", "http://market-worker:8085/")
	if svc.WorkerURL() != "http://market-worker:8085" {
		t.Fatalf("expected trimmed env WorkerURL http://market-worker:8085, got %q", svc.WorkerURL())
	}

	// Explicit override via SetWorkerURL
	svc.SetWorkerURL("http://custom-host:9000/")
	if svc.WorkerURL() != "http://custom-host:9000" {
		t.Fatalf("expected custom WorkerURL http://custom-host:9000, got %q", svc.WorkerURL())
	}
}

func TestFetchLiveFromWorkerCustomURL(t *testing.T) {
	requestedSymbol := ""
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/quote" {
			http.NotFound(w, r)
			return
		}
		requestedSymbol = r.URL.Query().Get("symbol")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(dto.QuoteResponse{
			Symbol:     requestedSymbol,
			PricePaise: 250000,
			Source:     "angelone_live",
			UpdatedAt:  time.Now().UTC().Format(time.RFC3339),
		})
	}))
	defer server.Close()

	svc := &Service{}
	svc.SetWorkerURL(server.URL)

	quote, err := svc.fetchLiveFromWorker("TCS")
	if err != nil {
		t.Fatalf("unexpected error fetching from mock worker: %v", err)
	}
	if quote == nil || quote.Symbol != "TCS" || quote.PricePaise != 250000 {
		t.Fatalf("unexpected quote response: %+v", quote)
	}
	if requestedSymbol != "TCS" {
		t.Fatalf("expected requested symbol TCS, got %q", requestedSymbol)
	}

	// Test disabled worker configuration
	svc.SetWorkerURL("disabled")
	_, errDisabled := svc.fetchLiveFromWorker("TCS")
	if errDisabled == nil {
		t.Fatal("expected error when worker is disabled")
	}
}

func TestFeedStatusGracefulFallback(t *testing.T) {
	var nilSvc *Service
	status, err := nilSvc.FeedStatus(nil)
	if err != nil {
		t.Fatalf("unexpected error for nil service: %v", err)
	}
	if status == nil || status.FeedState != "DISCONNECTED" || !status.IsSynthetic {
		t.Fatalf("expected DISCONNECTED synthetic fallback for nil service, got %+v", status)
	}

	emptySvc := &Service{}
	status, err = emptySvc.FeedStatus(nil)
	if err != nil {
		t.Fatalf("unexpected error for empty service: %v", err)
	}
	if status == nil || status.FeedState != "DISCONNECTED" || !status.IsSynthetic {
		t.Fatalf("expected DISCONNECTED synthetic fallback for empty service, got %+v", status)
	}
}

func TestQuoteSourceClassification(t *testing.T) {
	seededCases := []string{
		"auto_seeded",
		"initial_seed",
		"benchmark_fallback",
		"static_fallback",
		"mock",
		"AUTO_SEEDED",
		"Initial_Seed",
		"  benchmark_fallback  ",
		"STATIC_FALLBACK",
	}
	for _, src := range seededCases {
		if !IsSeededSource(src) {
			t.Errorf("expected %q to be classified as a seeded source", src)
		}
	}

	authoritativeCases := []string{
		"angelone_live",
		"synthetic",
		"synthetic_gbm",
		"fno_engine",
		"ANGELONE_LIVE",
		"SYNTHETIC",
		"custom_live_stream",
		"",
	}
	for _, src := range authoritativeCases {
		if IsSeededSource(src) {
			t.Errorf("expected %q to NOT be classified as a seeded source", src)
		}
	}
}

func TestExecutableQuoteEligibility_StrictValidation(t *testing.T) {
	now := time.Now()
	nowStr := now.UTC().Format(time.RFC3339)

	t.Run("Rejects nil quote", func(t *testing.T) {
		if err := ValidateExecutableQuoteWithMode(nil, now, false); err == nil {
			t.Fatal("expected nil quote to be rejected")
		}
	})

	t.Run("Rejects non-positive prices", func(t *testing.T) {
		for _, price := range []int64{0, -1, -50000} {
			q := &dto.QuoteResponse{PricePaise: price, UpdatedAt: nowStr, Source: "angelone_live"}
			if err := ValidateExecutableQuoteWithMode(q, now, false); err == nil {
				t.Fatalf("expected price %d to be rejected", price)
			}
		}
	})

	t.Run("Rejects empty or malformed timestamps", func(t *testing.T) {
		for _, ts := range []string{"", "  ", "invalid-time", "2026/09/23 11:00:00"} {
			q := &dto.QuoteResponse{PricePaise: 250000, UpdatedAt: ts, Source: "angelone_live"}
			if err := ValidateExecutableQuoteWithMode(q, now, false); err == nil {
				t.Fatalf("expected timestamp %q to be rejected", ts)
			}
		}
	})

	t.Run("Rejects quotes in the future beyond 5 seconds tolerance", func(t *testing.T) {
		futureFar := now.Add(10 * time.Second).UTC().Format(time.RFC3339)
		qFar := &dto.QuoteResponse{PricePaise: 250000, UpdatedAt: futureFar, Source: "angelone_live"}
		if err := ValidateExecutableQuoteWithMode(qFar, now, false); err == nil {
			t.Fatal("expected quote 10s in future to be rejected")
		}

		// Within 5s clock skew tolerance -> accepted
		futureNear := now.Add(2 * time.Second).UTC().Format(time.RFC3339)
		qNear := &dto.QuoteResponse{PricePaise: 250000, UpdatedAt: futureNear, Source: "angelone_live"}
		if err := ValidateExecutableQuoteWithMode(qNear, now, false); err != nil {
			t.Fatalf("expected quote within 5s future tolerance to be accepted, got: %v", err)
		}
	})

	t.Run("Boundary age validation at 2 minutes", func(t *testing.T) {
		// 119 seconds old -> eligible
		age119 := now.Add(-119 * time.Second).UTC().Format(time.RFC3339)
		q119 := &dto.QuoteResponse{PricePaise: 250000, UpdatedAt: age119, Source: "angelone_live"}
		if err := ValidateExecutableQuoteWithMode(q119, now, false); err != nil {
			t.Fatalf("expected 119s quote to be eligible, got: %v", err)
		}

		// 121 seconds old -> stale and rejected
		age121 := now.Add(-121 * time.Second).UTC().Format(time.RFC3339)
		q121 := &dto.QuoteResponse{PricePaise: 250000, UpdatedAt: age121, Source: "angelone_live"}
		if err := ValidateExecutableQuoteWithMode(q121, now, false); err == nil {
			t.Fatal("expected 121s quote to be rejected as stale")
		}
	})

	t.Run("Source eligibility across production vs simulation modes", func(t *testing.T) {
		sources := []struct {
			source         string
			eligibleInProd bool
			eligibleInSim  bool
		}{
			{"angelone_live", true, true},
			{"synthetic", true, true},
			{"fno_engine", true, true},
			{"auto_seeded", false, true},
			{"initial_seed", false, true},
			{"benchmark_fallback", false, true},
			{"static_fallback", false, true},
		}

		for _, tc := range sources {
			q := &dto.QuoteResponse{PricePaise: 250000, UpdatedAt: nowStr, Source: tc.source}
			errProd := ValidateExecutableQuoteWithMode(q, now, false)
			if (errProd == nil) != tc.eligibleInProd {
				t.Errorf("source %s in prod mode: eligible=%v want=%v (err=%v)", tc.source, errProd == nil, tc.eligibleInProd, errProd)
			}

			errSim := ValidateExecutableQuoteWithMode(q, now, true)
			if (errSim == nil) != tc.eligibleInSim {
				t.Errorf("source %s in sim mode: eligible=%v want=%v (err=%v)", tc.source, errSim == nil, tc.eligibleInSim, errSim)
			}
		}
	})
}

func TestFeedStatus_NilServiceOrClient(t *testing.T) {
	var s *Service
	status, err := s.FeedStatus(t.Context())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if status.FeedProvider != "unknown" || status.FeedState != "DISCONNECTED" || !status.IsSynthetic {
		t.Fatalf("expected disconnected synthetic status for nil service, got: %+v", status)
	}
}
