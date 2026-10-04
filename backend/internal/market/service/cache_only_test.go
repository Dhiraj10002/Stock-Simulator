package service

import (
	"context"
	"errors"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/testutil"
	"github.com/google/uuid"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestColdDisplayQuotesQueueDemandWithoutWorkerHTTP(t *testing.T) {
	client := testutil.RequireDisposableRedis(t)
	s, err := New(os.Getenv("TEST_REDIS_URL"), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Client().Close()
	s.SetFeedMode(dto.FeedModeLive)
	s.SetInstrumentFinder(func(string) (bool, error) { return true, nil })
	var calls atomic.Int32
	worker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer worker.Close()
	s.SetWorkerURL(worker.URL)
	symbol := "COLD" + strings.ToUpper(uuid.NewString()[:12])
	defer client.ZRem(context.Background(), "market:quote:demand", symbol)
	for _, read := range []func(string) (*dto.QuoteResponse, error){s.CachedQuote, s.RawCachedQuote} {
		q, err := read(symbol)
		if q != nil || !errors.Is(err, ErrQuoteNotFound) {
			t.Fatalf("unexpected cold result: %+v %v", q, err)
		}
	}
	if calls.Load() != 0 {
		t.Fatal("display read contacted worker")
	}
	if _, err := client.ZScore(context.Background(), "market:quote:demand", symbol).Result(); err != nil {
		t.Fatalf("cold demand lost: %v", err)
	}
}
