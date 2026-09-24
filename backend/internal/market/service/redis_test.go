package service

import (
	"encoding/json"
	"errors"
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

func TestServiceFeedModeConfiguration(t *testing.T) {
	var nilSvc *Service
	if nilSvc.FeedMode() != dto.FeedModeLive {
		t.Fatalf("expected default FeedModeLive for nil service, got %s", nilSvc.FeedMode())
	}

	svc := &Service{}
	if svc.FeedMode() != dto.FeedModeLive {
		t.Fatalf("expected default FeedModeLive for empty service, got %s", svc.FeedMode())
	}

	svc.SetFeedMode(dto.FeedModeSynthetic)
	if svc.FeedMode() != dto.FeedModeSynthetic {
		t.Fatalf("expected FeedModeSynthetic, got %s", svc.FeedMode())
	}

	svc.SetFeedMode(dto.FeedModeUnavailable)
	if svc.FeedMode() != dto.FeedModeUnavailable {
		t.Fatalf("expected FeedModeUnavailable, got %s", svc.FeedMode())
	}

	svc.SetFeedMode(dto.FeedModeLive)
	if svc.FeedMode() != dto.FeedModeLive {
		t.Fatalf("expected FeedModeLive, got %s", svc.FeedMode())
	}
}

func TestFeedMode_AuthoritativeEligibilityMatrix(t *testing.T) {
	now := time.Now()
	nowStr := now.UTC().Format(time.RFC3339)

	testCases := []struct {
		name        string
		mode        dto.FeedMode
		source      string
		allowSeeded bool
		wantPass    bool
		wantErrIs   error
	}{
		// LIVE feed mode
		{name: "LIVE allows angelone_live", mode: dto.FeedModeLive, source: "angelone_live", allowSeeded: false, wantPass: true},
		{name: "LIVE rejects synthetic_gbm", mode: dto.FeedModeLive, source: "synthetic_gbm", allowSeeded: false, wantPass: false, wantErrIs: ErrQuoteIneligible},
		{name: "LIVE rejects synthetic", mode: dto.FeedModeLive, source: "synthetic", allowSeeded: false, wantPass: false, wantErrIs: ErrQuoteIneligible},
		{name: "LIVE rejects fno_engine", mode: dto.FeedModeLive, source: "fno_engine", allowSeeded: false, wantPass: false, wantErrIs: ErrQuoteIneligible},
		{name: "LIVE rejects auto_seeded even if allowSeeded=true", mode: dto.FeedModeLive, source: "auto_seeded", allowSeeded: true, wantPass: false, wantErrIs: ErrQuoteIneligible},
		{name: "LIVE rejects benchmark_fallback", mode: dto.FeedModeLive, source: "benchmark_fallback", allowSeeded: false, wantPass: false, wantErrIs: ErrQuoteIneligible},
		{name: "LIVE rejects empty source", mode: dto.FeedModeLive, source: "", allowSeeded: false, wantPass: false, wantErrIs: ErrQuoteIneligible},

		// SYNTHETIC feed mode
		{name: "SYNTHETIC allows synthetic_gbm", mode: dto.FeedModeSynthetic, source: "synthetic_gbm", allowSeeded: false, wantPass: true},
		{name: "SYNTHETIC allows synthetic", mode: dto.FeedModeSynthetic, source: "synthetic", allowSeeded: false, wantPass: true},
		{name: "SYNTHETIC allows fno_engine", mode: dto.FeedModeSynthetic, source: "fno_engine", allowSeeded: false, wantPass: true},
		{name: "SYNTHETIC rejects angelone_live", mode: dto.FeedModeSynthetic, source: "angelone_live", allowSeeded: false, wantPass: false, wantErrIs: ErrQuoteIneligible},
		{name: "SYNTHETIC rejects auto_seeded when allowSeeded=false", mode: dto.FeedModeSynthetic, source: "auto_seeded", allowSeeded: false, wantPass: false, wantErrIs: ErrQuoteIneligible},
		{name: "SYNTHETIC allows auto_seeded when allowSeeded=true", mode: dto.FeedModeSynthetic, source: "auto_seeded", allowSeeded: true, wantPass: true},
		{name: "SYNTHETIC allows benchmark_fallback when allowSeeded=true", mode: dto.FeedModeSynthetic, source: "benchmark_fallback", allowSeeded: true, wantPass: true},
		{name: "SYNTHETIC allows initial_seed when allowSeeded=true", mode: dto.FeedModeSynthetic, source: "initial_seed", allowSeeded: true, wantPass: true},
		{name: "SYNTHETIC rejects empty source", mode: dto.FeedModeSynthetic, source: "", allowSeeded: false, wantPass: false, wantErrIs: ErrQuoteIneligible},

		// UNAVAILABLE feed mode
		{name: "UNAVAILABLE rejects angelone_live", mode: dto.FeedModeUnavailable, source: "angelone_live", allowSeeded: false, wantPass: false, wantErrIs: ErrQuoteUnavailable},
		{name: "UNAVAILABLE rejects synthetic_gbm", mode: dto.FeedModeUnavailable, source: "synthetic_gbm", allowSeeded: false, wantPass: false, wantErrIs: ErrQuoteUnavailable},
		{name: "UNAVAILABLE rejects fno_engine", mode: dto.FeedModeUnavailable, source: "fno_engine", allowSeeded: false, wantPass: false, wantErrIs: ErrQuoteUnavailable},
		{name: "UNAVAILABLE rejects seeded quote even if allowSeeded=true", mode: dto.FeedModeUnavailable, source: "auto_seeded", allowSeeded: true, wantPass: false, wantErrIs: ErrQuoteUnavailable},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			q := &dto.QuoteResponse{
				Symbol:     "RELIANCE",
				PricePaise: 250000,
				Source:     tc.source,
				UpdatedAt:  nowStr,
			}
			err := ValidateExecutableQuoteWithFeedMode(q, now, tc.mode, tc.allowSeeded)
			if tc.wantPass {
				if err != nil {
					t.Fatalf("expected quote to pass, got err: %v", err)
				}
			} else {
				if err == nil {
					t.Fatalf("expected quote to fail, but got nil error")
				}
				if tc.wantErrIs != nil && !errors.Is(err, tc.wantErrIs) {
					t.Fatalf("expected error wrapping %v, got %v", tc.wantErrIs, err)
				}
			}
		})
	}
}

