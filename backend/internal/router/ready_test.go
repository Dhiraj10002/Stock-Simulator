package router

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/handler"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func startTestRedisServer(t *testing.T, feedState map[string]string) (string, func()) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)

	stop := make(chan struct{})
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				select {
				case <-stop:
					return
				default:
					return
				}
			}
			go func(c net.Conn) {
				defer c.Close()
				buf := make([]byte, 2048)
				for {
					n, err := c.Read(buf)
					if err != nil {
						return
					}
					cmd := string(buf[:n])
					upper := strings.ToUpper(cmd)
					if strings.Contains(upper, "PING") {
						_, _ = c.Write([]byte("+PONG\r\n"))
					} else if strings.Contains(upper, "HGETALL") {
						if len(feedState) == 0 {
							_, _ = c.Write([]byte("*0\r\n"))
						} else {
							var b strings.Builder
							b.WriteString(fmt.Sprintf("*%d\r\n", len(feedState)*2))
							for k, v := range feedState {
								b.WriteString(fmt.Sprintf("$%d\r\n%s\r\n$%d\r\n%s\r\n", len(k), k, len(v), v))
							}
							_, _ = c.Write([]byte(b.String()))
						}
					} else if strings.Contains(upper, "HELLO") {
						_, _ = c.Write([]byte("%1\r\n$5\r\nproto\r\n:3\r\n"))
					} else {
						_, _ = c.Write([]byte("+OK\r\n"))
					}
				}
			}(conn)
		}
	}()

	cleanup := func() {
		close(stop)
		_ = ln.Close()
	}

	return ln.Addr().String(), cleanup
}

func TestReadyEndpoint_RoutingAndPayload(t *testing.T) {
	priorDB := database.GetDB()
	database.SetDBForTesting(nil)
	defer database.SetDBForTesting(priorDB)
	gin.SetMode(gin.TestMode)

	// Outside market hours to verify readiness 200 without DB
	closedTime := time.Date(2026, 9, 26, 12, 0, 0, 0, calendar.Location())
	require.False(t, calendar.IsMarketOpen(closedTime))

	redisAddr, cleanup := startTestRedisServer(t, map[string]string{
		"feed_provider":           "angel_one",
		"feed_state":              "CONNECTED",
		"is_synthetic":            "false",
		"last_tick":               closedTime.Add(-2 * time.Hour).UTC().Format(time.RFC3339),
		"subscribed_tokens_count": "1500",
	})
	defer cleanup()

	cfg := &config.Config{
		AppEnv:                "test",
		CORSAllowedOrigins:    "*",
		JWTSecret:             "test-secret-32-chars-long-for-jwt-key!",
		RedisURL:              "redis://" + redisAddr + "?protocol=2",
		RedisOperationTimeout: 500 * time.Millisecond,
		MarketFeedMode:        string(marketDTO.FeedModeLive),
	}

	r := Setup(context.Background(), cfg)

	// Test all 4 aliased ready paths
	endpoints := []string{"/ready", "/readyz", "/api/v1/ready", "/api/v1/readyz"}
	for _, ep := range endpoints {
		t.Run("Endpoint_"+ep, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, ep, nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			// Database is nil in this test so it should return 503 with database DOWN
			assert.Equal(t, http.StatusServiceUnavailable, w.Code)

			var resp handler.ReadinessResponse
			err := json.Unmarshal(w.Body.Bytes(), &resp)
			require.NoError(t, err)

			assert.False(t, resp.Ready)
			assert.Equal(t, "UNAVAILABLE", resp.Status)
			assert.Equal(t, "DOWN", resp.Services.Database.Status)
			assert.Equal(t, "UP", resp.Services.Redis.Status)
			assert.Equal(t, "UP", resp.Services.Calendar.Status)
			assert.Contains(t, []string{"OPEN", "CLOSED"}, resp.Services.Calendar.MarketState)

			// Verify backwards compatibility fields in data
			assert.Equal(t, "not_ready", resp.Data["status"])
			assert.Equal(t, "unreachable", resp.Data["database"])
		})
	}
}

func TestReadyEndpoint_RedisUnreachable_Returns503(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// Use closed port to trigger Redis unreachable
	cfg := &config.Config{
		AppEnv:                "test",
		CORSAllowedOrigins:    "*",
		JWTSecret:             "test-secret-32-chars-long-for-jwt-key!",
		RedisURL:              "redis://127.0.0.1:59998",
		RedisOperationTimeout: 50 * time.Millisecond,
	}

	r := Setup(context.Background(), cfg)

	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)

	var resp handler.ReadinessResponse
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)

	assert.False(t, resp.Ready)
	assert.Equal(t, "DOWN", resp.Services.Redis.Status)
}
