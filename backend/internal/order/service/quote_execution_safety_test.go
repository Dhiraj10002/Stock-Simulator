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

func TestOrderService_QuoteExecutionSafety(t *testing.T) {
	loc := calendar.Location()
	tradingTime := time.Date(2026, 9, 16, 11, 0, 0, 0, loc)
	userID := uuid.New().String()

	dummyInstrument := &model.Instrument{
		Symbol:          "RELIANCE",
		Name:            "RELIANCE INDUSTRIES LTD",
		ExchangeSegment: "NSE",
		InstrumentType:  "EQUITY",
		LotSize:         1,
		TickSize:        "0.05",
	}

	testCases := []struct {
		name              string
		feedMode          marketDTO.FeedMode
		quoteFunc         func(symbol string) (*marketDTO.QuoteResponse, error)
		wantCreateSuccess bool
		wantErrIs         error
	}{
		{
			name:     "Market order rejected when quote is missing (ErrQuoteNotFound)",
			feedMode: marketDTO.FeedModeLive,
			quoteFunc: func(symbol string) (*marketDTO.QuoteResponse, error) {
				return nil, marketService.ErrQuoteNotFound
			},
			wantCreateSuccess: false,
			wantErrIs:         marketService.ErrQuoteNotFound,
		},
		{
			name:     "Market order rejected when quote is stale (ErrQuoteStale)",
			feedMode: marketDTO.FeedModeLive,
			quoteFunc: func(symbol string) (*marketDTO.QuoteResponse, error) {
				return nil, marketService.ErrQuoteStale
			},
			wantCreateSuccess: false,
			wantErrIs:         marketService.ErrQuoteStale,
		},
		{
			name:     "Market order rejected when quote source is ineligible (ErrQuoteIneligible)",
			feedMode: marketDTO.FeedModeLive,
			quoteFunc: func(symbol string) (*marketDTO.QuoteResponse, error) {
				q := &marketDTO.QuoteResponse{
					Symbol:     symbol,
					PricePaise: 250000,
					Source:     "synthetic_gbm",
					UpdatedAt:  tradingTime.UTC().Format(time.RFC3339),
				}
				return q, marketService.ValidateExecutableQuoteWithFeedMode(q, tradingTime, marketDTO.FeedModeLive, false)
			},
			wantCreateSuccess: false,
			wantErrIs:         marketService.ErrQuoteIneligible,
		},
		{
			name:     "Market order rejected when market feed is unavailable (ErrQuoteUnavailable)",
			feedMode: marketDTO.FeedModeUnavailable,
			quoteFunc: func(symbol string) (*marketDTO.QuoteResponse, error) {
				q := &marketDTO.QuoteResponse{
					Symbol:     symbol,
					PricePaise: 250000,
					Source:     "angelone_live",
					UpdatedAt:  tradingTime.UTC().Format(time.RFC3339),
				}
				return q, marketService.ValidateExecutableQuoteWithFeedMode(q, tradingTime, marketDTO.FeedModeUnavailable, false)
			},
			wantCreateSuccess: false,
			wantErrIs:         marketService.ErrQuoteUnavailable,
		},
		{
			name:     "Market order succeeds when authoritative live quote is available",
			feedMode: marketDTO.FeedModeLive,
			quoteFunc: func(symbol string) (*marketDTO.QuoteResponse, error) {
				q := &marketDTO.QuoteResponse{
					Symbol:     symbol,
					PricePaise: 250000,
					Source:     "angelone_live",
					UpdatedAt:  tradingTime.UTC().Format(time.RFC3339),
				}
				if err := marketService.ValidateExecutableQuoteWithFeedMode(q, tradingTime, marketDTO.FeedModeLive, false); err != nil {
					return nil, err
				}
				return q, nil
			},
			wantCreateSuccess: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			orderPersisted := false

			orderSvc := New(nil, &config.Config{
				MISLeverage:             5,
				FuturesMarginPercent:    20,
				OptionSellMarginPercent: 30,
			})
			orderSvc.SetNowFunc(func() time.Time { return tradingTime })
			orderSvc.SetInstrumentFinder(func(symbol string) (*model.Instrument, error) {
				return dummyInstrument, nil
			})
			orderSvc.SetExecutableQuoteFunc(tc.quoteFunc)
			orderSvc.SetCreateOrderFunc(func(order *model.Order) error {
				orderPersisted = true
				return nil
			})

			req := dto.CreateOrderRequest{
				Symbol:   "RELIANCE",
				Side:     model.OrderSideBuy,
				Type:     model.OrderTypeMarket,
				Product:  model.OrderProductDelivery,
				Quantity: 10,
			}

			_, err := orderSvc.Create(userID, req)

			if tc.wantCreateSuccess {
				if err != nil {
					t.Fatalf("expected order creation to succeed, got error: %v", err)
				}
				if !orderPersisted {
					t.Fatal("expected order to be persisted")
				}
			} else {
				if err == nil {
					t.Fatal("expected order creation to fail, but it succeeded")
				}
				if tc.wantErrIs != nil && !errors.Is(err, tc.wantErrIs) {
					t.Fatalf("expected error wrapping %v, got %v", tc.wantErrIs, err)
				}
				// Zero mutation check: No order was created or written
				if orderPersisted {
					t.Fatal("SAFETY VIOLATION: order was persisted despite invalid/missing quote!")
				}
			}
		})
	}
}