func TestValidateExecutableQuoteWithFeedMode_SentinelErrors(t *testing.T) {
	now := time.Now()

	t.Run("Returns ErrQuoteStale for aged quotes", func(t *testing.T) {
		staleTime := now.Add(-3 * time.Minute).UTC().Format(time.RFC3339)
		q := &dto.QuoteResponse{
			Symbol:     "TCS",
			PricePaise: 300000,
			Source:     "angelone_live",
			UpdatedAt:  staleTime,
		}
		err := ValidateExecutableQuoteWithFeedMode(q, now, dto.FeedModeLive, false)
		if err == nil {
			t.Fatal("expected error for stale quote")
		}
		if !errors.Is(err, ErrQuoteStale) {
			t.Fatalf("expected errors.Is(err, ErrQuoteStale), got %v", err)
		}
	})

	t.Run("Returns ErrQuoteUnavailable for unavailable feed mode", func(t *testing.T) {
		recentTime := now.UTC().Format(time.RFC3339)
		q := &dto.QuoteResponse{
			Symbol:     "TCS",
			PricePaise: 300000,
			Source:     "angelone_live",
			UpdatedAt:  recentTime,
		}
		err := ValidateExecutableQuoteWithFeedMode(q, now, dto.FeedModeUnavailable, false)
		if err == nil {
			t.Fatal("expected error for unavailable feed mode")
		}
		if !errors.Is(err, ErrQuoteUnavailable) {
			t.Fatalf("expected errors.Is(err, ErrQuoteUnavailable), got %v", err)
		}
	})

	t.Run("Returns ErrQuoteIneligible for mismatched source", func(t *testing.T) {
		recentTime := now.UTC().Format(time.RFC3339)
		q := &dto.QuoteResponse{
			Symbol:     "TCS",
			PricePaise: 300000,
			Source:     "synthetic_gbm",
			UpdatedAt:  recentTime,
		}
		err := ValidateExecutableQuoteWithFeedMode(q, now, dto.FeedModeLive, false)
		if err == nil {
			t.Fatal("expected error for mismatched source")
		}
		if !errors.Is(err, ErrQuoteIneligible) {
			t.Fatalf("expected errors.Is(err, ErrQuoteIneligible), got %v", err)
		}
	})
}

