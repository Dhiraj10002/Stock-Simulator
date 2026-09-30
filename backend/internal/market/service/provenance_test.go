package service

import (
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"testing"
	"time"
)

func TestHistoricalProvenanceModeSwitch(t *testing.T) {
	c := dto.CandleResponse{Timestamp: time.Now().Add(-time.Hour).Unix(), OpenPaise: 100, HighPaise: 110, LowPaise: 90, ClosePaise: 105, Volume: 5, Source: "synthetic_gbm", FeedMode: "SYNTHETIC"}
	if !ValidHistoricalCandle(c, dto.FeedModeSynthetic, false, time.Now()) {
		t.Fatal("valid synthetic history rejected")
	}
	if ValidHistoricalCandle(c, dto.FeedModeLive, false, time.Now()) {
		t.Fatal("synthetic history leaked into LIVE mode")
	}
	c.Source = "angelone_live"
	c.FeedMode = "LIVE"
	if !ValidHistoricalCandle(c, dto.FeedModeLive, false, time.Now()) {
		t.Fatal("valid live history rejected")
	}
	c.Source = ""
	if ValidHistoricalCandle(c, dto.FeedModeLive, false, time.Now()) {
		t.Fatal("unknown source accepted")
	}
}

func TestStreamProvenanceAndFreshness(t *testing.T) {
	s := &Service{}
	s.SetFeedMode(dto.FeedModeLive)
	q := &dto.QuoteResponse{Symbol: "TCS", PricePaise: 100, Source: "angelone_live", UpdatedAt: time.Now().Format(time.RFC3339)}
	if err := s.ValidateStreamQuote(q); err != nil {
		t.Fatal(err)
	}
	q.Source = "synthetic_gbm"
	if s.ValidateStreamQuote(q) == nil {
		t.Fatal("synthetic stream accepted")
	}
	q.Source = "angelone_live"
	q.UpdatedAt = time.Now().Add(-time.Hour).Format(time.RFC3339)
	if s.ValidateStreamQuote(q) == nil {
		t.Fatal("stale stream accepted")
	}
}
