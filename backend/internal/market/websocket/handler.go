package websocket

import (
	"context"
	"encoding/json"
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
	Type    string                   `json:"type"`
	Symbols []string                 `json:"symbols,omitempty"`
	Quote   *marketDTO.QuoteResponse `json:"quote,omitempty"`
	Message string                   `json:"message,omitempty"`
}

func New(market *marketService.Service) *Handler {
	return &Handler{
		market: market,
		upgrader: ws.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			// This is intentionally permissive for local development. Restrict
			// origins to the frontend host before deploying publicly.
			CheckOrigin: func(_ *http.Request) bool { return true },
		},
	}
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
			var quote marketDTO.QuoteResponse
			if json.Unmarshal([]byte(message.Payload), &quote) != nil {
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