func TestValidateExecutableQuoteWithFeedMode_BoundaryAndEdgeCases(t *testing.T) {
	now := time.Now()
	nowStr := now.UTC().Format(time.RFC3339)

	t.Run("Rejects nil quote with ErrQuoteNotFound", func(t *testing.T) {
		err := ValidateExecutableQuoteWithFeedMode(nil, now, dto.FeedModeLive, false)
		if err == nil {
			t.Fatal("expected nil quote to be rejected")
		}
		if !errors.Is(err, ErrQuoteNotFound) {
			t.Fatalf("expected errors.Is(err, ErrQuoteNotFound), got %v", err)
		}
	})

	t.Run("Rejects zero and negative prices in both LIVE and SYNTHETIC modes", func(t *testing.T) {
		for _, price := range []int64{0, -1, -50000} {
			qLive := &dto.QuoteResponse{Symbol: "INFY", PricePaise: price, UpdatedAt: nowStr, Source: "angelone_live"}
			if err := ValidateExecutableQuoteWithFeedMode(qLive, now, dto.FeedModeLive, false); err == nil {
				t.Fatalf("expected price %d to be rejected in LIVE mode", price)
			}

			qSynth := &dto.QuoteResponse{Symbol: "INFY", PricePaise: price, UpdatedAt: nowStr, Source: "synthetic_gbm"}
			if err := ValidateExecutableQuoteWithFeedMode(qSynth, now, dto.FeedModeSynthetic, false); err == nil {
				t.Fatalf("expected price %d to be rejected in SYNTHETIC mode", price)
			}
		}
	})

	t.Run("Rejects malformed and empty timestamps", func(t *testing.T) {
		for _, badTS := range []string{"", "   ", "not-a-timestamp", "2026/09/24 12:00:00"} {
			q := &dto.QuoteResponse{Symbol: "INFY", PricePaise: 150000, UpdatedAt: badTS, Source: "angelone_live"}
			if err := ValidateExecutableQuoteWithFeedMode(q, now, dto.FeedModeLive, false); err == nil {
				t.Fatalf("expected bad timestamp %q to be rejected", badTS)
			}
		}
	})

	t.Run("Timestamp clock skew tolerance at boundary", func(t *testing.T) {
		// +4s in future -> within 5s skew tolerance -> accepted
		q4s := &dto.QuoteResponse{Symbol: "INFY", PricePaise: 150000, UpdatedAt: now.Add(4 * time.Second).UTC().Format(time.RFC3339), Source: "angelone_live"}
		if err := ValidateExecutableQuoteWithFeedMode(q4s, now, dto.FeedModeLive, false); err != nil {
			t.Fatalf("expected 4s future quote to pass skew tolerance, got: %v", err)
		}

		// +10s in future -> exceeds 5s skew tolerance -> rejected
		q10s := &dto.QuoteResponse{Symbol: "INFY", PricePaise: 150000, UpdatedAt: now.Add(10 * time.Second).UTC().Format(time.RFC3339), Source: "angelone_live"}
		if err := ValidateExecutableQuoteWithFeedMode(q10s, now, dto.FeedModeLive, false); err == nil {
			t.Fatal("expected 10s future quote to be rejected")
		}
	})

	t.Run("Staleness age at 2 minute boundary", func(t *testing.T) {
		// 119s old -> valid
		q119 := &dto.QuoteResponse{Symbol: "INFY", PricePaise: 150000, UpdatedAt: now.Add(-119 * time.Second).UTC().Format(time.RFC3339), Source: "angelone_live"}
		if err := ValidateExecutableQuoteWithFeedMode(q119, now, dto.FeedModeLive, false); err != nil {
			t.Fatalf("expected 119s old quote to be accepted, got: %v", err)
		}

		// 121s old -> stale
		q121 := &dto.QuoteResponse{Symbol: "INFY", PricePaise: 150000, UpdatedAt: now.Add(-121 * time.Second).UTC().Format(time.RFC3339), Source: "angelone_live"}
		err := ValidateExecutableQuoteWithFeedMode(q121, now, dto.FeedModeLive, false)
		if err == nil {
			t.Fatal("expected 121s old quote to be rejected")
		}
		if !errors.Is(err, ErrQuoteStale) {
			t.Fatalf("expected ErrQuoteStale, got: %v", err)
		}
	})

	t.Run("Rejects unknown or arbitrary quote sources in all modes", func(t *testing.T) {
		unknownSources := []string{"random_mock", "mock_broker", "yahoo_finance", "crypto_feed", "UNKNOWN"}
		for _, src := range unknownSources {
			q := &dto.QuoteResponse{Symbol: "INFY", PricePaise: 150000, UpdatedAt: nowStr, Source: src}

			// In LIVE mode:
			if err := ValidateExecutableQuoteWithFeedMode(q, now, dto.FeedModeLive, false); !errors.Is(err, ErrQuoteIneligible) {
				t.Fatalf("expected ErrQuoteIneligible for unknown source %q in LIVE mode, got: %v", src, err)
			}

			// In SYNTHETIC mode without allowSeeded:
			if err := ValidateExecutableQuoteWithFeedMode(q, now, dto.FeedModeSynthetic, false); !errors.Is(err, ErrQuoteIneligible) {
				t.Fatalf("expected ErrQuoteIneligible for unknown source %q in SYNTHETIC mode, got: %v", src, err)
			}

			// In UNAVAILABLE mode:
			if err := ValidateExecutableQuoteWithFeedMode(q, now, dto.FeedModeUnavailable, false); !errors.Is(err, ErrQuoteUnavailable) {
				t.Fatalf("expected ErrQuoteUnavailable for source %q in UNAVAILABLE mode, got: %v", src, err)
			}
		}
	})

	t.Run("Normalizes feed mode case-insensitively", func(t *testing.T) {
		qLive := &dto.QuoteResponse{Symbol: "INFY", PricePaise: 150000, UpdatedAt: nowStr, Source: "angelone_live"}
		if err := ValidateExecutableQuoteWithFeedMode(qLive, now, dto.FeedMode("live"), false); err != nil {
			t.Fatalf("expected lowercase 'live' to be accepted, got: %v", err)
		}
		if err := ValidateExecutableQuoteWithFeedMode(qLive, now, dto.FeedMode("LIVE"), false); err != nil {
			t.Fatalf("expected uppercase 'LIVE' to be accepted, got: %v", err)
		}

		qSynth := &dto.QuoteResponse{Symbol: "INFY", PricePaise: 150000, UpdatedAt: nowStr, Source: "synthetic_gbm"}
		if err := ValidateExecutableQuoteWithFeedMode(qSynth, now, dto.FeedMode("synthetic"), false); err != nil {
			t.Fatalf("expected lowercase 'synthetic' to be accepted, got: %v", err)
		}
		if err := ValidateExecutableQuoteWithFeedMode(qSynth, now, dto.FeedMode("SYNTHETIC"), false); err != nil {
			t.Fatalf("expected uppercase 'SYNTHETIC' to be accepted, got: %v", err)
		}
	})
}

