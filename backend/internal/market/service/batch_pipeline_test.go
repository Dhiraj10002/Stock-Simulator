package service

import (
	"context"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/testutil"
	"github.com/redis/go-redis/v9"
)

type pipelineCounter struct{ commands, pipelines int }

func (c *pipelineCounter) DialHook(next redis.DialHook) redis.DialHook { return next }
func (c *pipelineCounter) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error { c.commands++; return next(ctx, cmd) }
}
func (c *pipelineCounter) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return func(ctx context.Context, commands []redis.Cmder) error { c.pipelines++; return next(ctx, commands) }
}

func TestBatchPipelinesAndPreservesDisplayEligibility(t *testing.T) {
	stamp := time.Now().Add(-time.Second).UTC().Format(time.RFC3339Nano)
	f := &quoteFixture{quotes: map[string]map[string]string{}, state: "LIVE", demand: map[string]bool{}}
	for _, symbol := range []string{"TCS", "ETERNAL", "OLD", "FAKE", "FUTURE", "RETIRED"} {
		f.quotes[quoteKey(symbol)] = map[string]string{"price_paise": "12000", "source": "angelone_live", "updated_at": stamp}
	}
	f.quotes[quoteKey("OLD")]["updated_at"] = time.Now().Add(-time.Hour).UTC().Format(time.RFC3339Nano)
	f.quotes[quoteKey("FAKE")]["source"] = "synthetic_gbm"
	f.quotes[quoteKey("FUTURE")]["updated_at"] = time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano)
	client := redis.NewClient(&redis.Options{Addr: "unused"})
	defer client.Close()
	counter := &pipelineCounter{}
	client.AddHook(counter)
	client.AddHook(f)
	s := &Service{client: client, timeout: time.Second}
	s.SetFeedMode(dto.FeedModeLive)
	s.SetInstrumentFinder(func(symbol string) (bool, error) { return symbol != "RETIRED", nil })
	result := s.BatchQuotes([]string{" tcs ", "TCS", "ZOMATO", "OLD", "FAKE", "FUTURE", "MISSING", "RETIRED"})
	if len(result) != 3 || result["TCS"] == nil || result["ZOMATO"] == nil || result["OLD"] == nil {
		t.Fatalf("display eligibility changed: %v", result)
	}
	if counter.commands != 1 || counter.pipelines != 1 {
		t.Fatalf("round trips: commands=%d pipelines=%d", counter.commands, counter.pipelines)
	}
	if !f.demand["MISSING"] || f.demand["RETIRED"] {
		t.Fatal("cold demand or instrument eligibility lost")
	}
	if _, err := s.ExecutableQuote("OLD"); err == nil {
		t.Fatal("display-only stale price became executable")
	}
	f.state = "UNAVAILABLE"
	if len(s.BatchQuotes([]string{"TCS"})) != 0 {
		t.Fatal("unavailable feed served quotes")
	}
}

// Compare the former eight-worker display reader with the pipeline on disposable
// local Redis. This is a microbenchmark, not an Oracle/Upstash latency claim.
func BenchmarkDisplayBatch(b *testing.B) {
	raw := os.Getenv("TEST_REDIS_URL")
	if raw == "" {
		b.Skip("TEST_REDIS_URL required")
	}
	if err := testutil.ValidateDisposableRedisURL(raw); err != nil {
		b.Fatal(err)
	}
	s, err := New(raw, time.Second)
	if err != nil {
		b.Fatal(err)
	}
	defer s.Client().Close()
	s.SetFeedMode(dto.FeedModeLive)
	ctx := context.Background()
	symbols := make([]string, 100)
	keys := make([]string, 100)
	for i := range symbols {
		symbols[i] = fmt.Sprintf("BENCHSTREAM%03d", i)
		keys[i] = quoteKey(symbols[i])
		if err := s.client.HSet(ctx, keys[i], map[string]any{"price_paise": 10000, "source": "angelone_live", "updated_at": time.Now().UTC().Format(time.RFC3339Nano)}).Err(); err != nil {
			b.Fatal(err)
		}
	}
	defer s.client.Del(ctx, keys...)
	for _, variant := range []string{"legacy-eight-workers", "pipeline"} {
		b.Run(variant, func(b *testing.B) {
			b.ReportAllocs()
			b.ResetTimer()
			for n := 0; n < b.N; n++ {
				if variant == "pipeline" {
					if len(s.BatchQuotes(symbols)) != len(symbols) {
						b.Fatal("missing quotes")
					}
					continue
				}
				jobs := make(chan string, len(symbols))
				var wg sync.WaitGroup
				for i := 0; i < 8; i++ {
					wg.Add(1)
					go func() {
						defer wg.Done()
						for symbol := range jobs {
							if _, err := s.CachedQuote(symbol); err != nil {
								b.Error(err)
							}
						}
					}()
				}
				for _, symbol := range symbols {
					jobs <- symbol
				}
				close(jobs)
				wg.Wait()
			}
		})
	}
}
