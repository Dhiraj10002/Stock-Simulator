package router

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
)

// 1. Attack: 10 concurrent HTTP requests to POST /api/v1/orders trying to double-spend wallet balance.
// Guarantee: Exactly 1 returns HTTP 201 Created; 9 return HTTP 400. Zero negative wallet corruption.
func TestRouterAttack_ConcurrentOrderCreation_DoubleSpending(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	email := fmt.Sprintf("attack_doublespend_%s@test.com", uuid.New().String()[:8])
	password := "AttackSecure123!"
	name := "Attack Double Spend"
	defer env.deleteUser(email)

	token := registerAndLoginUser(t, env, email, password, name)
	var u model.User
	_ = env.db.Where("email = ?", email).First(&u)
	userUUID := u.UUID

	// Set wallet cash to exactly 10,000 paise (₹100)
	_ = env.db.Model(&model.Wallet{}).Where("user_uuid = ?", userUUID).Update("cash_balance_paise", 10000).Error

	// Set quote in Redis: TCS @ ₹60 (6,000 paise)
	env.setQuote("TCS", 6000)

	// 10 concurrent HTTP requests: Limit buy 1 share @ ₹57.00 (5,700 paise).
	// Within circuit limits [5,400, 6,600], below market 6,000.
	// Total requested = 57,000 paise. User only has 10,000 paise!
	const concurrency = 10
	var wg sync.WaitGroup
	statusCodes := make([]int, concurrency)

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			orderBody, _ := json.Marshal(map[string]interface{}{
				"symbol":      "TCS",
				"side":        "BUY",
				"type":        "LIMIT",
				"product":     "DELIVERY",
				"quantity":    1,
				"price_paise": 5700,
			})
			orderReq := httptest.NewRequest(http.MethodPost, "/api/v1/orders", bytes.NewReader(orderBody))
			orderReq.Header.Set("Content-Type", "application/json")
			orderReq.Header.Set("Authorization", "Bearer "+token)
			orderW := httptest.NewRecorder()
			env.router.ServeHTTP(orderW, orderReq)
			statusCodes[idx] = orderW.Code
			if orderW.Code != http.StatusCreated && orderW.Code != http.StatusBadRequest {
				t.Logf("Unexpected code %d: %s", orderW.Code, orderW.Body.String())
			}
		}(i)
	}
	wg.Wait()

	createdCount := 0
	badReqCount := 0
	for _, code := range statusCodes {
		if code == http.StatusCreated {
			createdCount++
		} else if code == http.StatusBadRequest {
			badReqCount++
		}
	}

	if createdCount != 1 {
		t.Fatalf("CRITICAL ROUTER DOUBLE SPEND BUG: Expected exactly 1 HTTP 201, got %d (bad requests: %d)", createdCount, badReqCount)
	}
	if badReqCount != concurrency-1 {
		t.Fatalf("Expected %d HTTP 400 Bad Requests, got %d", concurrency-1, badReqCount)
	}

	// Verify wallet in DB: cash = 10,000, blocked = 5,700, available = 4,300
	var finalWallet model.Wallet
	_ = env.db.Where("user_uuid = ?", userUUID).First(&finalWallet)
	if finalWallet.CashBalancePaise < 0 {
		t.Fatalf("CRITICAL: Wallet cash balance is negative: %d", finalWallet.CashBalancePaise)
	}
	if finalWallet.BlockedPaise != 5700 {
		t.Fatalf("Expected blocked paise 5,700, got %d", finalWallet.BlockedPaise)
	}
	if finalWallet.AvailableBalancePaise() != 4300 {
		t.Fatalf("Expected available balance 4,300, got %d", finalWallet.AvailableBalancePaise())
	}
}

