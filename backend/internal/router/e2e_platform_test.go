package router

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/token"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/google/uuid"
)

func TestE2E_FullPlatformSuite(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	jwtSecret := "e2e_test_super_secret_jwt_key_12345"
	cfg := &config.Config{
		CORSAllowedOrigins: "http://localhost:3000",
		JWTSecret:          jwtSecret,
		GeminiAPIKey:       "", // tests offline rule-based fallback
		GeminiModel:        "gemini-2.0-flash",
	}

	appRouter := Setup(ctx, cfg)

	// 1. Health Check
	t.Run("1. GET /api/v1/health returns 200 with X-Request-ID", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
		rec := httptest.NewRecorder()
		appRouter.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		if rec.Header().Get("X-Request-ID") == "" {
			t.Fatal("expected X-Request-ID header")
		}
	})

	// 2. Unauthenticated Access Protection
	t.Run("2. Protected endpoints reject requests without token", func(t *testing.T) {
		endpoints := []struct {
			method string
			path   string
		}{
			{http.MethodGet, "/api/v1/wallet"},
			{http.MethodGet, "/api/v1/wallet/transactions"},
			{http.MethodGet, "/api/v1/portfolio"},
			{http.MethodGet, "/api/v1/orders"},
			{http.MethodPost, "/api/v1/ai/trade-critique"},
			{http.MethodPost, "/api/v1/ai/analyze-trade"},
		}

		for _, ep := range endpoints {
			req := httptest.NewRequest(ep.method, ep.path, nil)
			rec := httptest.NewRecorder()
			appRouter.ServeHTTP(rec, req)

			if rec.Code != http.StatusUnauthorized {
				t.Errorf("expected 401 for %s %s, got %d", ep.method, ep.path, rec.Code)
			}
		}
	})

	// 3. User Session Token Generation
	testUserID := uuid.NewString()
	userToken, err := token.GenerateAccessToken(jwtSecret, testUserID)
	if err != nil {
		t.Fatalf("failed to generate test access token: %v", err)
	}

	// 4. AI Trade Copilot Analysis (Offline Rule-Based Validation)
	t.Run("3. POST /api/v1/ai/analyze-trade answers educational prompts", func(t *testing.T) {
		payload := `{"question":"How do 15:20 MIS intraday square-offs work?"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/ai/analyze-trade", strings.NewReader(payload))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+userToken)
		rec := httptest.NewRecorder()
		appRouter.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}

		var body struct {
			Success bool `json:"success"`
			Data    struct {
				Answer string `json:"answer"`
			} `json:"data"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("failed to parse response JSON: %v", err)
		}
		if !body.Success || !strings.Contains(body.Data.Answer, "MIS") {
			t.Errorf("expected educational answer containing 'MIS', got %s", body.Data.Answer)
		}
	})

	// 5. AI Post-Mortem Trade Critique
	t.Run("4. POST /api/v1/ai/trade-critique evaluates user discipline", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/ai/trade-critique", nil)
		req.Header.Set("Authorization", "Bearer "+userToken)
		rec := httptest.NewRecorder()
		appRouter.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}

		var body struct {
			Success bool `json:"success"`
			Data    struct {
				DisciplineScore int    `json:"discipline_score"`
				RiskRating      string `json:"risk_rating"`
				Critique        string `json:"critique"`
			} `json:"data"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("failed to parse response JSON: %v", err)
		}
		if !body.Success {
			t.Fatalf("expected success: true")
		}
		if body.Data.DisciplineScore < 10 || body.Data.DisciplineScore > 100 {
			t.Errorf("expected discipline score in [10, 100], got %d", body.Data.DisciplineScore)
		}
		if body.Data.RiskRating == "" {
			t.Errorf("expected non-empty risk rating")
		}
	})

	// 5b. AI Pre-Trade Risk Check
	t.Run("4b. POST /api/v1/ai/pretrade-check assesses order risk", func(t *testing.T) {
		payload := strings.NewReader(`{
			"symbol": "RELIANCE",
			"side": "BUY",
			"product": "INTRADAY",
			"type": "MARKET",
			"quantity": 100,
			"price_paise": 125000
		}`)
		req := httptest.NewRequest(http.MethodPost, "/api/v1/ai/pretrade-check", payload)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+userToken)
		rec := httptest.NewRecorder()
		appRouter.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}

		var body struct {
			Success bool `json:"success"`
			Data    struct {
				RiskLevel           string   `json:"risk_level"`
				RequiredMarginPaise int64    `json:"required_margin_paise"`
				Warnings            []string `json:"warnings"`
				Advice              string   `json:"advice"`
			} `json:"data"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("failed to parse response JSON: %v", err)
		}
		if !body.Success {
			t.Fatalf("expected success: true")
		}
		if body.Data.RequiredMarginPaise != 2500000 {
			t.Errorf("expected 2500000 paise required margin, got %d", body.Data.RequiredMarginPaise)
		}
		if len(body.Data.Warnings) == 0 {
			t.Errorf("expected warnings for 100 qty market order")
		}
	})

	// 6. Invalid Registration Validation
	t.Run("5. POST /api/v1/auth/register validates inputs before execution", func(t *testing.T) {
		invalidPayloads := []string{
			`{"email":"invalid-email","password":"123","name":""}`,
			`{"email":"test@example.com","password":"","name":"Test"}`,
			`{"email":"","password":"password123","name":"Test"}`,
		}

		for _, payload := range invalidPayloads {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", strings.NewReader(payload))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			appRouter.ServeHTTP(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Errorf("expected 400 for payload %s, got %d", payload, rec.Code)
			}
		}
	})

	// 7. Order Validation Invariants
	t.Run("6. POST /api/v1/orders rejects invalid order requests", func(t *testing.T) {
		invalidOrders := []string{
			`{"symbol":"","side":"BUY","type":"MARKET","product":"DELIVERY","quantity":0}`,
			`{"symbol":"RELIANCE","side":"INVALID","type":"MARKET","product":"DELIVERY","quantity":1}`,
			`{"symbol":"RELIANCE","side":"BUY","type":"INVALID","product":"DELIVERY","quantity":1}`,
			`{"symbol":"RELIANCE","side":"BUY","type":"MARKET","product":"INVALID","quantity":1}`,
		}

		for _, payload := range invalidOrders {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/orders", strings.NewReader(payload))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+userToken)
			rec := httptest.NewRecorder()
			appRouter.ServeHTTP(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Errorf("expected 400 for order payload %s, got %d", payload, rec.Code)
			}
		}
	})
}
