package service

import (
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/google/uuid"
)

func TestOrderService_PreTradeValidationRules(t *testing.T) {
	loc := calendar.Location()
	// Mock time during open market hours (Wednesday 11:00 IST)
	tradingTime := time.Date(2026, 9, 16, 11, 0, 0, 0, loc)

	service := New(nil, &config.Config{
		MISLeverage:             5,
		FuturesMarginPercent:    20,
		OptionSellMarginPercent: 30,
	})
	service.SetNowFunc(func() time.Time { return tradingTime })

	userID := uuid.New().String()

	tests := []struct {
		name    string
		request dto.CreateOrderRequest
		wantErr string
	}{
		{
			name: "Reject empty symbol",
			request: dto.CreateOrderRequest{
				Symbol:     "",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductDelivery,
				Quantity:   10,
				PricePaise: 100000,
			},
			wantErr: "symbol is required",
		},
		{
			name: "Reject invalid order side",
			request: dto.CreateOrderRequest{
				Symbol:     "RELIANCE",
				Side:       "HOLD",
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductDelivery,
				Quantity:   10,
				PricePaise: 100000,
			},
			wantErr: "invalid order side",
		},
		{
			name: "Reject invalid order type",
			request: dto.CreateOrderRequest{
				Symbol:     "RELIANCE",
				Side:       model.OrderSideBuy,
				Type:       "STOP",
				Product:    model.OrderProductDelivery,
				Quantity:   10,
				PricePaise: 100000,
			},
			wantErr: "invalid order type",
		},
		{
			name: "Reject unsupported product",
			request: dto.CreateOrderRequest{
				Symbol:     "RELIANCE",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    "MARGIN_PLUS",
				Quantity:   10,
				PricePaise: 100000,
			},
			wantErr: "unsupported order product",
		},
		{
			name: "Reject zero quantity",
			request: dto.CreateOrderRequest{
				Symbol:     "RELIANCE",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductDelivery,
				Quantity:   0,
				PricePaise: 100000,
			},
			wantErr: "order quantity must be greater than zero",
		},
		{
			name: "Reject negative quantity",
			request: dto.CreateOrderRequest{
				Symbol:     "RELIANCE",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductDelivery,
				Quantity:   -5,
				PricePaise: 100000,
			},
			wantErr: "order quantity must be greater than zero",
		},
		{
			name: "Reject limit order with zero price",
			request: dto.CreateOrderRequest{
				Symbol:     "RELIANCE",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductDelivery,
				Quantity:   10,
				PricePaise: 0,
			},
			wantErr: "limit orders require a positive price",
		},
		{
			name: "Reject limit order with negative price",
			request: dto.CreateOrderRequest{
				Symbol:     "RELIANCE",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductDelivery,
				Quantity:   10,
				PricePaise: -100,
			},
			wantErr: "limit orders require a positive price",
		},
		{
			name: "Reject market order with client-supplied price",
			request: dto.CreateOrderRequest{
				Symbol:     "RELIANCE",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeMarket,
				Product:    model.OrderProductDelivery,
				Quantity:   10,
				PricePaise: 250000,
			},
			wantErr: "market orders must not include a price",
		},
		{
			name: "Reject SL-M order with client-supplied price",
			request: dto.CreateOrderRequest{
				Symbol:            "RELIANCE",
				Side:              model.OrderSideBuy,
				Type:              model.OrderTypeSLM,
				Product:           model.OrderProductDelivery,
				Quantity:          10,
				PricePaise:        250000,
				TriggerPricePaise: 260000,
			},
			wantErr: "SL-M orders must not include a price",
		},
		{
			name: "Reject SL order with zero trigger price",
			request: dto.CreateOrderRequest{
				Symbol:            "RELIANCE",
				Side:              model.OrderSideBuy,
				Type:              model.OrderTypeSL,
				Product:           model.OrderProductDelivery,
				Quantity:          10,
				PricePaise:        270000,
				TriggerPricePaise: 0,
			},
			wantErr: "stop-loss orders require a positive trigger price",
		},
		{
			name: "Reject SL-M order with negative trigger price",
			request: dto.CreateOrderRequest{
				Symbol:            "RELIANCE",
				Side:              model.OrderSideBuy,
				Type:              model.OrderTypeSLM,
				Product:           model.OrderProductDelivery,
				Quantity:          10,
				PricePaise:        0,
				TriggerPricePaise: -500,
			},
			wantErr: "stop-loss orders require a positive trigger price",
		},
		{
			name: "Reject FNO order without database connection",
			request: dto.CreateOrderRequest{
				Symbol:     "NIFTY24SEP26FUT",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductFNO,
				Quantity:   50,
				PricePaise: 2400000,
			},
			wantErr: "F&O instrument verification requires database connection",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := service.Create(userID, tc.request)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tc.wantErr)
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("expected error containing %q, got %v", tc.wantErr, err)
			}
		})
	}
}