func TestOrderService_UnknownInstrumentRejection(t *testing.T) {
	loc := calendar.Location()
	tradingTime := time.Date(2026, 9, 16, 11, 0, 0, 0, loc)
	userID := uuid.New().String()

	orderPersisted := false
	orderSvc := New(nil, &config.Config{
		MISLeverage:             5,
		FuturesMarginPercent:    20,
		OptionSellMarginPercent: 30,
	})
	orderSvc.SetNowFunc(func() time.Time { return tradingTime })
	orderSvc.SetInstrumentFinder(func(symbol string) (*model.Instrument, error) {
		// All unknown symbols return nil
		return nil, nil
	})
	orderSvc.SetCreateOrderFunc(func(order *model.Order) error {
		orderPersisted = true
		return nil
	})
	orderSvc.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{
			Symbol:     symbol,
			PricePaise: 100000,
			Source:     "angelone_live",
			UpdatedAt:  tradingTime.UTC().Format(time.RFC3339),
		}, nil
	})

	req := dto.CreateOrderRequest{
		Symbol:   "NON_EXISTENT_CO",
		Side:     model.OrderSideBuy,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductDelivery,
		Quantity: 10,
	}

	_, err := orderSvc.Create(userID, req)
	if err == nil {
		t.Fatal("expected error for unknown instrument, got nil")
	}
	if !errors.Is(err, ErrInstrumentNotFound) {
		t.Fatalf("expected errors.Is(err, ErrInstrumentNotFound), got %v", err)
	}
	if orderPersisted {
		t.Fatal("SAFETY VIOLATION: order was persisted for unknown instrument")
	}
}

