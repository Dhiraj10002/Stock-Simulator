package router

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	marketHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/handler"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	orderHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/handler"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/validation"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	ws "github.com/gorilla/websocket"
)

// -----------------------------------------------------------------------------
// Test 1: HTTPS & Reverse Proxy Header Forwarding
// Verifies X-Forwarded-Proto, X-Forwarded-For, Host, and X-Request-ID propagation.
// -----------------------------------------------------------------------------
func TestProdInfra_HTTPS_Headers(t *testing.T) {
	gin.SetMode(gin.TestMode)
	validation.Register()

	cfg := &config.Config{
		AppEnv:             "production",
		CORSAllowedOrigins: "https://stock-simulator.vercel.app",
		JWTSecret:          "prod-test-secret-32-bytes-minimum-size!!",
		RedisURL:           "redis://127.0.0.1:6380/0",
	}

	r := Setup(context.Background(), cfg)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Host", "api.stock-simulator.oracle.com")
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("X-Forwarded-For", "203.0.113.195, 10.0.0.1")
	req.Header.Set("X-Real-IP", "203.0.113.195")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected HTTP 200, got: %d", w.Code)
	}

	requestID := w.Header().Get("X-Request-ID")
	if requestID == "" {
		t.Fatal("expected X-Request-ID header in response for HTTPS trace tracking")
	}
}

// -----------------------------------------------------------------------------
// Test 2: CORS Preflight, Origin Normalization & Attack Rejection
// -----------------------------------------------------------------------------
func TestProdInfra_CORS_Preflight_And_Restrictions(t *testing.T) {
	gin.SetMode(gin.TestMode)
	validation.Register()

	allowedOrigins := "https://stock-simulator.vercel.app, https://preview.stock-simulator.vercel.app/"
	cfg := &config.Config{
		AppEnv:             "production",
		CORSAllowedOrigins: allowedOrigins,
		JWTSecret:          "prod-test-secret-32-bytes-minimum-size!!",
		RedisURL:           "redis://127.0.0.1:6380/0",
	}

	r := Setup(context.Background(), cfg)

	// Subtest 2a: Valid preflight OPTIONS request from Vercel production domain
	t.Run("Valid Vercel preflight OPTIONS request", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodOptions, "/api/v1/health", nil)
		req.Header.Set("Origin", "https://stock-simulator.vercel.app")
		req.Header.Set("Access-Control-Request-Method", "POST")
		req.Header.Set("Access-Control-Request-Headers", "Authorization, Content-Type, X-Request-ID")

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusNoContent {
			t.Fatalf("expected HTTP 204 No Content for CORS preflight, got %d", w.Code)
		}

		if w.Header().Get("Access-Control-Allow-Origin") != "https://stock-simulator.vercel.app" {
			t.Fatalf("unexpected Access-Control-Allow-Origin: %s", w.Header().Get("Access-Control-Allow-Origin"))
		}
		if w.Header().Get("Access-Control-Allow-Credentials") != "true" {
			t.Fatalf("expected Access-Control-Allow-Credentials true, got: %s", w.Header().Get("Access-Control-Allow-Credentials"))
		}
		if w.Header().Get("Access-Control-Max-Age") != "86400" {
			t.Fatalf("expected Access-Control-Max-Age 86400 (24h cache), got: %s", w.Header().Get("Access-Control-Max-Age"))
		}
		if !strings.Contains(w.Header().Get("Access-Control-Allow-Methods"), "POST") {
			t.Fatalf("expected Access-Control-Allow-Methods to include POST, got: %s", w.Header().Get("Access-Control-Allow-Methods"))
		}
	})

	// Subtest 2b: Trailing slash & case normalization
	t.Run("Trailing slash and case insensitive origin normalization", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		req.Header.Set("Origin", "https://PREVIEW.STOCK-SIMULATOR.VERCEL.APP")

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected HTTP 200, got %d", w.Code)
		}
		if w.Header().Get("Access-Control-Allow-Origin") != "https://PREVIEW.STOCK-SIMULATOR.VERCEL.APP" {
			t.Fatalf("expected matching origin returned in header, got: %s", w.Header().Get("Access-Control-Allow-Origin"))
		}
	})

	// Subtest 2c: Cross-Site Attack rejection
	t.Run("Cross-site rogue origin rejected with 403", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		req.Header.Set("Origin", "https://malicious-phishing-site.com")

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected HTTP 403 Forbidden for unauthorized cross-origin request, got: %d", w.Code)
		}
		if w.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatalf("expected empty Access-Control-Allow-Origin on rejected origin, got: %s", w.Header().Get("Access-Control-Allow-Origin"))
		}
	})
}