func TestOrderService_SeededQuoteExecutableValidation(t *testing.T) {
	loc := calendar.Location()
	tradingTime := time.Date(2026, 9, 16, 11, 0, 0, 0, loc)
	userID := uuid.New().String()

	tests := []struct {
		name        string
		source      string
		allowSeeded bool
		wantErr     bool
		errContains string
	}{
		{
			name:        "Reject auto_seeded quote in default mode",
			source:      "auto_seeded",
			allowSeeded: false,
			wantErr:     true,
			errContains: "seeded quotes (auto_seeded) cannot be used for trade execution without explicit simulation mode",
		},
		{
			name:        "Reject initial_seed quote in default mode",
			source:      "initial_seed",
			allowSeeded: false,
			wantErr:     true,
			errContains: "seeded quotes (initial_seed) cannot be used for trade execution without explicit simulation mode",
		},
		{
			name:        "Reject benchmark_fallback quote in default mode",
			source:      "benchmark_fallback",
			allowSeeded: false,
			wantErr:     true,
			errContains: "seeded quotes (benchmark_fallback) cannot be used for trade execution without explicit simulation mode",
		},
		{
			name:        "Allow auto_seeded quote when explicit simulation mode permits",
			source:      "auto_seeded",
			allowSeeded: true,
			wantErr:     false,
		},
		{
			name:        "Allow initial_seed quote when explicit simulation mode permits",
			source:      "initial_seed",
			allowSeeded: true,
			wantErr:     false,
		},
		{
			name:        "Allow live Angel One quote in default mode",
			source:      "angelone_live",
			allowSeeded: false,
			wantErr:     false,
		},
		{
			name:        "Allow synthetic simulated quote in default mode",
			source:      "synthetic",
			allowSeeded: false,
			wantErr:     false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			orderSvc := New(nil, &config.Config{
				MISLeverage:             5,
				FuturesMarginPercent:    20,
				OptionSellMarginPercent: 30,
				AllowSeededQuotes:       tc.allowSeeded,
			})
			orderSvc.SetNowFunc(func() time.Time { return tradingTime })
			orderSvc.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
				q := &marketDTO.QuoteResponse{
					Symbol:     symbol,
					PricePaise: 250000,
					Source:     tc.source,
					UpdatedAt:  tradingTime.UTC().Format(time.RFC3339),
				}
				if err := marketService.ValidateExecutableQuoteWithMode(q, tradingTime, tc.allowSeeded); err != nil {
					return nil, err
				}
				return q, nil
			})

			if tc.wantErr {
				req := dto.CreateOrderRequest{
					Symbol:   "RELIANCE",
					Side:     model.OrderSideBuy,
					Type:     model.OrderTypeMarket,
					Product:  model.OrderProductDelivery,
					Quantity: 10,
				}
				_, err := orderSvc.Create(userID, req)
				if err == nil {
					t.Fatalf("expected error containing %q, got nil", tc.errContains)
				}
				if !strings.Contains(err.Error(), tc.errContains) {
					t.Fatalf("expected error containing %q, got: %v", tc.errContains, err)
				}
			} else {
				// Quote must be accepted as executable
				q, err := orderSvc.executableQuote("RELIANCE")
				if err != nil {
					t.Fatalf("expected quote to be executable, got error: %v", err)
				}
				if q.PricePaise != 250000 {
					t.Fatalf("expected quote price 250000, got %d", q.PricePaise)
				}
			}
		})
	}
}

