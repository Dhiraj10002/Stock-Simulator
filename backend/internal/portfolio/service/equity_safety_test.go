package service

import (
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
	"testing"
	"time"
)

func TestEquityContribution_ProductAndDirection(t *testing.T) {
	tests := []struct {
		product, kind          string
		qty, entry, mark, want int64
	}{
		{"DELIVERY", "", 10, 100, 110, 1100}, {"INTRADAY", "", 10, 100, 110, 100}, {"INTRADAY", "", -10, 100, 110, -100},
		{"FNO", "FUTURE", 10, 100, 100, 0}, {"FNO", "FUTURE", -10, 100, 110, -100},
		{"FNO", "OPTION", 10, 100, 110, 1100}, {"FNO", "OPTION", -10, 100, 110, -1100},
	}
	for _, tt := range tests {
		value, err := positionEquity(model.Position{Product: tt.product, InstrumentType: tt.kind, Quantity: tt.qty, AveragePricePaise: tt.entry, CurrentPricePaise: tt.mark})
		if err != nil || value != tt.want {
			t.Fatalf("%+v: got %d,%v", tt, value, err)
		}
	}
}
func TestDailyPnlReservationIsNotLoss(t *testing.T) {
	db := getTestDB(t)
	user := uuid.New()
	wallet := model.Wallet{UUID: uuid.New(), UserUUID: user, CashBalancePaise: 100000000, BlockedPaise: 2000000}
	if err := db.Create(&wallet).Error; err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 16, 12, 0, 0, 0, calendar.Location())
	snap := model.AccountDailySnapshot{UserUUID: user, SessionDate: "2026-09-16", OpeningEquityPaise: 100000000}
	if err := db.Create(&snap).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Where("user_uuid = ?", user).Delete(&model.AccountDailySnapshot{})
		db.Where("uuid = ?", wallet.UUID).Delete(&model.Wallet{})
	})
	s := New(nil)
	s.SetNowFunc(func() time.Time { return now })
	result, err := s.Get(user.String())
	if err != nil {
		t.Fatal(err)
	}
	if result.DailyPnlPaise == nil || *result.DailyPnlPaise != 0 {
		t.Fatalf("margin reservation changed profit: %+v", result.DailyPnlPaise)
	}
}
func TestLazyBaselineIncludesFullySoldOvernightHolding(t *testing.T) {
	db := getTestDB(t)
	user := uuid.New()
	wid := uuid.New()
	loc := calendar.Location()
	prior := time.Date(2026, 9, 15, 10, 0, 0, 0, loc)
	now := time.Date(2026, 9, 16, 12, 0, 0, 0, loc)
	wallet := model.Wallet{UUID: wid, UserUUID: user, CashBalancePaise: 100100, CreatedAt: prior.Add(-time.Hour)}
	if err := db.Create(&wallet).Error; err != nil {
		t.Fatal(err)
	}
	txs := []model.WalletTransaction{{UUID: uuid.New(), WalletUUID: wid, Type: model.WalletTransactionInitialCredit, BalancePaise: 100000, CreatedAt: prior.Add(-time.Hour)}, {UUID: uuid.New(), WalletUUID: wid, Type: "DEBIT", AmountPaise: -1000, BalancePaise: 99000, CreatedAt: prior}, {UUID: uuid.New(), WalletUUID: wid, Type: "CREDIT", AmountPaise: 1100, BalancePaise: 100100, CreatedAt: now.Add(-time.Hour)}}
	for _, tx := range txs {
		if err := db.Create(&tx).Error; err != nil {
			t.Fatal(err)
		}
	}
	trades := []model.Trade{{UUID: uuid.New(), OrderUUID: uuid.New(), UserUUID: user, Symbol: "BASELINE", Product: "DELIVERY", Side: "BUY", Quantity: 10, PricePaise: 100, TotalPaise: 1000, ExecutedAt: prior}, {UUID: uuid.New(), OrderUUID: uuid.New(), UserUUID: user, Symbol: "BASELINE", Product: "DELIVERY", Side: "SELL", Quantity: 10, PricePaise: 110, TotalPaise: 1100, ExecutedAt: now.Add(-time.Hour)}}
	for _, tr := range trades {
		if err := db.Create(&tr).Error; err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		db.Where("user_uuid = ?", user).Delete(&model.AccountDailySnapshot{})
		db.Where("user_uuid = ?", user).Delete(&model.Trade{})
		db.Where("wallet_uuid = ?", wid).Delete(&model.WalletTransaction{})
		db.Where("uuid = ?", wid).Delete(&model.Wallet{})
	})
	s := New(nil)
	s.SetNowFunc(func() time.Time { return now })
	s.SetCurrentQuoteFunc(func(string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{PricePaise: 110, PreviousClosePaise: 100, DayChangeAvailable: true, UpdatedAt: now.Format(time.RFC3339)}, nil
	})
	result, err := s.Get(user.String())
	if err != nil {
		t.Fatal(err)
	}
	if result.DailyPnlPaise == nil || *result.DailyPnlPaise != 100 {
		t.Fatalf("sold overnight asset lost from baseline: %+v", result.DailyPnlPaise)
	}
}
