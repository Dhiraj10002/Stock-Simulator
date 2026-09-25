package router

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	orderDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/logger"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

type logCollector struct {
	mu      sync.Mutex
	records []map[string]interface{}
	raw     []string
}

func (c *logCollector) Write(p []byte) (n int, err error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	line := string(p)
	c.raw = append(c.raw, line)

	var record map[string]interface{}
	if err := json.Unmarshal(p, &record); err == nil {
		c.records = append(c.records, record)
	}
	return len(p), nil
}

func (c *logCollector) Find(predicate func(map[string]interface{}) bool) []map[string]interface{} {
	c.mu.Lock()
	defer c.mu.Unlock()

	var matches []map[string]interface{}
	for _, r := range c.records {
		if predicate(r) {
			matches = append(matches, r)
		}
	}
	return matches
}

func (c *logCollector) AllRaw() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	copied := make([]string, len(c.raw))
	copy(copied, c.raw)
	return copied
}

func setupObservabilityLogger() (*logCollector, func()) {
	collector := &logCollector{}
	encCfg := zap.NewProductionEncoderConfig()
	encCfg.TimeKey = "timestamp"
	encCfg.EncodeTime = zapcore.ISO8601TimeEncoder
	encoder := zapcore.NewJSONEncoder(encCfg)

	baseCore := zapcore.NewCore(encoder, zapcore.AddSync(collector), zapcore.DebugLevel)
	sanitizedCore := logger.NewSanitizingCore(baseCore)
	testLogger := zap.New(sanitizedCore)

	oldLog := logger.Log
	logger.SetLogger(testLogger)

	restore := func() {
		logger.SetLogger(oldLog)
	}
	return collector, restore
}

