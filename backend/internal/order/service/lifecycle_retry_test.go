package service

import (
	"errors"
	"sync"
	"testing"

	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	orderDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/google/uuid"
)

func TestRegression_StopActivationPersistsOutsideLimit(t *testing.T) {
	db := accountingDB(t)
	ensureInstrumentExists(t, db, "STOPRETRY", "EQUITY")
	for _, prod := range []string{model.OrderProductDelivery, model.OrderProductIntraday} {
		for _, side := range []string{model.OrderSideBuy, model.OrderSideSell} {
			t.Run(prod+side, func(t *testing.T) {
				w := accountingWallet(t, db)
				s := accountingService()
				trigger, limit, gap, retrace := int64(10500), int64(10600), int64(10700), int64(10400)
				if side == model.OrderSideSell {
					trigger, limit, gap, retrace = 9500, 9400, 9300, 9600
					p := model.Position{UserUUID: w.UserUUID, Symbol: "STOPRETRY", Product: prod, Quantity: 10, AveragePricePaise: 10000, CostBasisPaise: 100000}
					if err := db.Create(&p).Error; err != nil {
						t.Fatal(err)
					}
				}
				o := model.Order{UserUUID: w.UserUUID, Symbol: "STOPRETRY", Product: prod, Side: side, Type: model.OrderTypeSL, Quantity: 10, TriggerPricePaise: trigger, PricePaise: limit, Status: model.OrderStatusTriggerPending}
				if err := db.Create(&o).Error; err != nil {
					t.Fatal(err)
				}
				s.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
					return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: gap}, nil
				})
				if err := s.Execute(w.UserUUID.String(), o.UUID.String()); err == nil {
					t.Fatal("filled outside limit")
				}
				if err := db.First(&o, o.ID).Error; err != nil {
					t.Fatal(err)
				}
				if o.Status != model.OrderStatusOpen {
					t.Fatalf("activation rolled back: %s", o.Status)
				}
				var count int64
				db.Model(&model.Trade{}).Where("order_uuid = ?", o.UUID).Count(&count)
				if count != 0 {
					t.Fatal("activation created a trade")
				}
				s = accountingService() // no in-memory activation state may be required
				s.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
					return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: retrace}, nil
				})
				if err := s.Execute(w.UserUUID.String(), o.UUID.String()); err != nil {
					t.Fatal(err)
				}
				db.First(&o, o.ID)
				if o.Status != model.OrderStatusExecuted {
					t.Fatal("activated limit did not fill on retracement")
				}
			})
		}
	}
}

func TestRegression_DurableExitRetriesAcrossReopenAndClear(t *testing.T) {
	db := accountingDB(t)
	w := accountingWallet(t, db)
	s := accountingService()
	accountingFill(t, db, s, w, "RETRYTEST", model.OrderProductIntraday, model.OrderSideBuy, 10, 10000)
	var p model.Position
	if err := db.Where("user_uuid = ?", w.UserUUID).First(&p).Error; err != nil {
		t.Fatal(err)
	}
	key := uuid.NewString()
	var wg sync.WaitGroup
	results := make(chan *orderDTO.OrderResponse, 8)
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			result, err := s.SquareOffPosition(w.UserUUID, p.UUID, key)
			results <- result
			errs <- err
		}()
	}
	wg.Wait()
	close(results)
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	orderID := ""
	for r := range results {
		if r.Status != model.OrderStatusExecuted {
			t.Fatalf("unexpected response %+v", r)
		}
		if orderID != "" && orderID != r.UUID {
			t.Fatal("duplicate exit intents")
		}
		orderID = r.UUID
	}
	accountingFill(t, db, s, w, "RETRYTEST", model.OrderProductIntraday, model.OrderSideBuy, 7, 10000)
	if _, err := s.ClearHistory(w.UserUUID.String()); err != nil {
		t.Fatal(err)
	}
	restarted := accountingService()
	result, err := restarted.SquareOffPosition(w.UserUUID, p.UUID, key)
	if err != nil || result.UUID != orderID || result.Status != model.OrderStatusExecuted {
		t.Fatalf("retry lost original result: %+v %v", result, err)
	}
	db.First(&p, p.ID)
	if p.Quantity != 7 {
		t.Fatal("old retry closed reopened position")
	}
	if _, err := restarted.SquareOffPosition(w.UserUUID, uuid.New(), key); !errors.Is(err, ErrExitKeyConflict) {
		t.Fatal("key allowed for a different position")
	}
	var count int64
	db.Model(&model.Trade{}).Where("user_uuid = ?", w.UserUUID).Count(&count)
	if count != 3 {
		t.Fatal("history clear deleted accounting evidence")
	}
}

