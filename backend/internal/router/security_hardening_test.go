package router

import (
	"bytes"
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/token"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/validation"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// -----------------------------------------------------------------------------
// Test 1: Response Sanitization
// Verifies password hashes, token hashes, and internal secrets are NEVER leaked in JSON.
// -----------------------------------------------------------------------------
func TestSecurity_ResponseSanitization(t *testing.T) {
	// 1. Model User: Password must be suppressed by json:"-"
	user := model.User{
		ID:       101,
		UUID:     uuid.New(),
		Name:     "Trader Pro",
		Email:    "trader@institutional.com",
		Password: "$2a$12$e80yq9j6W9mYh4f0k9z3euK1T4c4F0W2n.y3M5N2g9u1r8v7s4x6a", // bcrypt hash
	}

	userBytes, err := json.Marshal(user)
	if err != nil {
		t.Fatalf("failed to marshal user: %v", err)
	}
	userJSON := string(userBytes)

	if strings.Contains(userJSON, "Password") || strings.Contains(userJSON, "password") || strings.Contains(userJSON, user.Password) {
		t.Fatalf("CRITICAL SECURITY ERROR: User password hash leaked in serialized JSON: %s", userJSON)
	}

	// 2. Model RefreshSession: TokenHash and JTI must be suppressed by json:"-"
	session := model.RefreshSession{
		ID:        5,
		UUID:      uuid.New(),
		UserUUID:  user.UUID,
		TokenHash: "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890",
		JTI:       uuid.NewString(),
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
	}

	sessionBytes, err := json.Marshal(session)
	if err != nil {
		t.Fatalf("failed to marshal refresh session: %v", err)
	}
	sessionJSON := string(sessionBytes)

	if strings.Contains(sessionJSON, "TokenHash") || strings.Contains(sessionJSON, "token_hash") || strings.Contains(sessionJSON, session.TokenHash) {
		t.Fatalf("CRITICAL SECURITY ERROR: TokenHash leaked in serialized JSON: %s", sessionJSON)
	}
	if strings.Contains(sessionJSON, "JTI") || strings.Contains(sessionJSON, "jti") || strings.Contains(sessionJSON, session.JTI) {
		t.Fatalf("CRITICAL SECURITY ERROR: JTI leaked in serialized JSON: %s", sessionJSON)
	}
}

// -----------------------------------------------------------------------------
// Test 2: Strict CORS Allowlist & Spoofed Origin Rejection
// -----------------------------------------------------------------------------
func TestSecurity_StrictCORS_Allowlist(t *testing.T) {
	gin.SetMode(gin.TestMode)
	validation.Register()

	cfg := &config.Config{
		AppEnv:             "production",
		CORSAllowedOrigins: "https://stock-simulator.vercel.app,https://paper-trade.internal.com",
		JWTSecret:          "security-prod-secret-32-chars-at-least!",
	}

	r := Setup(context.Background(), cfg)

	// A. Valid origin preflight receives 204 with exact allowed origin
	reqOpt := httptest.NewRequest(http.MethodOptions, "/api/v1/stocks", nil)
	reqOpt.Header.Set("Origin", "https://stock-simulator.vercel.app")
	wOpt := httptest.NewRecorder()
	r.ServeHTTP(wOpt, reqOpt)

	if wOpt.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for allowed origin preflight, got %d", wOpt.Code)
	}
	if wOpt.Header().Get("Access-Control-Allow-Origin") != "https://stock-simulator.vercel.app" {
		t.Fatalf("expected Access-Control-Allow-Origin to match, got %s", wOpt.Header().Get("Access-Control-Allow-Origin"))
	}
	if wOpt.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Fatalf("expected credentials header")
	}

	// B. Spoofed origin (suffix attack: https://stock-simulator.vercel.app.attacker.com)
	reqSpoofed := httptest.NewRequest(http.MethodGet, "/api/v1/stocks", nil)
	reqSpoofed.Header.Set("Origin", "https://stock-simulator.vercel.app.attacker.com")
	wSpoofed := httptest.NewRecorder()
	r.ServeHTTP(wSpoofed, reqSpoofed)

	if wSpoofed.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for spoofed origin, got %d", wSpoofed.Code)
	}

	// C. Completely unauthorized origin
	reqEvil := httptest.NewRequest(http.MethodGet, "/api/v1/stocks", nil)
	reqEvil.Header.Set("Origin", "https://evil-hacker.com")
	wEvil := httptest.NewRecorder()
	r.ServeHTTP(wEvil, reqEvil)

	if wEvil.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for evil-hacker.com, got %d", wEvil.Code)
	}
}

