package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/ai/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func setupTestRouter() (*gin.Engine, *MentorHandler) {
	cfg := &config.Config{
		GeminiAPIKey: "",
		GeminiModel:  "gemini-2.0-flash",
	}
	h := New(cfg)

	r := gin.New()
	r.Use(func(c *gin.Context) {
		// Mock auth middleware injecting user_id
		if userID := c.GetHeader("X-Test-User-ID"); userID != "" {
			c.Set("user_id", userID)
		}
		c.Next()
	})

	r.POST("/api/v1/ai/analyze-trade", h.Analyze)
	r.POST("/api/v1/ai/trade-critique", h.Critique)
	r.POST("/api/v1/ai/pretrade-check", h.PreTradeCheck)

	return r, h
}

func TestMentorHandler_Analyze(t *testing.T) {
	r, _ := setupTestRouter()

	t.Run("Valid question returns 200 educational response", func(t *testing.T) {
		reqBody, _ := json.Marshal(dto.MentorRequest{
			Question: "What happens during 15:20 MIS square-off?",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/ai/analyze-trade", bytes.NewReader(reqBody))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Test-User-ID", "31372e69-2088-45d8-a2d8-8607a58e3685")
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d (body: %s)", w.Code, w.Body.String())
		}

		var res struct {
			Success bool               `json:"success"`
			Data    dto.MentorResponse `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to parse JSON response: %v", err)
		}
		if !res.Success || res.Data.Answer == "" {
			t.Fatalf("expected successful answer, got %+v", res)
		}
	})

	t.Run("Short question (< 5 chars) returns 400 Bad Request", func(t *testing.T) {
		reqBody, _ := json.Marshal(dto.MentorRequest{
			Question: "Hi",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/ai/analyze-trade", bytes.NewReader(reqBody))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request, got %d", w.Code)
		}
	})
}

func TestMentorHandler_Critique(t *testing.T) {
	r, _ := setupTestRouter()

	t.Run("Authorized request returns 200 with structured trade critique", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/ai/trade-critique", nil)
		req.Header.Set("X-Test-User-ID", "31372e69-2088-45d8-a2d8-8607a58e3685")
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d (body: %s)", w.Code, w.Body.String())
		}

		var res struct {
			Success bool                      `json:"success"`
			Data    dto.TradeCritiqueResponse `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to parse JSON response: %v", err)
		}

		if !res.Success {
			t.Fatalf("expected success true, got false")
		}
		if res.Data.DisciplineScore <= 0 || res.Data.DisciplineScore > 100 {
			t.Errorf("expected discipline score in 1..100, got %d", res.Data.DisciplineScore)
		}
		if res.Data.Grade == "" {
			t.Errorf("expected non-empty grade")
		}
		if len(res.Data.BehavioralFlags) == 0 {
			t.Errorf("expected at least one behavioral flag")
		}
	})

	t.Run("Missing user_id returns 401 Unauthorized", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/ai/trade-critique", nil)
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 Unauthorized, got %d", w.Code)
		}
	})
}

func TestMentorHandler_PreTradeCheck(t *testing.T) {
	r, _ := setupTestRouter()

	t.Run("Valid pretrade check returns 200 risk evaluation", func(t *testing.T) {
		reqBody, _ := json.Marshal(dto.PreTradeCheckRequest{
			Symbol:        "RELIANCE",
			Side:          "BUY",
			Product:       "INTRADAY",
			Type:          "LIMIT",
			Quantity:      25,
			PricePaise:    298550, // ₹2,985.50
			StopLossPaise: 294000,
			TargetPaise:   306000,
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/ai/pretrade-check", bytes.NewReader(reqBody))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Test-User-ID", "31372e69-2088-45d8-a2d8-8607a58e3685")
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d (body: %s)", w.Code, w.Body.String())
		}

		var res struct {
			Success bool                      `json:"success"`
			Data    dto.PreTradeCheckResponse `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to parse JSON response: %v", err)
		}
		if !res.Success || res.Data.RiskScore == 0 {
			t.Fatalf("expected valid risk analysis result, got %+v", res)
		}
		if res.Data.RiskRewardRatio <= 0 {
			t.Errorf("expected positive risk reward ratio, got %.2f", res.Data.RiskRewardRatio)
		}
	})

	t.Run("Invalid parameters return 400 Bad Request", func(t *testing.T) {
		// Missing symbol and negative quantity
		reqBody, _ := json.Marshal(map[string]interface{}{
			"side":     "BUY",
			"quantity": -5,
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/ai/pretrade-check", bytes.NewReader(reqBody))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Test-User-ID", "31372e69-2088-45d8-a2d8-8607a58e3685")
		w := httptest.NewRecorder()

		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request, got %d", w.Code)
		}
	})
}