func TestRegression_DelayedExitCannotCloseChangedPosition(t *testing.T) {
	db := accountingDB(t)
	w := accountingWallet(t, db)
	s := accountingService()
	accountingFill(t, db, s, w, "DELAYTEST", model.OrderProductIntraday, model.OrderSideBuy, 10, 10000)
	var p model.Position
	db.Where("user_uuid = ?", w.UserUUID).First(&p)
	key := uuid.NewString()
	s.SetExecutableQuoteFunc(func(string) (*marketDTO.QuoteResponse, error) { return nil, marketService.ErrQuoteUnavailable })
	if _, err := s.SquareOffPosition(w.UserUUID, p.UUID, key); err == nil {
		t.Fatal("expected missing quote")
	}
	accountingFill(t, db, s, w, "DELAYTEST", model.OrderProductIntraday, model.OrderSideBuy, 5, 10000)
	result, err := s.SquareOffPosition(w.UserUUID, p.UUID, key)
	if err != nil || result.Status != model.OrderStatusCancelled {
		t.Fatalf("stale exit accepted: %+v %v", result, err)
	}
	db.First(&p, p.ID)
	if p.Quantity != 15 {
		t.Fatal("changed position was closed")
	}
}

func TestRegression_PreviewUsesConfiguredRulesWithoutWrites(t *testing.T) {
	db := accountingDB(t)
	w := accountingWallet(t, db)
	s := accountingService()
	inst := model.Instrument{Token: uuid.NewString()[:16], Symbol: "PREVIEWFUT", UnderlyingSymbol: "TCS", LotSize: 1, InstrumentType: "FUTSTK", ExchangeSegment: "NFO", Expiry: "2030-09-26", Active: true}
	if err := db.Create(&inst).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Delete(&inst) })
	s.SetInstrumentFinder(func(string) (*model.Instrument, error) { return &inst, nil })
	s.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: 10000}, nil
	})
	s.rules.FuturesMarginPercent = 30
	preview, err := s.Preview(w.UserUUID.String(), orderDTO.CreateOrderRequest{Symbol: inst.Symbol, Side: model.OrderSideBuy, Type: model.OrderTypeMarket, Product: model.OrderProductFNO, Quantity: 100})
	if err != nil {
		t.Fatal(err)
	}
	if preview.RequiredFundsPaise != 300150 || preview.EstimatedPricePaise != 10005 || preview.AvailableBalancePaise != w.CashBalancePaise {
		t.Fatalf("bad preview: %+v", preview)
	}
	var count int64
	db.Model(&model.Order{}).Where("user_uuid = ?", w.UserUUID).Count(&count)
	if count != 0 {
		t.Fatal("preview created an order")
	}
	accountingFill(t, db, s, w, inst.Symbol, model.OrderProductFNO, model.OrderSideBuy, 100, 10000)
	var got model.Wallet
	db.First(&got, w.ID)
	if got.BlockedPaise != preview.RequiredFundsPaise {
		t.Fatalf("preview and settlement diverged: %+v %+v", preview, got)
	}
}

