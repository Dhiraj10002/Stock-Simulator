package service

import (
	"errors"
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

func TestOrderService_SegmentSessionTimings(t *testing.T) {
	loc := calendar.Location()
	service := New(nil, &config.Config{
		MISLeverage:             5,
		FuturesMarginPercent:    20,
		OptionSellMarginPercent: 30,
	})
	service.SetInstrumentFinder(func(symbol string) (*model.Instrument, error) {
		if symbol == "NIFTY26OCT25000CE" {
			return &model.Instrument{
				Symbol:          "NIFTY26OCT25000CE",
				Name:            "NIFTY Option",
				ExchangeSegment: "NFO",
				InstrumentType:  "OPTIDX",
				Expiry:          "2026-10-29",
				LotSize:         25,
				Active:          true,
				IsTradable:      true,
			}, nil
		}
		return &model.Instrument{
			Symbol:          symbol,
			Name:            symbol,
			ExchangeSegment: "NSE",
			InstrumentType:  "EQUITY",
			LotSize:         1,
			Active:          true,
			IsTradable:      true,
		}, nil
	})

	userID := uuid.New().String()

	t.Run("Cash equity rejected at 15:35 IST", func(t *testing.T) {
		service.SetNowFunc(func() time.Time {
			return time.Date(2026, 9, 16, 15, 35, 0, 0, loc)
		})
		_, err := service.Create(userID, dto.CreateOrderRequest{
			Symbol:     "RELIANCE",
			Side:       model.OrderSideBuy,
			Type:       model.OrderTypeLimit,
			Product:    model.OrderProductDelivery,
			Quantity:   10,
			PricePaise: 250000,
		})
		if err == nil || !strings.Contains(err.Error(), "closed at 15:30 IST") {
			t.Fatalf("expected cash order error containing 'closed at 15:30 IST', got: %v", err)
		}
	})

	t.Run("NFO derivative accepted at 15:35 IST", func(t *testing.T) {
		service.SetNowFunc(func() time.Time {
			return time.Date(2026, 9, 16, 15, 35, 0, 0, loc)
		})
		var createdOrder *model.Order
		service.createOrderFunc = func(o *model.Order) error {
			createdOrder = o
			return nil
		}
		_, err := service.Create(userID, dto.CreateOrderRequest{
			Symbol:     "NIFTY26OCT25000CE",
			Side:       model.OrderSideBuy,
			Type:       model.OrderTypeLimit,
			Product:    model.OrderProductFNO,
			Quantity:   25,
			PricePaise: 15000,
		})
		if err != nil {
			t.Fatalf("expected NFO order to be accepted at 15:35 IST, got: %v", err)
		}
		if createdOrder == nil || createdOrder.Symbol != "NIFTY26OCT25000CE" {
			t.Fatalf("expected order to be created, got %v", createdOrder)
		}
	})

	t.Run("NFO derivative rejected at 15:41 IST", func(t *testing.T) {
		service.SetNowFunc(func() time.Time {
			return time.Date(2026, 9, 16, 15, 41, 0, 0, loc)
		})
		_, err := service.Create(userID, dto.CreateOrderRequest{
			Symbol:     "NIFTY26OCT25000CE",
			Side:       model.OrderSideBuy,
			Type:       model.OrderTypeLimit,
			Product:    model.OrderProductFNO,
			Quantity:   25,
			PricePaise: 15000,
		})
		if err == nil || !strings.Contains(err.Error(), "closed at 15:40 IST") {
			t.Fatalf("expected NFO order error containing 'closed at 15:40 IST', got: %v", err)
		}
	})
}

func TestOrderService_PreviewStaleQuoteFallback(t *testing.T) {
	service := New(nil, &config.Config{
		MISLeverage:             5,
		FuturesMarginPercent:    20,
		OptionSellMarginPercent: 30,
	})
	inst := model.Instrument{
		Symbol:           "HCLTECH26OCTFUT",
		UnderlyingSymbol: "HCLTECH",
		LotSize:          400,
		InstrumentType:   "FUTSTK",
		ExchangeSegment:  "NFO",
		Expiry:           "2030-10-27",
		Active:           true,
		IsTradable:       true,
	}
	service.SetInstrumentFinder(func(sym string) (*model.Instrument, error) {
		if sym == inst.Symbol {
			return &inst, nil
		}
		return nil, errors.New("not found")
	})

	calls := 0
	service.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		calls++
		if calls == 1 {
			return nil, marketService.ErrQuoteStale
		}
		return &marketDTO.QuoteResponse{
			Symbol:     symbol,
			PricePaise: 119570,
			Source:     "angelone_live",
			UpdatedAt:  "2026-10-05T10:00:00Z",
		}, nil
	})

	preview, err := service.Preview(uuid.New().String(), dto.CreateOrderRequest{
		Symbol:   inst.Symbol,
		Side:     model.OrderSideBuy,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductFNO,
		Quantity: 400,
	})
	if err != nil {
		t.Fatalf("expected preview to succeed on stale quote fallback, got err: %v", err)
	}
	if preview == nil {
		t.Fatal("expected non-nil preview")
	}
	// 400 * 1195.70 = ~478,280. Margin 20% = ~95,656
	if preview.RequiredFundsPaise <= 0 {
		t.Fatalf("expected positive required funds, got: %d", preview.RequiredFundsPaise)
	}
	if preview.EstimatedPricePaise <= 0 {
		t.Fatalf("expected positive estimated price, got: %d", preview.EstimatedPricePaise)
	}
}

