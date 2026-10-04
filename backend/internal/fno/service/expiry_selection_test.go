package service

import (
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	"testing"
	"time"
)

func TestNearestOpenExpiryUsesExchangeCutoff(t *testing.T) {
	before := time.Date(2026, 10, 6, 15, 29, 0, 0, calendar.Location())
	expiries := []string{"bad", "2026-10-01", "2026-10-13", "06OCT2026"}
	if got := nearestOpenExpiry(expiries, before); got != "06OCT2026" {
		t.Fatalf("expiry-day contract lost: %s", got)
	}
	if got := nearestOpenExpiry(expiries, before.Add(time.Minute)); got != "2026-10-13" {
		t.Fatalf("closed expiry selected: %s", got)
	}
	if got := nearestOpenExpiry([]string{"bad", "2026-10-01"}, before); got != "" {
		t.Fatalf("invalid/expired fallback: %s", got)
	}
}
