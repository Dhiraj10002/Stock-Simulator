package accountchanges

import (
	"context"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

func TestListenerLimitsAndCleanup(t *testing.T) {
	h := &Hub{listeners: make(map[string]map[chan string]struct{})}
	user := uuid.NewString()
	for i := 0; i < maxPerUser; i++ {
		_, remove, ok := h.listen(user)
		if !ok {
			t.Fatal("listener rejected before per-user limit")
		}
		t.Cleanup(remove)
	}
	if _, _, ok := h.listen(user); ok {
		t.Fatal("per-user limit not enforced")
	}
	_, remove, ok := h.listen(uuid.NewString())
	if !ok {
		t.Fatal("one user's limit blocked a different user")
	}
	before := h.count
	remove()
	remove()
	if h.count != before-1 {
		t.Fatal("cleanup must be idempotent")
	}
	h.count = maxListeners
	if _, _, ok := h.listen(uuid.NewString()); ok {
		t.Fatal("global limit not enforced")
	}
	// Restore the count so registered cleanup callbacks can complete normally.
	h.count = maxPerUser
}

func TestRedisRevisionAndPrivateFanout(t *testing.T) {
	url := os.Getenv("TEST_REDIS_URL")
	if url == "" {
		t.Skip("TEST_REDIS_URL is required for Redis integration")
	}
	opts, err := redis.ParseURL(url)
	if err != nil {
		t.Fatal(err)
	}
	client := redis.NewClient(opts)
	ctx, cancel := context.WithCancel(context.Background())
	h := Configure(ctx, client)
	defer client.Close()
	defer cancel()
	user, other := uuid.NewString(), uuid.NewString()
	defer client.Del(context.Background(), revisionPrefix+user, revisionPrefix+other)
	listener, remove, ok := h.listen(user)
	if !ok {
		t.Fatal("failed to subscribe")
	}
	defer remove()
	otherListener, removeOther, _ := h.listen(other)
	defer removeOther()
	// Confirm the shared Pub/Sub connection before testing immediate delivery.
	deadline := time.Now().Add(5 * time.Second)
	for {
		channels, err := client.PubSubNumPat(ctx).Result()
		if err != nil {
			t.Fatal(err)
		}
		if channels > 0 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("Pub/Sub did not subscribe")
		}
		time.Sleep(10 * time.Millisecond)
	}
	Notify(user)
	select {
	case revision := <-listener:
		stored, err := h.revision(ctx, user)
		if err != nil || stored != revision {
			t.Fatalf("published hint must match stored revision: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("no committed account hint received")
	}
	select {
	case <-otherListener:
		t.Fatal("account hint leaked across users")
	default:
	}
	// Concurrent fanout/removal must be safe; checked under go test -race.
	var wg sync.WaitGroup
	for i := 0; i < 40; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, stop, ok := h.listen(uuid.NewString())
			if ok {
				stop()
			}
			Notify(user)
		}()
	}
	wg.Wait()
	cancel()
	Notify(user) // A stopped hub must not accept more work.
}
