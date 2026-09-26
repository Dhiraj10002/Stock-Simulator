package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/logger"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	ws "github.com/gorilla/websocket"
	"go.uber.org/zap"
)

const (
	// WriteWait is the maximum duration allowed to write a message to the peer.
	WriteWait = 10 * time.Second

	// PongWait is the maximum duration allowed to read the next pong message from the peer.
	PongWait = 60 * time.Second

	// PingPeriod is the interval between pings sent to the peer. Must be less than PongWait.
	PingPeriod = (PongWait * 9) / 10

	// MaxMessageSize is the maximum size in bytes of an incoming command message.
	MaxMessageSize = 4096

	// SendBufferSize is the bounded channel buffer size for outgoing messages.
	// If a client's buffer exceeds this (e.g. stalled TCP/slow consumer), the client is dropped.
	SendBufferSize = 256

	// MaxSubscriptionsPerClient defines the ceiling of active symbol subscriptions per connection.
	MaxSubscriptionsPerClient = 100
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

type clientConn struct {
	conn     *ws.Conn
	send     chan event
	reqID    string
	clientIP string
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

	reqID := c.GetString("request_id")
	if reqID == "" {
		reqID = c.GetHeader("X-Request-ID")
		if reqID == "" {
			reqID = uuid.NewString()
		}
	}

	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	client := &clientConn{
		conn:     conn,
		send:     make(chan event, SendBufferSize),
		reqID:    reqID,
		clientIP: c.ClientIP(),
	}

	commands := make(chan command, 16)

	// Start separate read and write pumps to decouple network I/O from Redis message processing
	go h.readPump(ctx, cancel, client, commands)
	go h.writePump(ctx, cancel, client)

	// Helper for bounded non-blocking event queuing.
	// If a client is slow and the bounded SendBufferSize is exceeded, the client is dropped
	// immediately to prevent blocking Redis Pub/Sub or other users.
	enqueueEvent := func(ev event) bool {
		select {
		case client.send <- ev:
			return true
		default:
			logger.Warn("websocket: slow client detected, send buffer full; dropping client to protect server",
				logger.RequestID(client.reqID),
				zap.String("client_ip", client.clientIP),
			)
			cancel()
			return false
		}
	}

	// Send initial authoritative feed status immediately upon connection
	if feedStatus, err := h.market.FeedStatus(ctx); err == nil && feedStatus != nil {
		eventID := fmt.Sprintf("mkt_feed_%d_%s", time.Now().UnixNano(), uuid.NewString()[:8])
		logger.Info("websocket client connected; initial feed status",
			logger.RequestID(reqID),
			logger.MarketEventID(eventID),
			logger.FeedState(feedStatus.FeedState),
			logger.LastTick(feedStatus.LastTick),
			zap.String("client_ip", client.clientIP),
		)
		if !enqueueEvent(event{Type: "feed_status", FeedStatus: feedStatus}) {
			return
		}
	}

	pubsub := h.market.SubscribeQuotes(ctx)
	defer pubsub.Close()

	subscribed := make(map[string]struct{})
	for {
		select {
		case <-ctx.Done():
			return
		case cmd, ok := <-commands:
			if !ok {
				return
			}
			action := strings.ToLower(strings.TrimSpace(cmd.Action))
			switch action {
			case "ping":
				// Application-level heartbeat support: refresh deadline & echo pong
				_ = client.conn.SetReadDeadline(time.Now().Add(PongWait))
				if !enqueueEvent(event{Type: "pong"}) {
					return
				}
			case "subscribe":
				symbols := normalizeSymbols(cmd.Symbols)
				eventID := fmt.Sprintf("mkt_cmd_%d_%s", time.Now().UnixNano(), uuid.NewString()[:8])
				logger.Info("websocket subscription command processed",
					logger.RequestID(reqID),
					logger.MarketEventID(eventID),
					zap.String("action", cmd.Action),
					zap.Strings("symbols", symbols),
					zap.String("client_ip", client.clientIP),
				)
				excess := false
				for _, symbol := range symbols {
					if _, exists := subscribed[symbol]; !exists && len(subscribed) >= MaxSubscriptionsPerClient {
						excess = true
						continue
					}
					subscribed[symbol] = struct{}{}
					if q, err := h.market.CurrentQuote(symbol); err == nil && q != nil {
						if !enqueueEvent(event{Type: "quote", Quote: q}) {
							return
						}
					}
				}
				if excess {
					if !enqueueEvent(event{
						Type:    "error",
						Message: fmt.Sprintf("subscription limit of %d symbols exceeded; excess symbols ignored", MaxSubscriptionsPerClient),
					}) {
						return
					}
				}
				if !enqueueEvent(event{Type: "subscribed", Symbols: sortedSymbols(subscribed)}) {
					return
				}
			case "unsubscribe":
				symbols := normalizeSymbols(cmd.Symbols)
				for _, symbol := range symbols {
					delete(subscribed, symbol)
				}
				if !enqueueEvent(event{Type: "unsubscribed", Symbols: sortedSymbols(subscribed)}) {
					return
				}
			default:
				if !enqueueEvent(event{Type: "error", Message: "action must be subscribe, unsubscribe, or ping"}) {
					return
				}
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
					eventID := fmt.Sprintf("mkt_feed_%d_%s", time.Now().UnixNano(), uuid.NewString()[:8])
					logger.Info("websocket streaming feed status event",
						logger.RequestID(reqID),
						logger.MarketEventID(eventID),
						logger.FeedState(fs.FeedState),
						logger.LastTick(fs.LastTick),
					)
					if !enqueueEvent(event{Type: "feed_status", FeedStatus: &fs}) {
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
			if !enqueueEvent(event{Type: "quote", Quote: &quote}) {
				return
			}
		}
	}
}

// readPump pumps messages from the websocket connection to the commands channel.
// Enforces MaxMessageSize, PongWait read deadline, and ping/pong heartbeats.
func (h *Handler) readPump(ctx context.Context, cancel context.CancelFunc, client *clientConn, commands chan<- command) {
	defer func() {
		cancel()
	}()

	client.conn.SetReadLimit(MaxMessageSize)
	_ = client.conn.SetReadDeadline(time.Now().Add(PongWait))
	client.conn.SetPongHandler(func(string) error {
		_ = client.conn.SetReadDeadline(time.Now().Add(PongWait))
		return nil
	})

	for {
		var cmd command
		if err := client.conn.ReadJSON(&cmd); err != nil {
			return
		}
		select {
		case <-ctx.Done():
			return
		case commands <- cmd:
		}
	}
}

// writePump pumps messages from the client.send channel to the websocket connection.
// Enforces WriteWait deadline for every write, and periodically sends PingMessage frames.
func (h *Handler) writePump(ctx context.Context, cancel context.CancelFunc, client *clientConn) {
	ticker := time.NewTicker(PingPeriod)
	defer func() {
		ticker.Stop()
		cancel()
	}()

	for {
		select {
		case <-ctx.Done():
			_ = client.conn.SetWriteDeadline(time.Now().Add(WriteWait))
			_ = client.conn.WriteMessage(ws.CloseMessage, ws.FormatCloseMessage(ws.CloseNormalClosure, "server shutdown or connection closed"))
			return
		case <-ticker.C:
			_ = client.conn.SetWriteDeadline(time.Now().Add(WriteWait))
			if err := client.conn.WriteMessage(ws.PingMessage, nil); err != nil {
				return
			}
		case ev, ok := <-client.send:
			_ = client.conn.SetWriteDeadline(time.Now().Add(WriteWait))
			if !ok {
				_ = client.conn.WriteMessage(ws.CloseMessage, ws.FormatCloseMessage(ws.CloseNormalClosure, ""))
				return
			}
			if err := client.conn.WriteJSON(ev); err != nil {
				return
			}
		}
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
