package service

import (
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/google/uuid"
)

func TestNewOrdersAndPreviewsRejectLegacyUnsupportedAndRetiredInstruments(t *testing.T) {
	for _, tc := range []struct {
		name, segment, kind, product string
		active, tradable             bool
	}{
		{"legacy BSE", "BSE", "EQUITY", model.OrderProductDelivery, true, true},
		{"legacy BFO", "BFO", "FUTIDX", model.OrderProductFNO, true, true},
		{"retired legacy NSE", "NSE", "EQUITY", model.OrderProductDelivery, false, false},
		{"benchmark", "NSE", "INDEX", model.OrderProductDelivery, true, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := New(nil, nil)
			s.SetNowFunc(func() time.Time { return time.Date(2026, 10, 5, 11, 0, 0, 0, calendar.Location()) })
			s.SetInstrumentFinder(func(string) (*model.Instrument, error) {
				return &model.Instrument{Symbol: "LEGACY", ExchangeSegment: tc.segment, InstrumentType: tc.kind, Active: tc.active, IsTradable: tc.tradable, LotSize: 1, TickSize: "0.05", Expiry: "29OCT2026", UnderlyingSymbol: "NIFTY"}, nil
			})
			persisted := false
			s.SetCreateOrderFunc(func(*model.Order) error { persisted = true; return nil })
			req := dto.CreateOrderRequest{Symbol: "LEGACY", Side: model.OrderSideBuy, Type: model.OrderTypeLimit, Product: tc.product, Quantity: 1, PricePaise: 10000}
			user := uuid.NewString()
			if _, err := s.Create(user, req); err == nil {
				t.Fatal("unsupported opening order accepted")
			}
			if _, err := s.Preview(user, req); err == nil {
				t.Fatal("unsupported preview accepted")
			}
			if persisted {
				t.Fatal("rejected order was persisted")
			}
		})
	}
}

func TestNFOExpiryAndSessionAgreeAtClose(t *testing.T) {
	for _, tc := range []struct {
		minute  int
		expired bool
	}{{30, false}, {35, false}, {39, false}, {40, true}} {
		now := time.Date(2026, 9, 29, 15, tc.minute, 0, 0, calendar.Location())
		if isExpired("29SEP2026", now) != tc.expired {
			t.Fatalf("unexpected expiry at %v", now)
		}
		if (calendar.ValidateNewOrderSessionForSegment(now, calendar.SegmentNFO) != nil) != tc.expired {
			t.Fatalf("session disagrees with expiry at %v", now)
		}
	}
}

func TestLegacyExchangeOpeningExecutionIsBlockedButManagedPositionExitSurvives(t *testing.T) {
	db := accountingDB(t)
	w := accountingWallet(t, db)
	symbol := "LEGACYBSE" + uuid.NewString()
	inst := model.Instrument{Symbol: symbol, Token: "legacy-token", Name: symbol, InstrumentType: "EQUITY", ExchangeSegment: "BSE", Active: true, IsTradable: true}
	if err := db.Create(&inst).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Delete(&inst) })
	s := accountingService()
	s.SetExecutableQuoteFunc(func(symbol string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: 10000}, nil
	})
	opening := model.Order{UserUUID: w.UserUUID, Symbol: symbol, Product: model.OrderProductDelivery, Side: model.OrderSideBuy, Type: model.OrderTypeMarket, Quantity: 1, Status: model.OrderStatusPending}
	if err := db.Create(&opening).Error; err != nil {
		t.Fatal(err)
	}
	if err := s.Execute(w.UserUUID.String(), opening.UUID.String()); err == nil {
		t.Fatal("legacy BSE opening order executed")
	}
	var trades int64
	db.Model(&model.Trade{}).Where("user_uuid = ?", w.UserUUID).Count(&trades)
	if trades != 0 {
		t.Fatal("rejected opening order created a trade")
	}
	if err := db.Model(&opening).Update("status", model.OrderStatusRejected).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&inst).Updates(map[string]any{"active": false, "is_tradable": false}).Error; err != nil {
		t.Fatal(err)
	}
	position := model.Position{UserUUID: w.UserUUID, Symbol: symbol, Product: model.OrderProductDelivery, Quantity: 1, AveragePricePaise: 10000, CostBasisPaise: 10000}
	if err := db.Create(&position).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := s.SquareOffPosition(w.UserUUID, position.UUID, "legacy-exit"); err != nil {
		t.Fatalf("managed legacy exit blocked: %v", err)
	}
	if err := db.First(&position, "uuid = ?", position.UUID).Error; err != nil {
		t.Fatal(err)
	}
	if position.Quantity != 0 {
		t.Fatal("managed exit did not close legacy position")
	}
}

func TestSettlementReferencesUseNFOClosingWindowWithoutChangingCashWindow(t *testing.T) {
	day := time.Date(2026, 9, 29, 0, 0, 0, 0, calendar.Location())
	for _, tc := range []struct {
		segment string
		minute  int
		valid   bool
	}{{"NFO", 29, false}, {"NFO", 35, false}, {"NFO", 39, true}, {"NFO", 41, false}, {"NSE", 29, true}, {"NSE", 39, false}} {
		ref := model.SettlementReference{SessionDate: "2026-09-29", FeedMode: "LIVE", Source: "angelone_live", PricePaise: 10000, ObservedAt: day.Add(15*time.Hour + time.Duration(tc.minute)*time.Minute + 30*time.Second)}
		if (validateSettlementReference(ref, day, marketDTO.FeedModeLive, tc.segment) == nil) != tc.valid {
			t.Fatalf("unexpected %s reference validity at minute %d", tc.segment, tc.minute)
		}
	}
}
