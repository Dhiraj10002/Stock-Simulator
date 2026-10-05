package service

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/testutil"
	"github.com/google/uuid"
)

func TestHistoricalRecoveryDiagnosesBrokerFailureAndRetainsAuthenticBars(t *testing.T) {
	client := testutil.RequireDisposableRedis(t)
	defer client.Close()
	s, err := New(os.Getenv("TEST_REDIS_URL"), time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer s.client.Close()
	s.SetFeedMode(dto.FeedModeLive)
	s.SetInstrumentFinder(func(string) (bool, error) { return true, nil })
	symbol := "HISTORY" + strings.ToUpper(uuid.NewString()[:8])
	ctx := context.Background()
	key, stateKey := historyKey(symbol)+":ONE_HOUR", "market:history:status:"+symbol+":ONE_HOUR"
	defer client.Del(ctx, key, stateKey)
	defer client.ZRem(ctx, "market:history:demand", symbol+"|ONE_HOUR")
	for _, state := range []string{"REJECTED", "ERROR", "EMPTY"} {
		if err := client.HSet(ctx, stateKey, "state", state).Err(); err != nil {
			t.Fatal(err)
		}
		if _, err := s.HistoricalQuotes(symbol, 500, "ONE_HOUR"); !errors.Is(err, ErrHistoryUnavailable) {
			t.Fatalf("%s must diagnose missing broker history: %v", state, err)
		}
	}
	if _, err := client.ZScore(ctx, "market:history:demand", symbol+"|ONE_HOUR").Result(); err != nil {
		t.Fatalf("failed request must retain asynchronous recovery demand: %v", err)
	}
	candle := dto.CandleResponse{Timestamp: time.Now().Add(-time.Hour).Unix(), OpenPaise: 10000, HighPaise: 10200, LowPaise: 9900, ClosePaise: 10100, Volume: 0, Source: "angelone_live", FeedMode: "LIVE"}
	data, _ := json.Marshal(candle)
	if err := client.RPush(ctx, key, string(data)).Err(); err != nil {
		t.Fatal(err)
	}
	bars, err := s.HistoricalQuotes(symbol, 500, "ONE_HOUR")
	if err != nil || len(bars) != 1 || bars[0].ClosePaise != 10100 {
		t.Fatalf("verified retained index bars must survive failed provider refresh: %+v %v", bars, err)
	}
}
