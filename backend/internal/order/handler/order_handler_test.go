package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/response"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func setupOrderTestRouter(h *OrderHandler, userID string) *gin.Engine {
	r := gin.New()
	r.POST("/api/v1/orders", func(c *gin.Context) {
		c.Set("user_id", userID)
		h.Create(c)
	})
	return r
}

func TestOrderHandler_ErrorSemantics(t *testing.T) {
	loc := calendar.Location()
	tradingTime := time.Date(2026, 9, 16, 11, 0, 0, 0, loc)
	userID := uuid.New().String()

	cfg := &config.Config{
		MISLeverage:             5,
		FuturesMarginPercent:    20,
		OptionSellMarginPercent: 30,
	}

	t.Run("Returns 404 INSTRUMENT_NOT_FOUND when instrument master lookup fails", func(t *testing.T) {
		h := New(nil, cfg)
		h.Service().SetNowFunc(func() time.Time { return tradingTime })
		h.Service().SetInstrumentFinder(func(symbol string) (*model.Instrument, error) {
			return nil, nil // unknown instrument
		})

		r := setupOrderTestRouter(h, userID)
		body, _ := json.Marshal(dto.CreateOrderRequest{
			Symbol:   "UNKNOWN_STOCK",
			Side:     model.OrderSideBuy,
			Type:     model.OrderTypeMarket,
			Product:  model.OrderProductDelivery,
			Quantity: 10,
		})

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/v1/orders", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected status 404, got %d. Body: %s", w.Code, w.Body.String())
		}

		var apiResp response.APIResponse
		_ = json.Unmarshal(w.Body.Bytes(), &apiResp)
		if apiResp.Errors != "INSTRUMENT_NOT_FOUND" {
			t.Fatalf("expected error code INSTRUMENT_NOT_FOUND, got %v", apiResp.Errors)
		}
	})

	t.Run("Returns 404 QUOTE_NOT_FOUND when market quote is not found", func(t *testing.T) {
		h := New(nil, cfg)
		h.Service().SetNowFunc(func() time.Time { return tradingTime })
		h.Service().SetInstrumentFinder(func(symbol string) (*model.Instrument, error) {
			return &model.Instrument{
				Symbol:          symbol,
				ExchangeSegment: "NSE",
				InstrumentType:  "EQUITY",
				LotSize:         1,
			}, nil
		})
		h.Service().SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
			return nil, marketService.ErrQuoteNotFound
		})

		r := setupOrderTestRouter(h, userID)
		body, _ := json.Marshal(dto.CreateOrderRequest{
			Symbol:   "RELIANCE",
			Side:     model.OrderSideBuy,
			Type:     model.OrderTypeMarket,
			Product:  model.OrderProductDelivery,
			Quantity: 10,
		})

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/v1/orders", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Fatalf("expected status 404, got %d. Body: %s", w.Code, w.Body.String())
		}

		var apiResp response.APIResponse
		_ = json.Unmarshal(w.Body.Bytes(), &apiResp)
		if apiResp.Errors != "QUOTE_NOT_FOUND" {
			t.Fatalf("expected error code QUOTE_NOT_FOUND, got %v", apiResp.Errors)
		}
	})

	t.Run("Returns 400 QUOTE_STALE when market quote is stale", func(t *testing.T) {
		h := New(nil, cfg)
		h.Service().SetNowFunc(func() time.Time { return tradingTime })
		h.Service().SetInstrumentFinder(func(symbol string) (*model.Instrument, error) {
			return &model.Instrument{
				Symbol:          symbol,
				ExchangeSegment: "NSE",
				InstrumentType:  "EQUITY",
				LotSize:         1,
			}, nil
		})
		h.Service().SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
			return nil, marketService.ErrQuoteStale
		})

		r := setupOrderTestRouter(h, userID)
		body, _ := json.Marshal(dto.CreateOrderRequest{
			Symbol:   "RELIANCE",
			Side:     model.OrderSideBuy,
			Type:     model.OrderTypeMarket,
			Product:  model.OrderProductDelivery,
			Quantity: 10,
		})

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/v1/orders", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400, got %d. Body: %s", w.Code, w.Body.String())
		}

		var apiResp response.APIResponse
		_ = json.Unmarshal(w.Body.Bytes(), &apiResp)
		if apiResp.Errors != "QUOTE_STALE" {
			t.Fatalf("expected error code QUOTE_STALE, got %v", apiResp.Errors)
		}
	})

	t.Run("Returns 400 QUOTE_INELIGIBLE when market quote source is ineligible", func(t *testing.T) {
		h := New(nil, cfg)
		h.Service().SetNowFunc(func() time.Time { return tradingTime })
		h.Service().SetInstrumentFinder(func(symbol string) (*model.Instrument, error) {
			return &model.Instrument{
				Symbol:          symbol,
				ExchangeSegment: "NSE",
				InstrumentType:  "EQUITY",
				LotSize:         1,
			}, nil
		})
		h.Service().SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
			return nil, marketService.ErrQuoteIneligible
		})

		r := setupOrderTestRouter(h, userID)
		body, _ := json.Marshal(dto.CreateOrderRequest{
			Symbol:   "RELIANCE",
			Side:     model.OrderSideBuy,
			Type:     model.OrderTypeMarket,
			Product:  model.OrderProductDelivery,
			Quantity: 10,
		})

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/v1/orders", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400, got %d. Body: %s", w.Code, w.Body.String())
		}

		var apiResp response.APIResponse
		_ = json.Unmarshal(w.Body.Bytes(), &apiResp)
		if apiResp.Errors != "QUOTE_INELIGIBLE" {
			t.Fatalf("expected error code QUOTE_INELIGIBLE, got %v", apiResp.Errors)
		}
	})

	t.Run("Returns 503 MARKET_DATA_UNAVAILABLE when market service is down", func(t *testing.T) {
		h := New(nil, cfg)
		h.Service().SetNowFunc(func() time.Time { return tradingTime })
		h.Service().SetInstrumentFinder(func(symbol string) (*model.Instrument, error) {
			return &model.Instrument{
				Symbol:          symbol,
				ExchangeSegment: "NSE",
				InstrumentType:  "EQUITY",
				LotSize:         1,
			}, nil
		})
		h.Service().SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
			return nil, marketService.ErrQuoteUnavailable
		})

		r := setupOrderTestRouter(h, userID)
		body, _ := json.Marshal(dto.CreateOrderRequest{
			Symbol:   "RELIANCE",
			Side:     model.OrderSideBuy,
			Type:     model.OrderTypeMarket,
			Product:  model.OrderProductDelivery,
			Quantity: 10,
		})

		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/v1/orders", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)

		if w.Code != http.StatusServiceUnavailable {
			t.Fatalf("expected status 503, got %d. Body: %s", w.Code, w.Body.String())
		}

		var apiResp response.APIResponse
		_ = json.Unmarshal(w.Body.Bytes(), &apiResp)
		if apiResp.Errors != "MARKET_DATA_UNAVAILABLE" {
			t.Fatalf("expected error code MARKET_DATA_UNAVAILABLE, got %v", apiResp.Errors)
		}
	})
}
