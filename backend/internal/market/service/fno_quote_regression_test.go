package service

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/redis/go-redis/v9"
)

// Intercept Redis commands in memory: no shared Redis or broker is touched.
type quoteFixture struct {
	mu     sync.Mutex
	quotes map[string]map[string]string
	state  string
	demand map[string]bool
}

func (f *quoteFixture) DialHook(next redis.DialHook) redis.DialHook { return next }
func (f *quoteFixture) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return func(ctx context.Context, commands []redis.Cmder) error {
		for _, cmd := range commands {
			if err := f.ProcessHook(nil)(ctx, cmd); err != nil {
				return err
			}
		}
		return nil
	}
}
func (f *quoteFixture) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error {
		f.mu.Lock()
		defer f.mu.Unlock()
		switch c := cmd.(type) {
		case *redis.MapStringStringCmd:
			c.SetVal(f.quotes[c.Args()[1].(string)])
		case *redis.StringCmd:
			c.SetVal(f.state)
		case *redis.IntCmd:
			if c.Name() == "zadd" {
				for i := 3; i < len(c.Args()); i += 2 {
					f.demand[c.Args()[i].(string)] = true
				}
			}
			c.SetVal(1)
		default:
			return errors.New("unexpected Redis command")
		}
		return nil
	}
}
func TestRegressionFNOQuoteResolution(t *testing.T) {
	symbol := "TCS" + strings.ToUpper(time.Now().AddDate(0, 0, 7).Format("02Jan06")) + "1940CE"
	f := &quoteFixture{quotes: map[string]map[string]string{}, state: "LIVE", demand: map[string]bool{}}
	client := redis.NewClient(&redis.Options{Addr: "unused"})
	client.AddHook(f)
	defer client.Close()
	s := &Service{client: client, timeout: time.Second}
	s.SetFeedMode(dto.FeedModeLive)
	s.SetInstrumentFinder(func(string) (bool, error) { return true, nil })
	if _, err := s.ExecutableQuote(symbol); !errors.Is(err, ErrQuoteNotFound) {
		t.Fatalf("missing live option was not rejected: %v", err)
	}
	if !f.demand[symbol] {
		t.Fatal("missing option did not request worker subscription")
	}
	if _, err := s.DerivedFNOQuote(symbol); !errors.Is(err, ErrQuoteIneligible) {
		t.Fatal("live derivation allowed")
	}
	stamp := time.Now().Add(-time.Second).UTC().Format(time.RFC3339)
	f.quotes[quoteKey(symbol)] = map[string]string{"price_paise": "740", "source": "angelone_live", "updated_at": stamp}
	for _, read := range []func(string) (*dto.QuoteResponse, error){s.CurrentQuote, s.CachedQuote, s.ExecutableQuote} {
		q, err := read(symbol)
		if err != nil || q.PricePaise != 740 || q.Source != "angelone_live" {
			t.Fatalf("broker quote not shared: %v %v", q, err)
		}
	}
	batch := s.BatchQuotes([]string{symbol, symbol, "TCS_MISSING"})
	if len(batch) != 1 || batch[symbol].PricePaise != 740 {
		t.Fatal("batch result", batch)
	}
	f.quotes[quoteKey(symbol)]["source"] = "fno_engine"
	if _, err := s.CurrentQuote(symbol); !errors.Is(err, ErrQuoteIneligible) {
		t.Fatal("synthetic price accepted as live")
	}
	delete(f.quotes, quoteKey(symbol))
	s.SetFeedMode(dto.FeedModeSynthetic)
	if _, err := s.CurrentQuote(symbol); err == nil {
		t.Fatal("derived quote without underlying")
	}
	f.quotes[quoteKey("TCS")] = map[string]string{"price_paise": "220000", "source": "synthetic_gbm", "updated_at": stamp}
	q, err := s.CurrentQuote(symbol)
	if err != nil || q.PricePaise <= 0 || q.Source != "fno_engine" || q.UpdatedAt != stamp {
		t.Fatalf("simulation derivation: %v %v", q, err)
	}
	f.quotes[quoteKey("TCS")]["updated_at"] = time.Now().Add(-time.Hour).Format(time.RFC3339)
	if _, err := s.ExecutableQuote(symbol); !errors.Is(err, ErrQuoteStale) {
		t.Fatalf("stale underlying accepted: %v", err)
	}
	f.state = "UNAVAILABLE"
	if _, err := s.ExecutableQuote(symbol); !errors.Is(err, ErrQuoteUnavailable) {
		t.Fatal("unavailable feed accepted")
	}
}
func TestRegressionNoFabricatedQuoteWithoutRedis(t *testing.T) {
	s := &Service{}
	s.SetFeedMode(dto.FeedModeLive)
	if q, err := s.ExecutableQuote("TCS29SEP261940CE"); err == nil || q != nil {
		t.Fatal("fabricated executable quote", q)
	}
}
