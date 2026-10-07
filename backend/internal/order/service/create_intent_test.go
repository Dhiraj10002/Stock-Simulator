package service

import (
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"testing"
	"time"
)

func TestCreateIntentReplayAfterCloseDoesNotFillTwice(t *testing.T) {
	db := accountingDB(t)
	wallet := accountingWallet(t, db)
	s := accountingService()
	ensureInstrumentExists(t, db, "INTENT-EQ", "EQUITY")
	quote := func(symbol string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{Symbol: symbol, PricePaise: 10000}, nil
	}
	s.SetExecutableQuoteFunc(quote)
	s.SetCurrentQuoteFunc(quote)
	req := dto.CreateOrderRequest{Symbol: "INTENT-EQ", Side: "BUY", Type: "MARKET", Product: "DELIVERY", Quantity: 1}
	first, err := s.Create(wallet.UserUUID.String(), req, "durable-key")
	if err != nil {
		t.Fatal(err)
	}
	if first.Status != model.OrderStatusExecuted {
		t.Fatalf("unexpected status %s", first.Status)
	}
	s.SetNowFunc(func() time.Time { return time.Date(2026, 9, 16, 23, 0, 0, 0, time.UTC) })
	again, err := s.Create(wallet.UserUUID.String(), req, "durable-key")
	if err != nil || again.UUID != first.UUID {
		t.Fatalf("replay: %v %#v", err, again)
	}
	var count int64
	db.Model(&model.Trade{}).Where("user_uuid = ?", wallet.UserUUID).Count(&count)
	if count != 1 {
		t.Fatalf("fills=%d", count)
	}
	req.Quantity = 2
	if _, err := s.Create(wallet.UserUUID.String(), req, "durable-key"); err == nil {
		t.Fatal("changed retry payload accepted")
	}
}