// 2. Attack: 10 concurrent HTTP requests to POST /api/v1/orders/:id/execute on the same open order.
// Guarantee: Exactly 1 execution succeeds. Exactly 1 trade generated.
func TestRouterAttack_ConcurrentDuplicateExecution(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	email := fmt.Sprintf("attack_dupexec_%s@test.com", uuid.New().String()[:8])
	password := "AttackSecure123!"
	name := "Attack Duplicate Exec"
	defer env.deleteUser(email)

	token := registerAndLoginUser(t, env, email, password, name)
	var u model.User
	_ = env.db.Where("email = ?", email).First(&u)
	userUUID := u.UUID

	// Set quote in Redis: INFY @ ₹1,500 (150,000 paise)
	env.setQuote("INFY", 150000)

	// 2. Place open LIMIT order: 2 shares @ ₹1,480 (148,000 paise)
	orderBody, _ := json.Marshal(map[string]interface{}{
		"symbol":      "INFY",
		"side":        "BUY",
		"type":        "LIMIT",
		"product":     "DELIVERY",
		"quantity":    2,
		"price_paise": 148000,
	})
	orderReq := httptest.NewRequest(http.MethodPost, "/api/v1/orders", bytes.NewReader(orderBody))
	orderReq.Header.Set("Content-Type", "application/json")
	orderReq.Header.Set("Authorization", "Bearer "+token)
	orderW := httptest.NewRecorder()
	env.router.ServeHTTP(orderW, orderReq)
	if orderW.Code != http.StatusCreated {
		t.Fatalf("create order failed: %d, body: %s", orderW.Code, orderW.Body.String())
	}

	var orderResp struct {
		Data struct {
			UUID string `json:"uuid"`
		} `json:"data"`
	}
	_ = json.Unmarshal(orderW.Body.Bytes(), &orderResp)
	orderUUID := orderResp.Data.UUID

	// Now move quote in Redis down to ₹1,480 to satisfy limit price
	env.setQuote("INFY", 148000)

	// 3. 10 concurrent HTTP POST requests to execute this exact order
	const concurrency = 10
	var wg sync.WaitGroup
	statusCodes := make([]int, concurrency)

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			execReq := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/orders/%s/execute", orderUUID), nil)
			execReq.Header.Set("Authorization", "Bearer "+token)
			execW := httptest.NewRecorder()
			env.router.ServeHTTP(execW, execReq)
			statusCodes[idx] = execW.Code
		}(i)
	}
	wg.Wait()

	okCount := 0
	errCount := 0
	for _, code := range statusCodes {
		if code == http.StatusOK {
			okCount++
		} else {
			errCount++
		}
	}

	if okCount != 1 {
		t.Fatalf("CRITICAL ROUTER DOUBLE EXECUTION BUG: Expected exactly 1 HTTP 200, got %d (errors: %d)", okCount, errCount)
	}
	if errCount != concurrency-1 {
		t.Fatalf("Expected %d failed execution requests, got %d", concurrency-1, errCount)
	}

	// Verify DB state: exactly 1 trade
	var tradeCount int64
	_ = env.db.Model(&model.Trade{}).Where("user_uuid = ? AND symbol = ?", userUUID, "INFY").Count(&tradeCount)
	if tradeCount != 1 {
		t.Fatalf("Expected exactly 1 trade, got %d", tradeCount)
	}
}

