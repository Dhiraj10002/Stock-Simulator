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


