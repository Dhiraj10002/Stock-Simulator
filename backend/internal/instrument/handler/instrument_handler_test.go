package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/service"
	"github.com/gin-gonic/gin"
)

type apiResponse struct {
	Success bool                     `json:"success"`
	Message string                   `json:"message"`
	Data    []dto.InstrumentResponse `json:"data"`
}

type singleApiResponse struct {
	Success bool                 `json:"success"`
	Message string               `json:"message"`
	Data    dto.InstrumentResponse `json:"data"`
}

func TestInstrumentHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := service.NewService(nil) // in-memory fallback
	h := NewWithService(svc)

	r := gin.New()
	r.GET("/api/v1/instruments", h.List)
	r.GET("/api/v1/instruments/:symbol", h.GetBySymbol)

	t.Run("List returns canonical instruments with authoritative identity", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/instruments", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp apiResponse
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if len(resp.Data) == 0 {
			t.Fatal("expected non-empty instruments list")
		}

		// Verify canonical identity fields exist on each item
		for _, inst := range resp.Data {
			if inst.ID == 0 {
				t.Errorf("instrument %s missing id", inst.Symbol)
			}
			if inst.Symbol == "" {
				t.Error("instrument missing symbol")
			}
			if inst.DisplaySymbol == "" {
				t.Errorf("instrument %s missing display_symbol", inst.Symbol)
			}
			if inst.Exchange == "" {
				t.Errorf("instrument %s missing exchange", inst.Symbol)
			}
			if inst.Token == "" {
				t.Errorf("instrument %s missing token", inst.Symbol)
			}
			if inst.InstrumentType == "" {
				t.Errorf("instrument %s missing instrument_type", inst.Symbol)
			}
			if inst.Underlying == "" {
				t.Errorf("instrument %s missing underlying", inst.Symbol)
			}
			if inst.LotSize <= 0 {
				t.Errorf("instrument %s lot_size <= 0: %d", inst.Symbol, inst.LotSize)
			}
			if inst.TickSize <= 0 {
				t.Errorf("instrument %s tick_size <= 0: %f", inst.Symbol, inst.TickSize)
			}
			if !inst.Active {
				t.Errorf("expected active to be true for %s", inst.Symbol)
			}
		}
	})

	t.Run("Filter by query q", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/instruments?q=RELIANCE", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		var resp apiResponse
		_ = json.Unmarshal(w.Body.Bytes(), &resp)

		if len(resp.Data) == 0 {
			t.Fatal("expected matches for RELIANCE")
		}
		for _, inst := range resp.Data {
			if inst.Underlying != "RELIANCE" && inst.Symbol != "RELIANCE" {
				t.Errorf("unexpected instrument in RELIANCE search: %s", inst.Symbol)
			}
		}
	})

	t.Run("GetBySymbol returns single canonical instrument", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/instruments/NIFTY", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp singleApiResponse
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if resp.Data.Symbol != "NIFTY" {
			t.Errorf("expected NIFTY, got %s", resp.Data.Symbol)
		}
		if resp.Data.LotSize != 25 {
			t.Errorf("expected NIFTY lot_size 25, got %d", resp.Data.LotSize)
		}
		if resp.Data.InstrumentType != "INDEX" {
			t.Errorf("expected INDEX, got %s", resp.Data.InstrumentType)
		}
	})

	t.Run("GetBySymbol returns 404 for unknown instrument", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/instruments/UNKNOWN_NON_EXISTENT", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected 404, got %d", w.Code)
		}
	})
}
