// Package accountchanges sends private invalidation hints after financial commits.
// Redis revisions and periodic client reconciliation recover missed Pub/Sub hints.
package accountchanges

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	authMiddleware "github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/middleware"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

const channelPrefix = "account:changed:"
const revisionPrefix = "account:revision:"
const maxListeners = 1024
const maxPerUser = 4

var current atomic.Pointer[Hub]

type Hub struct {
	ctx       context.Context
	cancel    context.CancelFunc
	client    *redis.Client
	queue     chan string
	mu        sync.Mutex
	listeners map[string]map[chan string]struct{}
	count     int
}

// Configure owns one Pub/Sub connection per API process, never one per user.
func Configure(ctx context.Context, client *redis.Client) *Hub {
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithCancel(ctx)
	h := &Hub{ctx: ctx, cancel: cancel, client: client, queue: make(chan string, 1024), listeners: make(map[string]map[chan string]struct{})}
	if old := current.Swap(h); old != nil {
		old.cancel()
	}
	go h.publish()
	go h.subscribe()
	return h
}

// Notify must be called only after a successful commit. Delivery cannot block
// trading or make a committed transaction appear to have failed.
func Notify(userID string) {
	h := current.Load()
	if h == nil || h.ctx.Err() != nil {
		return
	}
	if _, err := uuid.Parse(userID); err != nil {
		return
	}
	select {
	case h.queue <- userID:
	default: // The client's periodic reconciliation covers a saturated queue.
	}
}

func (h *Hub) publish() {
	const script = "redis.call('SET', KEYS[1], ARGV[1], 'EX', 604800); return redis.call('PUBLISH', ARGV[2], ARGV[1])"
	for {
		select {
		case <-h.ctx.Done():
			return
		case userID := <-h.queue:
			ctx, cancel := context.WithTimeout(h.ctx, time.Second)
			err := h.client.Eval(ctx, script, []string{revisionPrefix + userID}, uuid.NewString(), channelPrefix+userID).Err()
			cancel()
			if err != nil && h.ctx.Err() == nil {
				log.Printf("account notification unavailable: %v", err)
			}
		}
	}
}

func (h *Hub) subscribe() {
	pubsub := h.client.PSubscribe(h.ctx, channelPrefix+"*")
	defer pubsub.Close()
	go func() {
		<-h.ctx.Done()
		pubsub.Close()
	}()
	for {
		msg, err := pubsub.ReceiveMessage(h.ctx)
		if err != nil {
			if h.ctx.Err() != nil {
				return
			}
			select {
			case <-h.ctx.Done():
				return
			case <-time.After(time.Second):
				continue
			}
		}
		userID := strings.TrimPrefix(msg.Channel, channelPrefix)
		if _, err := uuid.Parse(msg.Payload); err != nil {
			continue
		}
		h.mu.Lock()
		for listener := range h.listeners[userID] {
			select {
			case listener <- msg.Payload:
			default: // Coalesce to the latest revision.
				select {
				case <-listener:
				default:
				}
				select {
				case listener <- msg.Payload:
				default:
				}
			}
		}
		h.mu.Unlock()
	}
}

func (h *Hub) listen(userID string) (chan string, func(), bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.count >= maxListeners || len(h.listeners[userID]) >= maxPerUser {
		return nil, nil, false
	}
	listener := make(chan string, 1)
	if h.listeners[userID] == nil {
		h.listeners[userID] = make(map[chan string]struct{})
	}
	h.listeners[userID][listener] = struct{}{}
	h.count++
	remove := func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		if _, exists := h.listeners[userID][listener]; exists {
			delete(h.listeners[userID], listener)
			h.count--
			if len(h.listeners[userID]) == 0 {
				delete(h.listeners, userID)
			}
		}
	}
	return listener, remove, true
}

func (h *Hub) revision(ctx context.Context, userID string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	value, err := h.client.Get(ctx, revisionPrefix+userID).Result()
	if err == redis.Nil {
		return "0", nil
	}
	return value, err
}

// Events is JWT protected by the router. No caller-supplied identity is used.
// A 45-second session fits the API write deadline and bounded Vercel streaming.
func (h *Hub) Events(c *gin.Context) {
	userID := c.GetString(authMiddleware.UserIDKey)
	if _, err := uuid.Parse(userID); err != nil {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	listener, remove, ok := h.listen(userID)
	if !ok {
		c.Header("Retry-After", "30")
		c.AbortWithStatus(http.StatusTooManyRequests)
		return
	}
	defer remove()
	revision, err := h.revision(c.Request.Context(), userID)
	if err != nil {
		c.AbortWithStatus(http.StatusServiceUnavailable)
		return
	}
	c.Header("Content-Type", "text/event-stream; charset=utf-8")
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Accel-Buffering", "no")
	c.Header("X-Content-Type-Options", "nosniff")
	write := func(kind, revision string) bool {
		data, _ := json.Marshal(struct {
			Kind     string `json:"kind"`
			Revision string `json:"revision"`
		}{kind, revision})
		if _, err := c.Writer.Write(append(append([]byte("data: "), data...), '\n', '\n')); err != nil {
			return false
		}
		c.Writer.Flush()
		return true
	}
	if !write("ready", revision) {
		return
	}
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()
	lifetime := time.NewTimer(45 * time.Second)
	defer lifetime.Stop()
	for {
		select {
		case <-c.Request.Context().Done():
			return
		case <-h.ctx.Done():
			return
		case <-lifetime.C:
			return
		case next := <-listener:
			revision = next
			if !write("change", revision) {
				return
			}
		case <-heartbeat.C:
			next, err := h.revision(c.Request.Context(), userID)
			if err != nil {
				write("unavailable", revision)
				return
			}
			kind := "heartbeat"
			if next != revision {
				kind = "change"
			}
			revision = next
			if !write(kind, revision) {
				return
			}
		}
	}
}