// -----------------------------------------------------------------------------
// Test 3: Transactional Refresh Token Rotation with JTI Tracking & Reuse Detection
// -----------------------------------------------------------------------------
func TestSecurity_RefreshTokenRotation_And_ReuseDetection(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgres://postgres:postgres@127.0.0.1:5433/testdb?sslmode=disable"
	}

	conn, err := net.DialTimeout("tcp", "127.0.0.1:5433", 50*time.Millisecond)
	if err != nil && os.Getenv("TEST_DATABASE_URL") == "" {
		t.Skipf("PostgreSQL not accessible at 127.0.0.1:5433 (%v); skipping integration test", err)
	}
	if conn != nil {
		_ = conn.Close()
	}

	jwtSecret := "security-hardening-test-secret-32-chars-long!"
	cfg := &config.Config{
		DatabaseURL:        databaseURL,
		JWTSecret:          jwtSecret,
		CORSAllowedOrigins: "http://localhost:3000",
	}

	if err := database.Connect(cfg); err != nil {
		t.Fatalf("failed to connect to test DB: %v", err)
	}
	db := database.GetDB()
	_ = db.AutoMigrate(&model.User{}, &model.RefreshSession{}, &model.Wallet{}, &model.WalletTransaction{})

	r := Setup(context.Background(), cfg)

	// 1. Register a test user
	userEmail := "sec-test-" + uuid.NewString()[:8] + "@domain.com"
	regPayload := `{"name":"Security Tester","email":"` + userEmail + `","password":"Password123!"}`
	wReg := httptest.NewRecorder()
	reqReg := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", strings.NewReader(regPayload))
	reqReg.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(wReg, reqReg)

	if wReg.Code != http.StatusCreated && wReg.Code != http.StatusOK {
		t.Fatalf("failed to register user: %d, %s", wReg.Code, wReg.Body.String())
	}

	// 2. Login to obtain access token & initial refresh token
	loginPayload := `{"email":"` + userEmail + `","password":"Password123!"}`
	wLog := httptest.NewRecorder()
	reqLog := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(loginPayload))
	reqLog.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(wLog, reqLog)

	if wLog.Code != http.StatusOK {
		t.Fatalf("failed to login: %d, %s", wLog.Code, wLog.Body.String())
	}

	var logResp struct {
		Success bool `json:"success"`
		Data    struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(wLog.Body.Bytes(), &logResp); err != nil {
		t.Fatalf("failed to parse login response: %v", err)
	}

	firstRefreshToken := logResp.Data.RefreshToken
	firstClaims, err := token.Parse(jwtSecret, firstRefreshToken)
	if err != nil {
		t.Fatalf("failed to parse first refresh token: %v", err)
	}
	firstJTI := firstClaims.ID
	if firstJTI == "" {
		t.Fatal("expected non-empty JTI in first refresh token claims")
	}

	// Verify session in DB has first JTI
	var firstSession model.RefreshSession
	if err := db.Where("jti = ?", firstJTI).First(&firstSession).Error; err != nil {
		t.Fatalf("first refresh session not found in DB with JTI %s: %v", firstJTI, err)
	}
	if firstSession.RevokedAt != nil {
		t.Fatal("initial refresh session should not be revoked")
	}

	// 3. Rotate refresh token: call POST /api/v1/auth/refresh
	refPayload := `{"refresh_token":"` + firstRefreshToken + `"}`
	wRef := httptest.NewRecorder()
	reqRef := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", strings.NewReader(refPayload))
	reqRef.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(wRef, reqRef)

	if wRef.Code != http.StatusOK {
		t.Fatalf("failed to rotate refresh token: %d, %s", wRef.Code, wRef.Body.String())
	}

	var refResp struct {
		Success bool `json:"success"`
		Data    struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(wRef.Body.Bytes(), &refResp); err != nil {
		t.Fatalf("failed to parse refresh response: %v", err)
	}

	secondRefreshToken := refResp.Data.RefreshToken
	secondClaims, err := token.Parse(jwtSecret, secondRefreshToken)
	if err != nil {
		t.Fatalf("failed to parse second refresh token: %v", err)
	}
	secondJTI := secondClaims.ID
	if secondJTI == "" || secondJTI == firstJTI {
		t.Fatalf("expected new unique JTI in second refresh token, got: %s (old: %s)", secondJTI, firstJTI)
	}

	// Verify first session is now marked revoked in DB
	var oldSessionCheck model.RefreshSession
	if err := db.Where("jti = ?", firstJTI).First(&oldSessionCheck).Error; err != nil {
		t.Fatalf("failed to check old session: %v", err)
	}
	if oldSessionCheck.RevokedAt == nil {
		t.Fatal("old session must have RevokedAt timestamp set after rotation")
	}

	// Verify new session is active in DB
	var newSessionCheck model.RefreshSession
	if err := db.Where("jti = ?", secondJTI).First(&newSessionCheck).Error; err != nil {
		t.Fatalf("failed to find new rotated session in DB: %v", err)
	}
	if newSessionCheck.RevokedAt != nil {
		t.Fatal("new rotated session must be active (RevokedAt == nil)")
	}

	// 4. REUSE DETECTION ATTACK: Present the old/compromised firstRefreshToken again!
	wAttack := httptest.NewRecorder()
	reqAttack := httptest.NewRequest(http.MethodPost, "/api/v1/auth/refresh", strings.NewReader(refPayload))
	reqAttack.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(wAttack, reqAttack)

	// Must be rejected!
	if wAttack.Code == http.StatusOK {
		t.Fatalf("CRITICAL SECURITY VULNERABILITY: Revoked refresh token was accepted by server!")
	}

	// Verify that ALL sessions for this user were revoked due to the reuse attack!
	var activeSessionsCount int64
	db.Model(&model.RefreshSession{}).
		Where("user_uuid = ? AND revoked_at IS NULL", firstSession.UserUUID).
		Count(&activeSessionsCount)

	if activeSessionsCount != 0 {
		t.Fatalf("CRITICAL SECURITY ERROR: After token reuse attack, active sessions count should be 0, got %d", activeSessionsCount)
	}
}

// -----------------------------------------------------------------------------
// Test 4: Redis Token Bucket Rate Limiting
// -----------------------------------------------------------------------------
func TestSecurity_TokenBucketRateLimiting(t *testing.T) {
	redisURL := os.Getenv("TEST_REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://127.0.0.1:6380/0"
	}

	cfg := &config.Config{
		JWTSecret:                "security-hardening-test-secret-32-chars-long!",
		CORSAllowedOrigins:       "http://localhost:3000",
		RateLimitEnabled:         true,
		RateLimitWindow:          10 * time.Second,
		RateLimitMaxRequests:     5, // Burst capacity = 5
		AuthRateLimitMaxRequests: 3, // Burst capacity = 3 for auth
		RedisURL:                 redisURL,
		RedisOperationTimeout:    2 * time.Second,
	}

	r := Setup(context.Background(), cfg)

	// Fire 3 requests to /api/v1/auth/login with random IP
	clientIP := "198.51.100." + uuid.NewString()[:2]
	loginPayload := `{"email":"fake@user.com","password":"Password123!"}`

	for i := 1; i <= 3; i++ {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader([]byte(loginPayload)))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Forwarded-For", clientIP)
		r.ServeHTTP(w, req)

		// First 3 should not be rate-limited (they might return 401 or 400, but not 429)
		if w.Code == http.StatusTooManyRequests {
			t.Fatalf("request %d was unexpectedly rate limited (HTTP 429)", i)
		}
		if w.Header().Get("X-RateLimit-Limit") != "3" {
			t.Logf("X-RateLimit-Limit header: %s", w.Header().Get("X-RateLimit-Limit"))
		}
	}

	// 4th request from same IP must exceed capacity and get 429 Too Many Requests
	wBlocked := httptest.NewRecorder()
	reqBlocked := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader([]byte(loginPayload)))
	reqBlocked.Header.Set("Content-Type", "application/json")
	reqBlocked.Header.Set("X-Forwarded-For", clientIP)
	r.ServeHTTP(wBlocked, reqBlocked)

	if wBlocked.Code != http.StatusTooManyRequests {
		t.Fatalf("expected HTTP 429 Too Many Requests on 4th request exceeding capacity, got %d (body: %s)", wBlocked.Code, wBlocked.Body.String())
	}

	retryAfter := wBlocked.Header().Get("Retry-After")
	if retryAfter == "" || retryAfter == "0" {
		t.Fatalf("expected non-zero Retry-After header on rate limited response, got: %s", retryAfter)
	}
}
