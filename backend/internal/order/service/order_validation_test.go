package service

import (
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
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
