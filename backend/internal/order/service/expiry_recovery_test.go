package service

import (
	"errors"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/product"
	"testing"
	"time"
)

func TestRegression_ExpiryReferenceSurvivesCacheLoss(t *testing.T) {
	db := accountingDB(t)
	s := accountingService()
	s.SetExecutableQuoteFunc(func(string) (*marketDTO.QuoteResponse, error) { return nil, errors.New("Redis cache lost") })
	day := time.Date(2026, 9, 24, 0, 0, 0, 0, calendar.Location())
	ref := model.SettlementReference{Symbol: "EXPIRYARCHIVE", SessionDate: "2026-09-24", FeedMode: "LIVE", Source: "angelone_live", PricePaise: 12000, ObservedAt: day.Add(15*time.Hour + 29*time.Minute + 55*time.Second)}
	db.Where("symbol = ?", ref.Symbol).Delete(&model.SettlementReference{})
	t.Cleanup(func() {
		db.Where("symbol = ?", ref.Symbol).Delete(&model.SettlementReference{})
	})
	if err := db.Create(&ref).Error; err != nil {
		t.Fatal(err)
	}
	price, err := s.finalQuotePrice(ref.Symbol, "24SEP2026")
	if err != nil || price != 12000 {
		t.Fatalf("recovery: %d %v", price, err)
	}
	instrument := model.Instrument{Symbol: "EXPIRYOPTION", UnderlyingSymbol: ref.Symbol, Expiry: "24SEP2026", Strike: "100", OptionType: "CE"}
	intrinsic, err := s.expiryPrice(instrument, product.InstrumentOption)
	if err != nil || intrinsic != 2000 {
		t.Fatalf("underlying recovery: %d %v", intrinsic, err)
	}
	w := accountingWallet(t, db)
	p := model.Position{UserUUID: w.UserUUID, Symbol: ref.Symbol, Product: model.OrderProductFNO, Quantity: 10, AveragePricePaise: 10000, CostBasisPaise: 100000}
	if err := db.Create(&p).Error; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := s.settleExpiredPosition(p.UUID, price, product.InstrumentFuture); err != nil {
			t.Fatal(err)
		}
	}
	var count int64
	db.Model(&model.Trade{}).Where("user_uuid = ?", w.UserUUID).Count(&count)
	if count != 1 {
		t.Fatalf("duplicate settlement trades=%d", count)
	}
	if _, err := s.finalQuotePrice(ref.Symbol, "25SEP2026"); err == nil {
		t.Fatal("different session reference accepted")
	}
	ref.Source = "synthetic_gbm"
	db.Save(&ref)
	if _, err := s.finalQuotePrice(ref.Symbol, "24SEP2026"); err == nil {
		t.Fatal("synthetic reference used in LIVE mode")
	}
}