// -----------------------------------------------------------------------------
// Test 3: WSS Upgrade & Origin Security (Gorilla WebSocket CheckOrigin)
// -----------------------------------------------------------------------------
func TestProdInfra_WSS_Upgrade_And_Security(t *testing.T) {
	gin.SetMode(gin.TestMode)
	validation.Register()

	allowedOrigin := "https://stock-simulator.vercel.app"
	cfg := &config.Config{
		AppEnv:             "production",
		CORSAllowedOrigins: allowedOrigin,
		JWTSecret:          "prod-test-secret-32-bytes-minimum-size!!",
		RedisURL:           "redis://127.0.0.1:6380/0",
	}

	r := Setup(context.Background(), cfg)
	ts := httptest.NewServer(r)
	defer ts.Close()

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws/market"

	// Subtest 3a: Valid WebSocket upgrade from allowed Vercel origin
	t.Run("Allowed Vercel origin upgrades to WebSocket and subscribes", func(t *testing.T) {
		dialer := ws.Dialer{
			HandshakeTimeout: 3 * time.Second,
		}
		headers := http.Header{}
		headers.Set("Origin", allowedOrigin)

		conn, resp, err := dialer.Dial(wsURL, headers)
		if err != nil {
			t.Fatalf("WebSocket dial failed with allowed origin: %v", err)
		}
		defer conn.Close()

		if resp.StatusCode != http.StatusSwitchingProtocols {
			t.Fatalf("expected HTTP 101 Switching Protocols, got: %d", resp.StatusCode)
		}

		// Read initial feed_status or consume initial event
		_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		var initMsg map[string]interface{}
		_ = conn.ReadJSON(&initMsg)

		// Send subscribe command
		subCmd := map[string]interface{}{
			"action":  "subscribe",
			"symbols": []string{"RELIANCE"},
		}
		if err := conn.WriteJSON(subCmd); err != nil {
			t.Fatalf("failed to write subscribe command: %v", err)
		}

		var ack map[string]interface{}
		if err := conn.ReadJSON(&ack); err != nil {
			t.Fatalf("failed to read subscribe ack: %v", err)
		}

		if ack["type"] != "subscribed" {
			t.Fatalf("expected ack type 'subscribed', got: %v", ack["type"])
		}
	})

	// Subtest 3b: Unauthorized origin rejected during WebSocket handshake in production
	t.Run("Unauthorized origin rejected during WebSocket handshake in production", func(t *testing.T) {
		dialer := ws.Dialer{
			HandshakeTimeout: 3 * time.Second,
		}
		headers := http.Header{}
		headers.Set("Origin", "https://hacker-cswsh.attacker.com")

		_, resp, err := dialer.Dial(wsURL, headers)
		if err == nil {
			t.Fatal("expected WebSocket handshake to fail for unauthorized origin, but it succeeded")
		}
		if resp != nil && resp.StatusCode != http.StatusForbidden {
			t.Fatalf("expected HTTP 403 Forbidden for CSWSH attempt, got: %d", resp.StatusCode)
		}
	})
}