func TestOrderService_FNOValidationAndSafety(t *testing.T) {
	loc := calendar.Location()
	tradingTime := time.Date(2026, 9, 16, 11, 0, 0, 0, loc)
	userID := uuid.New().String()

	fnoInstrumentValid := &model.Instrument{
		Symbol:           "NIFTY24SEP26FUT",
		Name:             "NIFTY 24 SEP 2026 FUT",
		UnderlyingSymbol: "NIFTY",
		ExchangeSegment:  "NFO",
		InstrumentType:   "FUTIDX",
		LotSize:          25,
		TickSize:         "0.05",
		Expiry:           "2026-09-24", // Future relative to 2026-09-16
	}

	fnoInstrumentExpired := &model.Instrument{
		Symbol:           "NIFTY24AUG26FUT",
		Name:             "NIFTY 24 AUG 2026 FUT",
		UnderlyingSymbol: "NIFTY",
		ExchangeSegment:  "NFO",
		InstrumentType:   "FUTIDX",
		LotSize:          25,
		TickSize:         "0.05",
		Expiry:           "2026-08-27", // Past relative to 2026-09-16
	}

	tests := []struct {
		name       string
		instrument *model.Instrument
		qty        int64
		quoteFunc  func(symbol string) (*marketDTO.QuoteResponse, error)
		wantPass   bool
		wantErrSub string
		wantErrIs  error
	}{
		{
			name:       "Rejects non-multiple lot size",
			instrument: fnoInstrumentValid,
			qty:        30, // LotSize is 25, 30 is invalid
			quoteFunc: func(symbol string) (*marketDTO.QuoteResponse, error) {
				return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: 2500000, Source: "angelone_live", UpdatedAt: tradingTime.UTC().Format(time.RFC3339)}, nil
			},
			wantPass:   false,
			wantErrSub: "exact multiple of instrument lot size",
		},
		{
			name:       "Rejects expired F&O contract",
			instrument: fnoInstrumentExpired,
			qty:        25,
			quoteFunc: func(symbol string) (*marketDTO.QuoteResponse, error) {
				return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: 2500000, Source: "angelone_live", UpdatedAt: tradingTime.UTC().Format(time.RFC3339)}, nil
			},
			wantPass:   false,
			wantErrSub: "cannot place order on expired contract",
		},
		{
			name:       "Rejects F&O market order when quote is stale",
			instrument: fnoInstrumentValid,
			qty:        25,
			quoteFunc: func(symbol string) (*marketDTO.QuoteResponse, error) {
				return nil, marketService.ErrQuoteStale
			},
			wantPass:  false,
			wantErrIs: marketService.ErrQuoteStale,
		},
		{
			name:       "Succeeds for valid F&O contract with exact lot multiple and valid quote",
			instrument: fnoInstrumentValid,
			qty:        50, // 2 lots
			quoteFunc: func(symbol string) (*marketDTO.QuoteResponse, error) {
				return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: 2500000, Source: "angelone_live", UpdatedAt: tradingTime.UTC().Format(time.RFC3339)}, nil
			},
			wantPass: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			orderPersisted := false
			orderSvc := New(nil, &config.Config{
				MISLeverage:             5,
				FuturesMarginPercent:    20,
				OptionSellMarginPercent: 30,
			})
			orderSvc.SetNowFunc(func() time.Time { return tradingTime })
			orderSvc.SetInstrumentFinder(func(symbol string) (*model.Instrument, error) {
				return tc.instrument, nil
			})
			orderSvc.SetExecutableQuoteFunc(tc.quoteFunc)
			orderSvc.SetCreateOrderFunc(func(order *model.Order) error {
				orderPersisted = true
				return nil
			})

			req := dto.CreateOrderRequest{
				Symbol:   tc.instrument.Symbol,
				Side:     model.OrderSideBuy,
				Type:     model.OrderTypeMarket,
				Product:  model.OrderProductFNO,
				Quantity: tc.qty,
			}

			_, err := orderSvc.Create(userID, req)
			if tc.wantPass {
				if err != nil {
					t.Fatalf("expected order creation to succeed, got error: %v", err)
				}
				if !orderPersisted {
					t.Fatal("expected order to be persisted")
				}
			} else {
				if err == nil {
					t.Fatal("expected order creation to fail, but it succeeded")
				}
				if tc.wantErrIs != nil && !errors.Is(err, tc.wantErrIs) {
					t.Fatalf("expected error wrapping %v, got %v", tc.wantErrIs, err)
				}
				if tc.wantErrSub != "" && !strings.Contains(err.Error(), tc.wantErrSub) {
					t.Fatalf("expected error containing %q, got: %v", tc.wantErrSub, err)
				}
				if orderPersisted {
					t.Fatal("SAFETY VIOLATION: order was persisted despite validation failure!")
				}
			}
		})
	}
}