func TestService_InstrumentFinderValidation(t *testing.T) {
	svc := &Service{}
	svc.SetInstrumentFinder(func(symbol string) (bool, error) {
		if symbol == "VALID_SYM" {
			return true, nil
		}
		return false, nil
	})

	t.Run("Rejects unknown instrument in CurrentQuote", func(t *testing.T) {
		_, err := svc.CurrentQuote("UNKNOWN_SYM")
		if err == nil {
			t.Fatal("expected error for unknown symbol in CurrentQuote")
		}
		if !errors.Is(err, ErrInstrumentNotFound) {
			t.Fatalf("expected errors.Is(err, ErrInstrumentNotFound), got %v", err)
		}
	})

	t.Run("Rejects unknown instrument in CachedQuote", func(t *testing.T) {
		_, err := svc.CachedQuote("UNKNOWN_SYM")
		if err == nil {
			t.Fatal("expected error for unknown symbol in CachedQuote")
		}
		if !errors.Is(err, ErrInstrumentNotFound) {
			t.Fatalf("expected errors.Is(err, ErrInstrumentNotFound), got %v", err)
		}
	})

	t.Run("Rejects unknown instrument in HistoricalQuotes", func(t *testing.T) {
		_, err := svc.HistoricalQuotes("UNKNOWN_SYM", 50)
		if err == nil {
			t.Fatal("expected error for unknown symbol in HistoricalQuotes")
		}
		if !errors.Is(err, ErrInstrumentNotFound) {
			t.Fatalf("expected errors.Is(err, ErrInstrumentNotFound), got %v", err)
		}
	})
}
