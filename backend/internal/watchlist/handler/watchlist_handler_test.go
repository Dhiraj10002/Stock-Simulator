package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func TestIsCanonicalSymbol(t *testing.T) {
	tests := []struct {
		symbol   string
		expected bool
	}{
		{"RELIANCE", true},
		{"reliance", true},
		{"TCS", true},
		{"INFY", true},
		{"HDFCBANK", true},
		{"RELIANCE-EQ", true},
		{"NON_EXISTENT_XYZ_123", false},
		{"", false},
		{"   ", false},
	}

	for _, tt := range tests {
		t.Run(tt.symbol, func(t *testing.T) {
			got := isCanonicalSymbol(tt.symbol)
			if got != tt.expected {
				t.Errorf("isCanonicalSymbol(%q) = %v; want %v", tt.symbol, got, tt.expected)
			}
		})
	}
}

func TestWatchlistHandler_Validation(t *testing.T) {
	h := New()
	r := gin.New()
	userID := uuid.New().String()

	r.Use(func(c *gin.Context) {
		c.Set("user_id", userID)
		c.Next()
	})

	r.POST("/api/v1/watchlist", h.Add)
	r.DELETE("/api/v1/watchlist/:symbol", h.Remove)
	r.GET("/api/v1/watchlist", h.List)

	t.Run("Rejects non-canonical instrument with 404 INSTRUMENT_NOT_FOUND", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"symbol": "FABRICATED_CO_XYZ"})
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/v1/watchlist", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected status 404 for fabricated symbol, got %d. Body: %s", w.Code, w.Body.String())
		}

		var apiResp response.APIResponse
		_ = json.Unmarshal(w.Body.Bytes(), &apiResp)
		if apiResp.Errors != "INSTRUMENT_NOT_FOUND" {
			t.Fatalf("expected error INSTRUMENT_NOT_FOUND, got %v", apiResp.Errors)
		}
	})

	t.Run("Rejects empty symbol with 400 Bad Request", func(t *testing.T) {
		body, _ := json.Marshal(map[string]string{"symbol": ""})
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/v1/watchlist", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400 for empty symbol, got %d", w.Code)
		}
	})

	t.Run("Rejects missing user identity with 400 Bad Request", func(t *testing.T) {
		unauthedRouter := gin.New()
		unauthedRouter.POST("/api/v1/watchlist", h.Add)

		body, _ := json.Marshal(map[string]string{"symbol": "RELIANCE"})
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/v1/watchlist", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		unauthedRouter.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400 for missing user_id, got %d", w.Code)
		}
	})
}