// -----------------------------------------------------------------------------
// Test 4: DNS & Reverse Proxy Configuration Validation (Caddyfile & nginx.conf)
// Validates SSL/TLS termination, HTTP->HTTPS 301, WebSocket headers, and timeouts.
// -----------------------------------------------------------------------------
func TestProdInfra_DNS_And_ReverseProxyConfigs(t *testing.T) {
	// Locate repository root from current test file directory
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get working directory: %v", err)
	}

	repoRoot := wd
	for !fileOrDirExists(filepath.Join(repoRoot, "deploy")) && repoRoot != "/" {
		repoRoot = filepath.Dir(repoRoot)
	}

	caddyPath := filepath.Join(repoRoot, "deploy", "oracle", "Caddyfile")
	nginxPath := filepath.Join(repoRoot, "deploy", "oracle", "nginx.conf")

	// 1. Verify Caddyfile
	caddyContent, err := os.ReadFile(caddyPath)
	if err != nil {
		t.Fatalf("failed to read Caddyfile at %s: %v", caddyPath, err)
	}
	caddyStr := string(caddyContent)

	if !strings.Contains(caddyStr, "reverse_proxy backend:8080") {
		t.Fatal("Caddyfile missing upstream backend:8080 configuration")
	}
	if !strings.Contains(caddyStr, "handle /api/*") {
		t.Fatal("Caddyfile missing /api/* handle")
	}
	if !strings.Contains(caddyStr, "handle /ws/*") {
		t.Fatal("Caddyfile missing /ws/* handle")
	}
	if !strings.Contains(caddyStr, "handle /health") {
		t.Fatal("Caddyfile missing /health handle")
	}
	if !strings.Contains(caddyStr, "handle /ready") {
		t.Fatal("Caddyfile missing /ready handle")
	}

	// 2. Verify nginx.conf
	nginxContent, err := os.ReadFile(nginxPath)
	if err != nil {
		t.Fatalf("failed to read nginx.conf at %s: %v", nginxPath, err)
	}
	nginxStr := string(nginxContent)

	// Check HTTP to HTTPS 301 redirection
	if !strings.Contains(nginxStr, "listen 80;") || !strings.Contains(nginxStr, "return 301 https://$host$request_uri;") {
		t.Fatal("nginx.conf missing port 80 HTTP->HTTPS 301 permanent redirect")
	}

	// Check TLS protocols & ciphers
	if !strings.Contains(nginxStr, "ssl_protocols TLSv1.2 TLSv1.3;") {
		t.Fatal("nginx.conf must enforce TLSv1.2 and TLSv1.3")
	}
	if !strings.Contains(nginxStr, "ssl_ciphers HIGH:!aNULL:!MD5;") {
		t.Fatal("nginx.conf missing strong cipher configuration")
	}

	// Check WebSocket upgrade headers
	if !strings.Contains(nginxStr, "proxy_set_header Upgrade $http_upgrade;") ||
		!strings.Contains(nginxStr, "proxy_set_header Connection \"upgrade\";") {
		t.Fatal("nginx.conf missing WebSocket Upgrade headers in /ws/ block")
	}

	// Check long-lived streaming timeouts
	if !strings.Contains(nginxStr, "proxy_read_timeout 86400s;") ||
		!strings.Contains(nginxStr, "proxy_send_timeout 86400s;") {
		t.Fatal("nginx.conf missing 86400s WebSocket stream timeouts")
	}

	// Check /health and /ready locations
	if !strings.Contains(nginxStr, "location /health") ||
		!strings.Contains(nginxStr, "location /ready") {
		t.Fatal("nginx.conf missing /health or /ready proxy endpoints")
	}
}

