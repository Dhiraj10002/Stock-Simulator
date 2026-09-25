package logger_test

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/logger"
)

func TestSanitizeText(t *testing.T) {
	jwtToken := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
	bearerStr := "Bearer " + jwtToken
	basicAuthStr := "Basic dXNlcm5hbWU6cGFzc3dvcmQxMjM="

	tests := []struct {
		name     string
		input    string
		contains []string
		omits    []string
	}{
		{
			name:     "JWT token sanitization",
			input:    "User authenticated with token: " + jwtToken,
			contains: []string{"User authenticated with token: [REDACTED_JWT]"},
			omits:    []string{jwtToken},
		},
		{
			name:     "Bearer header sanitization",
			input:    "Incoming request header: " + bearerStr,
			contains: []string{"Incoming request header: Bearer [REDACTED]"},
			omits:    []string{jwtToken},
		},
		{
			name:     "Basic auth sanitization",
			input:    "Header: " + basicAuthStr,
			contains: []string{"Header: Basic [REDACTED]"},
			omits:    []string{"dXNlcm5hbWU6cGFzc3dvcmQxMjM="},
		},
		{
			name:     "Password in key-value config",
			input:    `{"password": "SuperSecretPassword123!", "user": "admin"}`,
			contains: []string{`"password": "[REDACTED]"`, `"user": "admin"`},
			omits:    []string{"SuperSecretPassword123!"},
		},
		{
			name:     "API key in key-value",
			input:    "api_key: angel_sec_999888, env: prod",
			contains: []string{"api_key: [REDACTED]", "env: prod"},
			omits:    []string{"angel_sec_999888"},
		},
		{
			name:     "TOTP secret in key-value",
			input:    "totp_secret = JBSWY3DPEHPK3PXP",
			contains: []string{"totp_secret = [REDACTED]"},
			omits:    []string{"JBSWY3DPEHPK3PXP"},
		},
		{
			name:     "Database URL with credentials",
			input:    "Connecting to postgres://postgres:super_secret_pw@localhost:5432/stock_sim",
			contains: []string{"Connecting to postgres://postgres:[REDACTED]@localhost:5432/stock_sim"},
			omits:    []string{"super_secret_pw"},
		},
		{
			name:     "URL query parameters with secrets",
			input:    "GET /webhook?api_key=private_12345&symbol=RELIANCE",
			contains: []string{"GET /webhook?api_key=[REDACTED]&symbol=RELIANCE"},
			omits:    []string{"private_12345"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			output := logger.SanitizeText(tc.input)
			for _, exp := range tc.contains {
				assert.Contains(t, output, exp)
			}
			for _, omit := range tc.omits {
				assert.NotContains(t, output, omit)
			}
		})
	}
}

func TestIsSensitiveKey(t *testing.T) {
	sensitive := []string{
		"authorization",
		"Authorization",
		"cookie",
		"Cookie",
		"set-cookie",
		"Set-Cookie",
		"x-api-key",
		"X-API-KEY",
		"x-privatekey",
		"password",
		"client_secret",
		"jwt_secret",
		"totp_secret",
		"angel_totp_secret",
		"admin_password",
		"session_token",
	}

	nonSensitive := []string{
		"request_id",
		"user_id",
		"order_id",
		"market_event_id",
		"symbol",
		"feed_state",
		"last_tick",
		"latency",
		"db_latency",
		"redis_latency",
		"quantity",
		"price_paise",
	}

	for _, k := range sensitive {
		assert.True(t, logger.IsSensitiveKey(k), "expected %s to be classified as sensitive", k)
	}

	for _, k := range nonSensitive {
		assert.False(t, logger.IsSensitiveKey(k), "expected %s to NOT be classified as sensitive", k)
	}
}

func TestSanitizingCore_ZeroLeakGuarantee(t *testing.T) {
	buf := &bytes.Buffer{}
	encCfg := zap.NewProductionEncoderConfig()
	encCfg.TimeKey = "ts"
	encoder := zapcore.NewJSONEncoder(encCfg)
	syncer := zapcore.AddSync(buf)
	baseCore := zapcore.NewCore(encoder, syncer, zapcore.DebugLevel)
	sanitizedCore := logger.NewSanitizingCore(baseCore)
	l := zap.New(sanitizedCore)

	jwtSecret := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiZGhpcmFqIn0.abc1234567890abcdefghijklmnopqrstuvwxyz"
	passwordVal := "P@ssw0rd98765!!"
	apiKeyVal := "angel_api_secret_key_111"

	l.Info("User login attempt",
		zap.String("authorization", "Bearer "+jwtSecret),
		zap.String("password", passwordVal),
		zap.String("api_key", apiKeyVal),
		zap.String("error_msg", "Failed auth with token "+jwtSecret),
		zap.String("user_id", "usr_12345"),
		zap.String("request_id", "req_abc999"),
	)

	logged := buf.String()

	// Guarantee zero leakage of sensitive values
	assert.NotContains(t, logged, jwtSecret, "JWT must NEVER appear in output log")
	assert.NotContains(t, logged, passwordVal, "Password must NEVER appear in output log")
	assert.NotContains(t, logged, apiKeyVal, "API Key must NEVER appear in output log")

	// Parse JSON to verify field structure
	var record map[string]interface{}
	err := json.Unmarshal([]byte(strings.TrimSpace(logged)), &record)
	require.NoError(t, err)

	assert.Equal(t, "[REDACTED]", record["authorization"])
	assert.Equal(t, "[REDACTED]", record["password"])
	assert.Equal(t, "[REDACTED]", record["api_key"])
	assert.Equal(t, "Failed auth with token [REDACTED_JWT]", record["error_msg"])
	assert.Equal(t, "usr_12345", record["user_id"])
	assert.Equal(t, "req_abc999", record["request_id"])
}

func TestStructuredFieldConstructors(t *testing.T) {
	reqID := logger.RequestID("req_101")
	assert.Equal(t, "request_id", reqID.Key)
	assert.Equal(t, "req_101", reqID.String)

	userID := logger.UserID("usr_202")
	assert.Equal(t, "user_id", userID.Key)
	assert.Equal(t, "usr_202", userID.String)

	orderID := logger.OrderID("ord_303")
	assert.Equal(t, "order_id", orderID.Key)
	assert.Equal(t, "ord_303", orderID.String)

	eventID := logger.MarketEventID("mkt_404")
	assert.Equal(t, "market_event_id", eventID.Key)
	assert.Equal(t, "mkt_404", eventID.String)

	feedState := logger.FeedState("CONNECTED")
	assert.Equal(t, "feed_state", feedState.Key)
	assert.Equal(t, "feed_state", feedState.Key)
	assert.Equal(t, "CONNECTED", feedState.String)

	lastTick := logger.LastTick("2026-09-25T10:00:00Z")
	assert.Equal(t, "last_tick", lastTick.Key)
	assert.Equal(t, "2026-09-25T10:00:00Z", lastTick.String)

	lat := logger.Latency(25 * time.Millisecond)
	assert.Equal(t, "latency", lat.Key)
	assert.Equal(t, int64(25*time.Millisecond), lat.Integer)

	execLat := logger.ExecutionLatency(50 * time.Millisecond)
	assert.Equal(t, "execution_latency", execLat.Key)

	redisLat := logger.RedisLatency(2 * time.Millisecond)
	assert.Equal(t, "redis_latency", redisLat.Key)

	dbLat := logger.DBLatency(5 * time.Millisecond)
	assert.Equal(t, "db_latency", dbLat.Key)
}
