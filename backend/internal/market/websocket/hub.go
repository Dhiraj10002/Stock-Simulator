package websocket

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"time"

	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/logger"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

// One Redis subscription per handler/process while browsers are connected.
// Membership and publication share a lock; slow clients never block fanout.
type quoteHub struct {
	mu      sync.Mutex
	market  *marketService.Service
	stream  *redis.PubSub
	clients map[*clientConn]context.CancelFunc
	symbols map[string]map[*clientConn]struct{}
}

func newQuoteHub(market *marketService.Service) *quoteHub {
	return &quoteHub{market: market, clients: make(map[*clientConn]context.CancelFunc), symbols: make(map[string]map[*clientConn]struct{})}
}

func (h *quoteHub) add(client *clientConn, cancel context.CancelFunc) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[client] = cancel
	if h.stream == nil {
		h.stream = h.market.SubscribeQuotes(context.Background())
		go h.run(h.stream)
	}
}

func (h *quoteHub) targets(client *clientConn, targets map[string]struct{}) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for symbol, members := range h.symbols {
		if _, keep := targets[symbol]; !keep {
			delete(members, client)
		}
		if len(members) == 0 {
			delete(h.symbols, symbol)
		}
	}
	for symbol := range targets {
		if h.symbols[symbol] == nil {
			h.symbols[symbol] = make(map[*clientConn]struct{})
		}
		h.symbols[symbol][client] = struct{}{}
	}
}

func (h *quoteHub) remove(client *clientConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, client)
	for symbol, members := range h.symbols {
		delete(members, client)
		if len(members) == 0 {
			delete(h.symbols, symbol)
		}
	}
	if len(h.clients) == 0 && h.stream != nil {
		_ = h.stream.Close()
		h.stream = nil
	}
}

func (h *quoteHub) run(stream *redis.PubSub) {
	defer func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		// Never tear down a newer subscription when the final browser reconnects.
		if h.stream != stream {
			return
		}
		_ = stream.Close()
		h.stream = nil
		for _, cancel := range h.clients {
			cancel()
		}
	}()
	for message := range stream.Channel() {
		h.publish(stream, message.Payload)
	}
}

func (h *quoteHub) publish(stream *redis.PubSub, payload string) {
	// Decode each provider event once for all browsers; no per-client Redis/JSON work.
	var wire struct {
		marketDTO.QuoteResponse
		Type                  string `json:"type"`
		FeedProvider          string `json:"feed_provider"`
		FeedState             string `json:"feed_state"`
		IsSynthetic           bool   `json:"is_synthetic"`
		LastTick              string `json:"last_tick"`
		SubscribedTokensCount int    `json:"subscribed_tokens_count"`
	}
	if json.Unmarshal([]byte(payload), &wire) != nil {
		return
	}
	ev := event{Type: "quote", Quote: &wire.QuoteResponse}
	symbol := strings.ToUpper(wire.Symbol)
	if wire.Type == "feed_status" {
		symbol = ""
		ev = event{Type: "feed_status", FeedStatus: &marketDTO.FeedStatusResponse{FeedProvider: wire.FeedProvider, FeedState: wire.FeedState, IsSynthetic: wire.IsSynthetic, LastTick: wire.LastTick, UpdatedAt: wire.UpdatedAt, SubscribedTokensCount: wire.SubscribedTokensCount}}
	} else if symbol == "" || h.market.ValidateStreamQuote(ev.Quote) != nil {
		return
	}
	if ev.Quote != nil && ev.Quote.WorkerReceivedAtMS > 0 {
		ev.ServerReceivedAtMS = time.Now().UnixMilli()
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.stream != stream {
		return
	}
	if symbol == "" {
		for client, cancel := range h.clients {
			h.deliver(client, cancel, ev)
		}
	} else {
		for client := range h.symbols[symbol] {
			h.deliver(client, h.clients[client], ev)
		}
	}
}

func (h *quoteHub) deliver(client *clientConn, cancel context.CancelFunc, ev event) {
	select {
	case client.send <- ev:
	default:
		// The same 256-message bound applies to shared fanout and direct snapshots.
		if !client.slowDropped {
			client.slowDropped = true
			logger.Warn("websocket: slow client dropped by shared fanout", logger.RequestID(client.reqID), zap.String("client_ip", client.clientIP))
		}
		if cancel != nil {
			cancel()
		}
	}
}
