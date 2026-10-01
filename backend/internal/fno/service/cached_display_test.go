package service

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/product"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/testutil"
	"github.com/google/uuid"
)

func TestCachedOptionPriceIsStaleDisplayOnly(t *testing.T) {
	client := testutil.RequireDisposableRedis(t)
	market, err := marketService.New(os.Getenv("TEST_REDIS_URL"), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer market.Client().Close()
	market.SetFeedMode(marketDTO.FeedModeLive)
	market.SetInstrumentFinder(func(string) (bool, error) { return true, nil })
	symbol := "DISPLAY" + strings.ToUpper(uuid.NewString()[:18]) + "CE"
	key := "market:quote:" + symbol
	// Quote keys use the same source/identity contract as the actual worker.
	if err := client.HSet(context.Background(), key, map[string]any{"symbol": symbol, "price_paise": "12500", "updated_at": time.Now().Add(-time.Hour).UTC().Format(time.RFC3339), "source": "angelone_live", "open_interest": "0", "previous_close_paise": "12500", "day_change_available": "true", "change_paise": "0", "change_percent": "0"}).Err(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { client.Del(context.Background(), key) })
	inst := model.Instrument{Symbol: symbol, Strike: "25000", Expiry: time.Now().Add(7 * 24 * time.Hour).Format("02Jan2006"), OptionType: "CE", LotSize: 25}
	s := New(market)
	resp, err := s.buildFromRealInstruments("NIFTY", inst.Expiry, 2500000, 25000, []model.Instrument{inst}, product.ContractSpec{LotSize: 25}, marketDTO.FeedModeLive)
	if err != nil {
		t.Fatal(err)
	}
	s.annotateDisplay(resp)
	if len(resp.Strikes) != 1 {
		t.Fatalf("unexpected chain: %+v", resp)
	}
	c := resp.Strikes[0].Call
	if !c.IsAvailable || !c.IsQuoteStale || c.QuoteStatus != "STALE" || c.LTPPaise != 12500 || !c.DayChangeAvailable || c.ChangePaise != 0 {
		t.Fatalf("cached price lost availability/freshness: %+v", c)
	}
	if _, err := market.ExecutableQuote(symbol); err == nil {
		t.Fatal("cached stale quote executable")
	}
}