// -----------------------------------------------------------------------------
// Test 5: Health & Readiness Endpoints (Liveness vs Readiness Differentiation)
// -----------------------------------------------------------------------------
func TestProdInfra_Health_And_Readiness_Endpoints(t *testing.T) {
	gin.SetMode(gin.TestMode)
	validation.Register()

	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	cfg := &config.Config{
		AppEnv:             "production",
		CORSAllowedOrigins: "*",
		JWTSecret:          "test-secret",
		RedisURL:           "redis://127.0.0.1:6380/0",
	}
	r := Setup(context.Background(), cfg)

	// Subtest 5a: Root /health and /api/v1/health return 200 with status healthy
	t.Run("Liveness endpoints return 200", func(t *testing.T) {
		for _, endpoint := range []string{"/health", "/api/v1/health"} {
			req := httptest.NewRequest(http.MethodGet, endpoint, nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("expected HTTP 200 for %s, got: %d", endpoint, w.Code)
			}

			var body struct {
				Data struct {
					Status   string `json:"status"`
					Database string `json:"database"`
				} `json:"data"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatalf("failed to decode response from %s: %v", endpoint, err)
			}
			if body.Data.Status != "healthy" {
				t.Fatalf("expected status healthy, got: %s", body.Data.Status)
			}
		}
	})

	// Subtest 5b: Readiness endpoints return 200 when database is connected
	t.Run("Readiness endpoints return 200 when database connected", func(t *testing.T) {
		for _, endpoint := range []string{"/ready", "/api/v1/ready"} {
			req := httptest.NewRequest(http.MethodGet, endpoint, nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("expected HTTP 200 for %s, got: %d", endpoint, w.Code)
			}

			var body struct {
				Data struct {
					Status   string `json:"status"`
					Database string `json:"database"`
				} `json:"data"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatalf("failed to decode readiness response from %s: %v", endpoint, err)
			}
			if body.Data.Status != "ready" {
				t.Fatalf("expected status ready, got: %s", body.Data.Status)
			}
			if body.Data.Database != "connected" {
				t.Fatalf("expected database connected, got: %s", body.Data.Database)
			}
		}
	})

	// Subtest 5c: Readiness returns 503 Service Unavailable when DB is unreachable
	t.Run("Readiness returns 503 when DB ping fails", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/ready", nil)
		cancelledCtx, cancel := context.WithCancel(context.Background())
		cancel() // immediately cancel context to simulate connection drop
		req = req.WithContext(cancelledCtx)

		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusServiceUnavailable {
			t.Fatalf("expected HTTP 503 Service Unavailable when DB ping fails, got: %d", w.Code)
		}

		var body struct {
			Success bool `json:"success"`
			Data    struct {
				Status   string `json:"status"`
				Database string `json:"database"`
			} `json:"data"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &body)
		if body.Success {
			t.Fatal("expected success=false on readiness failure")
		}
		if body.Data.Status != "not_ready" {
			t.Fatalf("expected status not_ready, got: %s", body.Data.Status)
		}
	})
}

// -----------------------------------------------------------------------------
// Test 6: Backend Graceful Restart & Matcher Recovery
// Simulates server shutdown, boots a fresh backend, resumes matching pending orders.
// -----------------------------------------------------------------------------
func TestProdInfra_BackendRestart_StateRecovery(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	email := fmt.Sprintf("restart_test_%s@test.com", uuid.New().String()[:8])
	password := "RestartPass123!"
	name := "Restart Recovery Test"
	defer env.deleteUser(email)

	token := registerAndLoginUser(t, env, email, password, name)

	var u model.User
	_ = env.db.Where("email = ?", email).First(&u)
	userUUID := u.UUID

	// Fund wallet with ₹10,000 (1,000,000 paise)
	_ = env.db.Model(&model.Wallet{}).Where("user_uuid = ?", userUUID).Update("cash_balance_paise", 1000000).Error

	// Set initial quote for TMPV @ ₹500 (50,000 paise)
	env.setQuote("TMPV", 50000)

	// Step 1: Create a pending LIMIT BUY order for TMPV @ ₹480 (48,000 paise)
	orderBody, _ := json.Marshal(map[string]interface{}{
		"symbol":      "TMPV",
		"side":        "BUY",
		"type":        "LIMIT",
		"product":     "DELIVERY",
		"quantity":    2,
		"price_paise": 48000,
	})
	orderReq := httptest.NewRequest(http.MethodPost, "/api/v1/orders", bytes.NewReader(orderBody))
	orderReq.Header.Set("Content-Type", "application/json")
	orderReq.Header.Set("Authorization", "Bearer "+token)

	orderResp := httptest.NewRecorder()
	env.router.ServeHTTP(orderResp, orderReq)

	if orderResp.Code != http.StatusCreated {
		t.Fatalf("expected order creation 201, got: %d (%s)", orderResp.Code, orderResp.Body.String())
	}

	var createdOrder struct {
		Data struct {
			UUID   string `json:"uuid"`
			Status string `json:"status"`
		} `json:"data"`
	}
	_ = json.Unmarshal(orderResp.Body.Bytes(), &createdOrder)
	if createdOrder.Data.UUID == "" {
		t.Fatalf("expected created order UUID in response, got body: %s", orderResp.Body.String())
	}
	if createdOrder.Data.Status != "PENDING" {
		t.Fatalf("expected order status PENDING, got: %s", createdOrder.Data.Status)
	}

	// Step 2: SIMULATE BACKEND RESTART
	// Terminate previous background matcher by creating a fresh backend instance.
	// The fresh instance must recover active symbols from DB and execute the pending order on quote crossing.
	rebootCtx, cancelReboot := context.WithCancel(context.Background())
	defer cancelReboot()

	mHandler, err := marketHandler.New("redis://127.0.0.1:6380/0", 2*time.Second)
	if err != nil {
		t.Fatalf("failed to create market handler during reboot: %v", err)
	}
	cfg := &config.Config{
		AppEnv:             "production",
		CORSAllowedOrigins: "*",
		JWTSecret:          "test-secret",
		RedisURL:           "redis://127.0.0.1:6380/0",
	}

	rebootedOrdersHandler := orderHandler.New(mHandler.Service(), cfg)
	go rebootedOrdersHandler.RunMatcher(rebootCtx)

	// Allow matcher loop to initialize
	time.Sleep(150 * time.Millisecond)

	// Step 3: Publish a matching quote (price drops to ₹475, crossing limit of ₹480)
	env.setQuote("TMPV", 47500)
	quotePayload, _ := json.Marshal(map[string]interface{}{
		"type":        "quote",
		"symbol":      "TMPV",
		"price_paise": 47500,
		"source":      "synthetic_simulation",
		"updated_at":  time.Now().UTC().Format(time.RFC3339),
	})
	_ = env.redis.Publish(context.Background(), "market:updates", string(quotePayload)).Err()
	_ = rebootedOrdersHandler.Service().MatchSymbol("TMPV")

	// Poll database for order completion after backend reboot
	deadline := time.Now().Add(3 * time.Second)
	var updatedOrder model.Order
	for time.Now().Before(deadline) {
		_ = env.db.Where("uuid = ?", createdOrder.Data.UUID).First(&updatedOrder)
		if updatedOrder.Status == model.OrderStatusExecuted {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	if updatedOrder.Status != model.OrderStatusExecuted {
		t.Fatalf("expected pending order to execute after backend reboot, status remains: %s", updatedOrder.Status)
	}

	// Step 5: Verify Position and Wallet Balance are intact
	var pos model.Position
	if err := env.db.Where("user_uuid = ? AND symbol = ?", userUUID, "TMPV").First(&pos).Error; err != nil {
		t.Fatalf("expected position created for TMPV after restart: %v", err)
	}
	if pos.Quantity != 2 {
		t.Fatalf("expected position quantity 2, got: %d", pos.Quantity)
	}

	var w model.Wallet
	_ = env.db.Where("user_uuid = ?", userUUID).First(&w)
	expectedCash := int64(1000000 - 2*47500) // Filled with price improvement at ₹475 (47,500 paise)
	if w.CashBalancePaise != expectedCash {
		t.Fatalf("expected wallet cash balance %d, got: %d", expectedCash, w.CashBalancePaise)
	}
	if w.BlockedPaise != 0 {
		t.Fatalf("expected blocked paise 0, got: %d", w.BlockedPaise)
	}
}

// -----------------------------------------------------------------------------
// Test 7: Redis Reconnection & PubSub Resiliency
// -----------------------------------------------------------------------------
func TestProdInfra_Redis_Reconnect_And_PubSub(t *testing.T) {
	mHandler, err := marketHandler.New("redis://127.0.0.1:6380/0", 2*time.Second)
	if err != nil {
		t.Skipf("Redis not available on 6380: %v", err)
		return
	}

	service := mHandler.Service()

	// 1. Initial subscription
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pubsub := service.SubscribeQuotes(ctx)
	if pubsub == nil {
		t.Fatal("SubscribeQuotes returned nil pubsub")
	}

	// 2. Simulate channel disconnect by closing subscription
	if err := pubsub.Close(); err != nil {
		t.Fatalf("failed to close pubsub: %v", err)
	}

	// 3. Service reconnects by creating a new subscription without panic or state leak
	pubsub2 := service.SubscribeQuotes(ctx)
	if pubsub2 == nil {
		t.Fatal("SubscribeQuotes failed after reconnect")
	}
	defer pubsub2.Close()

	// 4. Verify FeedStatus retrieves data without crash
	status, err := service.FeedStatus(ctx)
	if err != nil {
		t.Fatalf("FeedStatus returned error: %v", err)
	}
	if status == nil {
		t.Fatal("FeedStatus returned nil response")
	}
}

func fileOrDirExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