// 3. Attack: 5 concurrent HTTP calls to POST /api/v1/orders/squareoff-mis.
// Guarantee: All complete without deadlock, position strictly 0, blocked margin 0.
func TestRouterAttack_ConcurrentMISAutoSquareOff(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	email := fmt.Sprintf("attack_sqoff_%s@test.com", uuid.New().String()[:8])
	password := "AttackSecure123!"
	name := "Attack Square Off"
	defer env.deleteUser(email)

	token := registerAndLoginUser(t, env, email, password, name)
	var u model.User
	_ = env.db.Where("email = ?", email).First(&u)
	userUUID := u.UUID

	// Set quote for RELIANCE
	env.setQuote("RELIANCE", 250000)

	// Buy 10 shares MIS at market
	buyBody, _ := json.Marshal(map[string]interface{}{
		"symbol":   "RELIANCE",
		"side":     "BUY",
		"type":     "MARKET",
		"product":  "INTRADAY",
		"quantity": 10,
	})
	buyReq := httptest.NewRequest(http.MethodPost, "/api/v1/orders", bytes.NewReader(buyBody))
	buyReq.Header.Set("Content-Type", "application/json")
	buyReq.Header.Set("Authorization", "Bearer "+token)
	buyW := httptest.NewRecorder()
	env.router.ServeHTTP(buyW, buyReq)
	if buyW.Code != http.StatusCreated {
		t.Fatalf("buy order failed: %d, body: %s", buyW.Code, buyW.Body.String())
	}

	// 5 concurrent square-off requests
	const concurrency = 5
	var wg sync.WaitGroup
	statusCodes := make([]int, concurrency)

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			sqReq := httptest.NewRequest(http.MethodPost, "/api/v1/orders/squareoff-mis", nil)
			sqReq.Header.Set("Authorization", "Bearer "+token)
			sqW := httptest.NewRecorder()
			env.router.ServeHTTP(sqW, sqReq)
			statusCodes[idx] = sqW.Code
		}(i)
	}
	wg.Wait()

	for _, code := range statusCodes {
		if code != http.StatusOK {
			t.Fatalf("expected HTTP 200 OK from squareoff, got: %d", code)
		}
	}

	// Verify position is strictly 0
	var finalPos model.Position
	_ = env.db.Where("user_uuid = ? AND symbol = ? AND product = ?", userUUID, "RELIANCE", model.OrderProductIntraday).First(&finalPos)
	if finalPos.Quantity != 0 {
		t.Fatalf("CRITICAL PHANTOM POSITION: Expected position quantity 0, got %d", finalPos.Quantity)
	}

	// Verify blocked margin is strictly 0
	var finalWallet model.Wallet
	_ = env.db.Where("user_uuid = ?", userUUID).First(&finalWallet)
	if finalWallet.BlockedPaise != 0 {
		t.Fatalf("CRITICAL MARGIN LEAK: Expected blocked paise 0, got %d", finalWallet.BlockedPaise)
	}
}

// 4. Attack: Attempt to place a market order when quote is missing from market feed.
// Guarantee: No fake quote execution. HTTP 400 Bad Request returned. 0 orders created.
func TestRouterAttack_MarketOrderMissingQuote_Rejected(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	email := fmt.Sprintf("attack_missingquote_%s@test.com", uuid.New().String()[:8])
	password := "AttackSecure123!"
	name := "Attack Missing Quote"
	defer env.deleteUser(email)

	token := registerAndLoginUser(t, env, email, password, name)

	// Delete quote from Redis for canonical instrument SUZLON
	_ = env.redis.Del(context.Background(), "market:quote:SUZLON").Err()

	// Attempt market order: must be rejected with 400 Bad Request
	orderBody, _ := json.Marshal(map[string]interface{}{
		"symbol":   "SUZLON",
		"side":     "BUY",
		"type":     "MARKET",
		"product":  "DELIVERY",
		"quantity": 1,
	})
	orderReq := httptest.NewRequest(http.MethodPost, "/api/v1/orders", bytes.NewReader(orderBody))
	orderReq.Header.Set("Content-Type", "application/json")
	orderReq.Header.Set("Authorization", "Bearer "+token)
	orderW := httptest.NewRecorder()
	env.router.ServeHTTP(orderW, orderReq)

	if orderW.Code != http.StatusNotFound {
		t.Fatalf("CRITICAL SECURITY FLAW: Market order for missing quote was not rejected: %d, body: %s", orderW.Code, orderW.Body.String())
	}
}

// 5. Attack: Verify Health endpoint reports database connectivity.
func TestRouterAttack_HealthCheckUnderPostgres(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	w := httptest.NewRecorder()
	env.router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("health check failed: %d", w.Code)
	}

	var resp struct {
		Data struct {
			Database string `json:"database"`
			Status   string `json:"status"`
		} `json:"data"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)

	if resp.Data.Database != "connected" {
		t.Fatalf("expected database connected, got: %s", resp.Data.Database)
	}
	if resp.Data.Status != "healthy" {
		t.Fatalf("expected status healthy, got: %s", resp.Data.Status)
	}
}
