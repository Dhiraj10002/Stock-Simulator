package service

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
)

func TestSettlementRejectsUnvalidatedCurrentQuotes(t *testing.T) {
	db := accountingDB(t)
	day := time.Date(2026, 9, 24, 15, 29, 30, 0, calendar.Location())
	for _, tc := range []struct {
		name  string
		quote *marketDTO.QuoteResponse
		valid bool
	}{
		{"closing window", &marketDTO.QuoteResponse{PricePaise: 12000, Source: "angelone_live", UpdatedAt: day.Format(time.RFC3339)}, true},
		{"next session", &marketDTO.QuoteResponse{PricePaise: 12000, Source: "angelone_live", UpdatedAt: day.Add(24 * time.Hour).Format(time.RFC3339)}, false},
		{"before close", &marketDTO.QuoteResponse{PricePaise: 12000, Source: "angelone_live", UpdatedAt: day.Add(-time.Hour).Format(time.RFC3339)}, false},
		{"wrong source", &marketDTO.QuoteResponse{PricePaise: 12000, Source: "position_mark_fallback", UpdatedAt: day.Format(time.RFC3339)}, false},
		{"nil", nil, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			symbol := "SAFE" + uuid.NewString()
			t.Cleanup(func() { db.Where("symbol = ?", symbol).Delete(&model.SettlementReference{}) })
			if tc.quote != nil {
				tc.quote.Symbol = symbol
			}
			s := accountingService()
			s.SetExecutableQuoteFunc(func(string) (*marketDTO.QuoteResponse, error) { return tc.quote, nil })
			price, err := s.finalQuotePrice(symbol, "24SEP2026")
			if (err == nil) != tc.valid {
				t.Fatalf("price=%d error=%v", price, err)
			}
			var n int64
			db.Model(&model.SettlementReference{}).Where("symbol = ?", symbol).Count(&n)
			if tc.valid && (price != 12000 || n != 1) {
				t.Fatalf("validated reference not persisted: price=%d rows=%d", price, n)
			}
			if !tc.valid && n != 0 {
				t.Fatal("invalid quote archived")
			}
		})
	}
}

func TestProductionExitDoesNotUsePositionMark(t *testing.T) {
	db := accountingDB(t)
	for _, prod := range []string{model.OrderProductDelivery, model.OrderProductIntraday} {
		t.Run(prod, func(t *testing.T) {
			w := accountingWallet(t, db)
			p := model.Position{UserUUID: w.UserUUID, Symbol: "NOFEED", Product: prod, Quantity: 10, AveragePricePaise: 10000, CurrentPricePaise: 12000}
			if err := db.Create(&p).Error; err != nil {
				t.Fatal(err)
			}
			// Real service wiring, no injected executableQuoteFunc: this was the
			// branch that re-stamped recorded position prices after feed failure.
			s := New(&marketService.Service{}, nil)
			s.SetNowFunc(func() time.Time { return time.Date(2026, 9, 25, 11, 0, 0, 0, calendar.Location()) })
			if _, err := s.SquareOffPosition(w.UserUUID, p.UUID, "no-feed"); err == nil {
				t.Fatal("exit filled without market data")
			}
			var n int64
			db.Model(&model.Trade{}).Where("user_uuid = ?", w.UserUUID).Count(&n)
			if n != 0 {
				t.Fatal("position mark created a trade")
			}
			var intent model.Order
			if err := db.Where("user_uuid = ? AND exit_key = ?", w.UserUUID, "no-feed").First(&intent).Error; err != nil {
				t.Fatal(err)
			}
			if intent.Status != model.OrderStatusPending {
				t.Fatalf("exit lost retry intent: %s", intent.Status)
			}
		})
	}
}

func TestExpiredManualExitUsesArchiveWithOneConnection(t *testing.T) {
	db := accountingDB(t)
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	previous := sqlDB.Stats().MaxOpenConnections
	sqlDB.SetMaxOpenConns(1)
	defer sqlDB.SetMaxOpenConns(previous)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// Ensure any unexpected lock wait fails instead of hanging CI.
	if err := db.WithContext(ctx).Exec("SET statement_timeout = '3s'").Error; err != nil {
		t.Fatal(err)
	}
	defer db.Exec("SET statement_timeout = 0")
	symbol := "ARCHIVE" + strings.ToUpper(uuid.NewString()[:18])
	inst := model.Instrument{Token: fmt.Sprint(time.Now().UnixNano()), Symbol: symbol, Name: symbol, InstrumentType: "FUTSTK", ExchangeSegment: "NFO", Expiry: "24SEP2026", LotSize: 10, TickSize: "0.05"}
	if err := db.Create(&inst).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Delete(&inst); db.Where("symbol = ?", symbol).Delete(&model.SettlementReference{}) })
	ref := model.SettlementReference{Symbol: symbol, SessionDate: "2026-09-24", FeedMode: "LIVE", Source: "angelone_live", PricePaise: 12000, ObservedAt: time.Date(2026, 9, 24, 15, 39, 30, 0, calendar.Location())}
	if err := db.Create(&ref).Error; err != nil {
		t.Fatal(err)
	}
	w := accountingWallet(t, db)
	p := model.Position{UserUUID: w.UserUUID, Symbol: symbol, Product: model.OrderProductFNO, Quantity: 10, AveragePricePaise: 10000, CurrentPricePaise: 99999}
	if err := db.Create(&p).Error; err != nil {
		t.Fatal(err)
	}
	s := New(&marketService.Service{}, nil)
	s.SetNowFunc(func() time.Time { return time.Date(2026, 9, 25, 11, 0, 0, 0, calendar.Location()) })
	first, err := s.SquareOffPosition(w.UserUUID, p.UUID, "archive-exit")
	if err != nil {
		t.Fatal(err)
	}
	again, err := s.SquareOffPosition(w.UserUUID, p.UUID, "archive-exit")
	if err != nil {
		t.Fatal(err)
	}
	if first.UUID != again.UUID || first.Status != model.OrderStatusExecuted || first.ExecutedPricePaise != 12000 {
		t.Fatalf("expiry retry failed: %+v %+v", first, again)
	}
	var n int64
	db.Model(&model.Trade{}).Where("user_uuid = ?", w.UserUUID).Count(&n)
	if n != 1 {
		t.Fatalf("duplicate expiry trades: %d", n)
	}
}