func TestRegression_MatcherRemembersStopActivation(t *testing.T) {
	db := accountingDB(t)
	ensureInstrumentExists(t, db, "MATCHSTOP", "EQUITY")
	w := accountingWallet(t, db)
	s := accountingService()
	o := model.Order{UserUUID: w.UserUUID, Symbol: "MATCHSTOP", Product: model.OrderProductIntraday, Side: model.OrderSideBuy, Type: model.OrderTypeSL, Quantity: 10, TriggerPricePaise: 10500, PricePaise: 10600, Status: model.OrderStatusTriggerPending}
	if err := db.Create(&o).Error; err != nil {
		t.Fatal(err)
	}
	s.RegisterActiveOrder(o)
	price := int64(10700)
	s.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: price}, nil
	})
	if err := s.MatchSymbol(o.Symbol); err != nil {
		t.Fatal(err)
	}
	db.First(&o, o.ID)
	if o.Status != model.OrderStatusOpen {
		t.Fatalf("trigger not persisted: %s", o.Status)
	}
	price = 10400 // no longer satisfies trigger, but activated limit must fill
	if err := s.MatchSymbol(o.Symbol); err != nil {
		t.Fatal(err)
	}
	db.First(&o, o.ID)
	if o.Status != model.OrderStatusExecuted {
		t.Fatalf("matcher lost activation: %s", o.Status)
	}
}

func TestRegression_PendingExitRecoversOnQuote(t *testing.T) {
	db := accountingDB(t)
	w := accountingWallet(t, db)
	s := accountingService()
	p := model.Position{UserUUID: w.UserUUID, Symbol: "EXITRECOVER", Product: model.OrderProductIntraday, Quantity: 10, AveragePricePaise: 10000, CostBasisPaise: 100000}
	if err := db.Create(&p).Error; err != nil {
		t.Fatal(err)
	}
	s.SetExecutableQuoteFunc(func(string) (*marketDTO.QuoteResponse, error) { return nil, errors.New("quote unavailable") })
	if _, err := s.SquareOffPosition(w.UserUUID, p.UUID, "recover-on-quote"); err == nil {
		t.Fatal("expected unavailable quote")
	}
	s.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: 10000}, nil
	})
	if err := s.MatchSymbol(p.Symbol); err != nil {
		t.Fatal(err)
	}
	db.First(&p, p.ID)
	if p.Quantity != 0 {
		t.Fatal("pending exit did not recover when quotes returned")
	}
	result, err := s.SquareOffPosition(w.UserUUID, p.UUID, "recover-on-quote")
	if err != nil || result.Status != model.OrderStatusExecuted {
		t.Fatalf("retry: %v %v", result, err)
	}
}

func TestRegression_OptionPreviewMatchesConfiguredSettlement(t *testing.T) {
	db := accountingDB(t)
	for _, side := range []string{model.OrderSideBuy, model.OrderSideSell} {
		t.Run(side, func(t *testing.T) {
			w := accountingWallet(t, db)
			s := accountingService()
			s.rules.OptionSellMarginPercent = 45
			inst := model.Instrument{Token: uuid.NewString()[:16], Symbol: "PREVIEWOPT" + side, UnderlyingSymbol: "TCS", LotSize: 1, InstrumentType: "OPTSTK", ExchangeSegment: "NFO", Expiry: "2030-09-26", OptionType: "CE", Strike: "100", Active: true}
			if err := db.Create(&inst).Error; err != nil {
				t.Fatal(err)
			}
			defer db.Delete(&inst)
			s.SetInstrumentFinder(func(string) (*model.Instrument, error) { return &inst, nil })
			s.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
				return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: 10000, Source: "angelone_live", UpdatedAt: "2026-09-16T05:30:00Z"}, nil
			})
			request := orderDTO.CreateOrderRequest{Symbol: inst.Symbol, Side: side, Type: model.OrderTypeMarket, Product: model.OrderProductFNO, Quantity: 100}
			preview, err := s.Preview(w.UserUUID.String(), request)
			if err != nil {
				t.Fatal(err)
			}
			expected := preview.EstimatedPricePaise * 100
			if side == model.OrderSideSell {
				expected = expected * 45 / 100
			}
			if preview.RequiredFundsPaise != expected || preview.QuoteSource != "angelone_live" {
				t.Fatalf("bad preview: %+v", preview)
			}
			// The exact preview threshold must suffice for execution, even for a short option.
			if err := db.Model(&w).Update("cash_balance_paise", expected).Error; err != nil {
				t.Fatal(err)
			}
			accountingFill(t, db, s, w, inst.Symbol, model.OrderProductFNO, side, 100, 10000)
			var after model.Wallet
			db.First(&after, w.ID)
			if after.AvailableBalancePaise() < 0 {
				t.Fatal("preview allowed insufficient funds")
			}
		})
	}
}