func TestObservabilityE2E(t *testing.T) {
	collector, restore := setupObservabilityLogger()
	defer restore()

	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	testEmail := fmt.Sprintf("obs_user_%d@example.com", time.Now().UnixNano())
	defer env.deleteUser(testEmail)

	// 1. Register & Login User to acquire a real JWT token
	jwtToken := registerAndLoginUser(t, env, testEmail, "ObservabilityPass123!", "Observability Tester")
	require.NotEmpty(t, jwtToken)

	var userModel model.User
	require.NoError(t, env.db.Where("email = ?", testEmail).First(&userModel).Error)
	userID := userModel.UUID.String()
	require.NotEmpty(t, userID)

	// Set active market quote for RELIANCE
	env.setQuote("RELIANCE", 250000) // ₹2,500.00

	// 2. HTTP Access Observability: GET /api/v1/wallet
	customReqID := "obs-req-" + uuid.NewString()
	walletReq := httptest.NewRequest(http.MethodGet, "/api/v1/wallet", nil)
	walletReq.Header.Set("Authorization", "Bearer "+jwtToken)
	walletReq.Header.Set("X-Request-ID", customReqID)
	walletResp := httptest.NewRecorder()
	env.router.ServeHTTP(walletResp, walletReq)
	require.Equal(t, http.StatusOK, walletResp.Code)
	assert.Equal(t, customReqID, walletResp.Header().Get("X-Request-ID"))

	// Verify HTTP access log contains: request_id, user_id, latency
	httpLogs := collector.Find(func(r map[string]interface{}) bool {
		return r["request_id"] == customReqID && r["path"] == "/api/v1/wallet"
	})
	require.NotEmpty(t, httpLogs, "expected HTTP request log with request_id")
	httpLog := httpLogs[0]
	assert.Equal(t, userID, httpLog["user_id"], "expected user_id in HTTP access log")
	assert.NotNil(t, httpLog["latency"], "expected latency in HTTP access log")

	// 3. Order Creation & Execution Observability: POST /api/v1/orders
	orderReqID := "obs-order-req-" + uuid.NewString()
	createOrderBody, _ := json.Marshal(orderDTO.CreateOrderRequest{
		Symbol:   "RELIANCE",
		Side:     model.OrderSideBuy,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductDelivery,
		Quantity: 5,
	})
	orderReq := httptest.NewRequest(http.MethodPost, "/api/v1/orders", bytes.NewReader(createOrderBody))
	orderReq.Header.Set("Authorization", "Bearer "+jwtToken)
	orderReq.Header.Set("X-Request-ID", orderReqID)
	orderReq.Header.Set("Content-Type", "application/json")
	orderResp := httptest.NewRecorder()
	env.router.ServeHTTP(orderResp, orderReq)
	require.Equal(t, http.StatusCreated, orderResp.Code)

	var resData map[string]interface{}
	require.NoError(t, json.Unmarshal(orderResp.Body.Bytes(), &resData))
	ordData, ok := resData["data"].(map[string]interface{})
	require.True(t, ok, "expected data object in order response")
	orderID := getOrderID(ordData)
	require.NotEmpty(t, orderID, "expected order id in response")

	// Verify Order Creation log contains: order_id, user_id, latency, redis_latency, db_latency
	orderCreatedLogs := collector.Find(func(r map[string]interface{}) bool {
		return r["order_id"] == orderID && r["msg"] == "order created"
	})
	require.NotEmpty(t, orderCreatedLogs, "expected structured order created log")
	createdLog := orderCreatedLogs[0]
	assert.Equal(t, orderID, createdLog["order_id"])
	assert.Equal(t, userID, createdLog["user_id"])
	assert.NotNil(t, createdLog["latency"], "expected latency in order creation log")
	assert.NotNil(t, createdLog["redis_latency"], "expected redis_latency in order creation log")
	assert.NotNil(t, createdLog["db_latency"], "expected db_latency in order creation log")

	// Verify Order Execution log contains: order_id, user_id, execution_latency, redis_latency, db_latency
	execLogs := collector.Find(func(r map[string]interface{}) bool {
		return r["order_id"] == orderID && r["msg"] == "delivery order executed"
	})
	require.NotEmpty(t, execLogs, "expected structured order executed log")
	execLog := execLogs[0]
	assert.Equal(t, orderID, execLog["order_id"])
	assert.Equal(t, userID, execLog["user_id"])
	assert.NotNil(t, execLog["execution_latency"], "expected execution_latency in execution log")
	assert.NotNil(t, execLog["redis_latency"], "expected redis_latency in execution log")
	assert.NotNil(t, execLog["db_latency"], "expected db_latency in execution log")

	// 4. Market Event & Feed State Observability
	testMarketEventID := fmt.Sprintf("mkt_feed_%d_test", time.Now().UnixMilli())
	testLastTick := time.Now().UTC().Format(time.RFC3339)
	logger.Info("market feed state transitioned",
		logger.MarketEventID(testMarketEventID),
		logger.FeedState("CONNECTED"),
		logger.LastTick(testLastTick),
	)

	mktLogs := collector.Find(func(r map[string]interface{}) bool {
		return r["market_event_id"] == testMarketEventID
	})
	require.NotEmpty(t, mktLogs, "expected market feed transition log")
	mktLog := mktLogs[0]
	assert.Equal(t, testMarketEventID, mktLog["market_event_id"])
	assert.Equal(t, "CONNECTED", mktLog["feed_state"])
	assert.Equal(t, testLastTick, mktLog["last_tick"])

	// 5. Security & Redaction Assurance: Zero Leaks Verification
	allRawLogs := collector.AllRaw()
	require.NotEmpty(t, allRawLogs)

	for _, rawLine := range allRawLogs {
		// Strict Security: NO JWTs in plaintext
		assert.NotContains(t, rawLine, jwtToken, "raw log MUST NOT contain the real JWT token")

		// Strict Security: NO passwords
		assert.NotContains(t, rawLine, "ObservabilityPass123!", "raw log MUST NOT contain user password")

		// Strict Security: NO sensitive Authorization Bearer tokens in plaintext
		if strings.Contains(rawLine, `"authorization"`) {
			assert.Contains(t, rawLine, `[REDACTED]`, "authorization field must be redacted")
		}
	}
}
