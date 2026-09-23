package websocket

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strings"

	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/gin-gonic/gin"
	ws "github.com/gorilla/websocket"
)

type Handler struct {
	market   *marketService.Service
	upgrader ws.Upgrader
}

type command struct {
	Action  string   `json:"action"`
	Symbols []string `json:"symbols"`
}

type event struct {
	Type       string                        `json:"type"`
	Symbols    []string                      `json:"symbols,omitempty"`
	Quote      *marketDTO.QuoteResponse      `json:"quote,omitempty"`
	FeedStatus *marketDTO.FeedStatusResponse `json:"feed_status,omitempty"`
	Message    string                        `json:"message,omitempty"`
}

// New creates a new WebSocket Handler with origin restrictions.
// In production (isProd=true), origins are strictly checked against allowedOrigins.
// Empty origins or wildcard "*" in production are rejected to prevent CSWSH attacks.
func New(market *marketService.Service, allowedOrigins string, isProd ...bool) *Handler {
	prod := false
	if len(isProd) > 0 {
		prod = isProd[0]
	}

	origins := make(map[string]struct{})
	allowAnyOrigin := false

	trimmed := strings.TrimSpace(allowedOrigins)
	if trimmed == "*" {
		if prod {
			log.Println("WS: wildcard origin '*' requested in production; rejecting wildcard and requiring explicit origins")
			allowAnyOrigin = false
		} else {
			allowAnyOrigin = true
		}
	} else if trimmed == "" {
		if prod {
			log.Println("WS: no allowed origins configured in production; cross-origin WebSocket connections will be rejected")
			allowAnyOrigin = false
		} else {
			// In dev without explicit CORS, allow localhost:3000
			origins["http://localhost:3000"] = struct{}{}
			origins["http://127.0.0.1:3000"] = struct{}{}
		}
	} else {
		for _, origin := range strings.Split(trimmed, ",") {
			origin = strings.TrimSpace(origin)
			if origin == "*" {
				if prod {
					log.Println("WS: wildcard origin '*' ignored in production")
					continue
				}
				allowAnyOrigin = true
				break
			}
			if origin != "" {
				norm := strings.TrimRight(strings.ToLower(origin), "/")
				origins[norm] = struct{}{}
			}
		}
	}

	return &Handler{
		market: market,
		upgrader: ws.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				if allowAnyOrigin {
					return true
				}
				origin := r.Header.Get("Origin")
				if origin == "" {
					// In browsers, WebSocket handshakes ALWAYS include an Origin header.
					// Allow empty Origin only in non-production environments (e.g. backend unit/integration tests).
					return !prod
				}
				normOrigin := strings.TrimRight(strings.ToLower(strings.TrimSpace(origin)), "/")
				_, ok := origins[normOrigin]
				if !ok {
					log.Printf("WS: rejected connection from unauthorized origin: %q", origin)
				}
				return ok
			},
		},
	}
}

// Upgrader returns the configured Gorilla WebSocket Upgrader (useful for testing CheckOrigin).
func (h *Handler) Upgrader() *ws.Upgrader {
	return &h.upgrader
}

func (h *Handler) Serve(c *gin.Context) {
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	conn.SetReadLimit(4096)

	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()
	pubsub := h.market.SubscribeQuotes(ctx)
	defer pubsub.Close()

	// Send initial authoritative feed status immediately upon connection
	if feedStatus, err := h.market.FeedStatus(ctx); err == nil && feedStatus != nil {
		_ = conn.WriteJSON(event{Type: "feed_status", FeedStatus: feedStatus})
	}

	commands := make(chan command)
	done := make(chan struct{})
	go h.readCommands(conn, commands, done)

	subscribed := make(map[string]struct{})
	for {
		select {
		case <-done:
			return
		case cmd := <-commands:
			symbols := normalizeSymbols(cmd.Symbols)
			switch strings.ToLower(cmd.Action) {
			case "subscribe":
				for _, symbol := range symbols {
					subscribed[symbol] = struct{}{}
					if q, err := h.market.CurrentQuote(symbol); err == nil && q != nil {
						_ = conn.WriteJSON(event{Type: "quote", Quote: q})
					}
				}
				_ = conn.WriteJSON(event{Type: "subscribed", Symbols: sortedSymbols(subscribed)})
			case "unsubscribe":
				for _, symbol := range symbols {
					delete(subscribed, symbol)
				}
				_ = conn.WriteJSON(event{Type: "unsubscribed", Symbols: sortedSymbols(subscribed)})
			default:
				_ = conn.WriteJSON(event{Type: "error", Message: "action must be subscribe or unsubscribe"})
			}
		case message, ok := <-pubsub.Channel():
			if !ok {
				return
			}
			var raw map[string]interface{}
			if err := json.Unmarshal([]byte(message.Payload), &raw); err != nil {
				continue
			}
			if msgType, ok := raw["type"].(string); ok && msgType == "feed_status" {
				var fs marketDTO.FeedStatusResponse
				if err := json.Unmarshal([]byte(message.Payload), &fs); err == nil {
					if err := conn.WriteJSON(event{Type: "feed_status", FeedStatus: &fs}); err != nil {
						return
					}
				}
				continue
			}

			var quote marketDTO.QuoteResponse
			if err := json.Unmarshal([]byte(message.Payload), &quote); err != nil || quote.Symbol == "" {
				continue
			}
			if _, ok := subscribed[strings.ToUpper(quote.Symbol)]; !ok {
				continue
			}
			if err := conn.WriteJSON(event{Type: "quote", Quote: &quote}); err != nil {
				return
			}
		}
	}
}

func (h *Handler) readCommands(conn *ws.Conn, commands chan<- command, done chan<- struct{}) {
	defer close(done)
	for {
		var cmd command
		if err := conn.ReadJSON(&cmd); err != nil {
			return
		}
		commands <- cmd
	}
}

func normalizeSymbols(symbols []string) []string {
	result := make([]string, 0, len(symbols))
	for _, symbol := range symbols {
		if value := strings.ToUpper(strings.TrimSpace(symbol)); value != "" {
			result = append(result, value)
		}
	}
	return result
}

func sortedSymbols(symbols map[string]struct{}) []string {
	result := make([]string, 0, len(symbols))
	for symbol := range symbols {
		result = append(result, symbol)
	}
	sort.Strings(result)
	return result
}
