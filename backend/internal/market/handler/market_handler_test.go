package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func setupTestRouter(svc *service.Service) *gin.Engine {
	h := &Handler{service: svc}
	r := gin.New()
	r.GET("/api/v1/market/quote/:symbol", h.Quote)
	r.GET("/api/v1/market/history/:symbol", h.History)
	return r
}

func TestMarketHandler_ErrorSemantics(t *testing.T) {
	t.Run("Returns 404 INSTRUMENT_NOT_FOUND for unknown instruments", func(t *testing.T) {
		svc := &service.Service{}
		svc.SetInstrumentFinder(func(symbol string) (bool, error) {
			return false, nil
		})
		r := setupTestRouter(svc)

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/api/v1/market/quote/UNKNOWN_XYZ", nil)
		r.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected status 404, got %d. Body: %s", w.Code, w.Body.String())
		}

		var apiResp response.APIResponse
		if err := json.Unmarshal(w.Body.Bytes(), &apiResp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if apiResp.Success {
			t.Fatal("expected success=false")
		}
		if apiResp.Errors != "INSTRUMENT_NOT_FOUND" {
			t.Fatalf("expected error code INSTRUMENT_NOT_FOUND, got %v", apiResp.Errors)
		}
	})

	t.Run("Returns 404 QUOTE_NOT_FOUND when quote is missing from cache and worker", func(t *testing.T) {
		// Mock worker returning 404
		workerServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.NotFound(w, r)
		}))
		defer workerServer.Close()

		svc, err := service.New("redis://localhost:6379/0", 100*time.Millisecond)
		if err != nil {
			t.Skipf("skipping Redis-dependent handler test: %v", err)
		}
		if svc.Client() == nil || svc.Client().Ping(t.Context()).Err() != nil {
			t.Skip("skipping Redis-dependent handler test: local Redis is not reachable")
		}
		svc.SetWorkerURL(workerServer.URL)
		svc.SetInstrumentFinder(func(symbol string) (bool, error) {
			return true, nil // Known instrument, but quote missing
		})

		r := setupTestRouter(svc)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/api/v1/market/quote/NON_EXISTENT_QUOTE_KEY_12345", nil)
		r.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected status 404, got %d. Body: %s", w.Code, w.Body.String())
		}

		var apiResp response.APIResponse
		if err := json.Unmarshal(w.Body.Bytes(), &apiResp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if apiResp.Errors != "QUOTE_NOT_FOUND" {
			t.Fatalf("expected error code QUOTE_NOT_FOUND, got %v", apiResp.Errors)
		}
	})

	t.Run("Returns 422 QUOTE_STALE when quote is older than 2 minutes", func(t *testing.T) {
		svc, err := service.New("redis://localhost:6379/0", 100*time.Millisecond)
		if err != nil || svc.Client() == nil || svc.Client().Ping(t.Context()).Err() != nil {
			t.Skip("skipping Redis-dependent handler test: local Redis is not reachable")
		}
		staleSym := "STALE_HANDLER_SYM"
		staleTime := time.Now().Add(-5 * time.Minute).UTC().Format(time.RFC3339)
		_ = svc.Client().HSet(t.Context(), "market:quote:"+staleSym, map[string]interface{}{
			"price_paise": "123400",
			"source":      "angelone_live",
			"updated_at":  staleTime,
		}).Err()
		defer svc.Client().Del(t.Context(), "market:quote:"+staleSym)

		r := setupTestRouter(svc)
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/api/v1/market/quote/"+staleSym, nil)
		r.ServeHTTP(w, req)

		if w.Code != http.StatusUnprocessableEntity {
			t.Fatalf("expected status 422, got %d. Body: %s", w.Code, w.Body.String())
		}

		var apiResp response.APIResponse
		if err := json.Unmarshal(w.Body.Bytes(), &apiResp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if apiResp.Errors != "QUOTE_STALE" {
			t.Fatalf("expected error code QUOTE_STALE, got %v", apiResp.Errors)
		}
	})

	t.Run("Returns 503 MARKET_DATA_UNAVAILABLE when market service is disconnected", func(t *testing.T) {
		svc := &service.Service{} // nil client
		r := setupTestRouter(svc)

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/api/v1/market/quote/RELIANCE", nil)
		r.ServeHTTP(w, req)

		if w.Code != http.StatusServiceUnavailable {
			t.Fatalf("expected status 503, got %d. Body: %s", w.Code, w.Body.String())
		}

		var apiResp response.APIResponse
		if err := json.Unmarshal(w.Body.Bytes(), &apiResp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if apiResp.Errors != "MARKET_DATA_UNAVAILABLE" {
			t.Fatalf("expected error code MARKET_DATA_UNAVAILABLE, got %v", apiResp.Errors)
		}
	})

	t.Run("History returns 404 INSTRUMENT_NOT_FOUND for unknown instruments", func(t *testing.T) {
		svc := &service.Service{}
		svc.SetInstrumentFinder(func(symbol string) (bool, error) {
			return false, nil
		})
		r := setupTestRouter(svc)

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/api/v1/market/history/UNKNOWN_XYZ", nil)
		r.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected status 404, got %d. Body: %s", w.Code, w.Body.String())
		}

		var apiResp response.APIResponse
		if err := json.Unmarshal(w.Body.Bytes(), &apiResp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if apiResp.Errors != "INSTRUMENT_NOT_FOUND" {
			t.Fatalf("expected error code INSTRUMENT_NOT_FOUND, got %v", apiResp.Errors)
		}
	})

	t.Run("History returns 503 MARKET_DATA_UNAVAILABLE when market service is disconnected", func(t *testing.T) {
		svc := &service.Service{}
		r := setupTestRouter(svc)

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/api/v1/market/history/RELIANCE", nil)
		r.ServeHTTP(w, req)

		if w.Code != http.StatusServiceUnavailable {
			t.Fatalf("expected status 503, got %d. Body: %s", w.Code, w.Body.String())
		}

		var apiResp response.APIResponse
		if err := json.Unmarshal(w.Body.Bytes(), &apiResp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if apiResp.Errors != "MARKET_DATA_UNAVAILABLE" {
			t.Fatalf("expected error code MARKET_DATA_UNAVAILABLE, got %v", apiResp.Errors)
		}
	})
}
