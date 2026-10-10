package websocket

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	dto "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	service "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/testutil"
	"github.com/redis/go-redis/v9"
)

func TestHubRoutesOnceAndIsolatesSlowClients(t *testing.T) {
	market := &service.Service{}
	market.SetFeedMode(dto.FeedModeLive)
	hub := newQuoteHub(market)
	generation := &redis.PubSub{}
	hub.stream = generation
	fast := &clientConn{send: make(chan event, 4)}
	slow := &clientConn{send: make(chan event, 1)}
	unrelated := &clientConn{send: make(chan event, 4)}
	slowCtx, slowCancel := context.WithCancel(t.Context())
	defer slowCancel()
	hub.clients[fast] = func() {}
	hub.clients[slow] = slowCancel
	hub.clients[unrelated] = func() {}
	hub.targets(fast, map[string]struct{}{"TCS": {}})
	hub.targets(slow, map[string]struct{}{"TCS": {}})
	hub.targets(unrelated, map[string]struct{}{"INFY": {}})
	q := dto.QuoteResponse{Symbol: "TCS", PricePaise: 100, Source: "angelone_live", UpdatedAt: time.Now().UTC().Format(time.RFC3339Nano), WorkerReceivedAtMS: time.Now().UnixMilli()}
	payload, _ := json.Marshal(q)
	hub.publish(generation, string(payload))
	hub.publish(generation, string(payload))
	if len(fast.send) != 2 || len(unrelated.send) != 0 || slowCtx.Err() == nil {
		t.Fatal("fanout blocked or leaked to unrelated symbol")
	}
	if (<-fast.send).ServerReceivedAtMS == 0 {
		t.Fatal("sampled trace missing receive time")
	}
	hub.targets(fast, map[string]struct{}{})
	hub.publish(generation, string(payload))
	if len(fast.send) != 1 {
		t.Fatal("unsubscribed client received tick")
	}
	hub.publish(&redis.PubSub{}, `{"type":"feed_status","feed_state":"LIVE"}`)
	if len(unrelated.send) != 0 {
		t.Fatal("old generation leaked event")
	}
	hub.publish(generation, `{"type":"feed_status","feed_provider":"angel_one","feed_state":"LIVE"}`)
	if len(unrelated.send) != 1 {
		t.Fatal("feed status did not broadcast")
	}
	for _, bad := range []string{`{`, `{"symbol":"INFY","price_paise":1,"source":"synthetic","updated_at":"2026-01-01T00:00:00Z"}`, `{"symbol":"INFY","price_paise":1,"source":"angelone_live","updated_at":"2026-01-01T00:00:00Z"}`} {
		hub.publish(generation, bad)
	}
	if len(unrelated.send) != 1 {
		t.Fatal("malformed/stale/synthetic tick accepted")
	}
}

func TestHubUsesOneRedisSubscriptionAndReleasesLastClient(t *testing.T) {
	client := testutil.RequireDisposableRedis(t)
	market, err := service.New(os.Getenv("TEST_REDIS_URL"), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer market.Client().Close()
	market.SetFeedMode(dto.FeedModeLive)
	hub := newQuoteHub(market)
	a := &clientConn{send: make(chan event, 4)}
	b := &clientConn{send: make(chan event, 4)}
	hub.add(a, func() {})
	hub.add(b, func() {})
	defer hub.remove(a)
	defer hub.remove(b)
	hub.targets(a, map[string]struct{}{"TCS": {}})
	hub.targets(b, map[string]struct{}{"TCS": {}})
	// Receive acknowledges the subscription without adding a second subscriber.
	deadline := time.Now().Add(time.Second)
	for {
		count, _ := client.PubSubNumSub(t.Context(), "market:updates").Result()
		if count["market:updates"] == 1 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("subscription did not start")
		}
		time.Sleep(time.Millisecond)
	}
	count, err := client.PubSubNumSub(t.Context(), "market:updates").Result()
	if err != nil || count["market:updates"] != 1 {
		t.Fatalf("subscribers=%v err=%v", count, err)
	}
	payload, _ := json.Marshal(dto.QuoteResponse{Symbol: "TCS", PricePaise: 100, Source: "angelone_live", UpdatedAt: time.Now().UTC().Format(time.RFC3339Nano)})
	if err := client.Publish(t.Context(), "market:updates", payload).Err(); err != nil {
		t.Fatal(err)
	}
	for _, c := range []*clientConn{a, b} {
		select {
		case <-c.send:
		case <-time.After(time.Second):
			t.Fatal("shared stream lost quote")
		}
	}
	hub.remove(a)
	hub.mu.Lock()
	open := hub.stream != nil
	hub.mu.Unlock()
	if !open {
		t.Fatal("first disconnect closed shared stream")
	}
	hub.remove(b)
	hub.mu.Lock()
	open = hub.stream != nil
	hub.mu.Unlock()
	if open {
		t.Fatal("last disconnect retained subscription")
	}
	// Reconnect starts a new generation, rather than retaining a dead reader.
	hub.add(a, func() {})
	hub.mu.Lock()
	open = hub.stream != nil
	hub.mu.Unlock()
	if !open {
		t.Fatal("reconnect did not create stream")
	}
}
