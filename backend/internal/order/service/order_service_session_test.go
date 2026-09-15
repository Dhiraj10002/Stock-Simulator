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

func TestOrderService_MarketSessionRejection(t *testing.T) {
	loc := calendar.Location()
	service := New(nil, &config.Config{
		MISLeverage:             5,
		FuturesMarginPercent:    20,
		OptionSellMarginPercent: 30,
	})

	userID := uuid.New().String()

	tests := []struct {
		name     string
		mockTime time.Time
		request  dto.CreateOrderRequest
		wantErr  string
	}{
		{
			name:     "Reject order outside trading hours (Early Morning 08:30 IST)",
			mockTime: time.Date(2026, 9, 16, 8, 30, 0, 0, loc), // Wednesday
			request: dto.CreateOrderRequest{
				Symbol:     "RELIANCE",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductDelivery,
				Quantity:   10,
				PricePaise: 250000,
			},
			wantErr: "opens at 09:15 IST",
		},
		{
			name:     "Reject order after market close (16:00 IST)",
			mockTime: time.Date(2026, 9, 16, 16, 0, 0, 0, loc), // Wednesday
			request: dto.CreateOrderRequest{
				Symbol:     "TCS",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductDelivery,
				Quantity:   5,
				PricePaise: 350000,
			},
			wantErr: "closed at 15:30 IST",
		},
		{
			name:     "Reject order on weekend (Saturday)",
			mockTime: time.Date(2026, 9, 19, 11, 0, 0, 0, loc), // Saturday
			request: dto.CreateOrderRequest{
				Symbol:     "INFY",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductDelivery,
				Quantity:   15,
				PricePaise: 180000,
			},
			wantErr: "closed on weekends",
		},
		{
			name:     "Reject order on exchange holiday (Gandhi Jayanti 2 Oct 2026)",
			mockTime: time.Date(2026, 10, 2, 11, 0, 0, 0, loc), // Friday
			request: dto.CreateOrderRequest{
				Symbol:     "HDFCBANK",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductDelivery,
				Quantity:   20,
				PricePaise: 160000,
			},
			wantErr: "Mahatma Gandhi Jayanti",
		},
		{
			name:     "Reject MIS order after 15:20 cutoff (15:21 IST on trading day)",
			mockTime: time.Date(2026, 9, 16, 15, 21, 0, 0, loc), // Wednesday
			request: dto.CreateOrderRequest{
				Symbol:     "RELIANCE",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductIntraday,
				Quantity:   10,
				PricePaise: 250000,
			},
			wantErr: "MIS orders are not accepted after 15:20 IST",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			service.SetNowFunc(func() time.Time { return tc.mockTime })
			_, err := service.Create(userID, tc.request)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tc.wantErr)
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("expected error containing %q, got: %v", tc.wantErr, err)
			}
		})
	}
}
