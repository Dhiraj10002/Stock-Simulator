package dto

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestZeroDailyChangeRetainedInJSON(t *testing.T) {
	data, err := json.Marshal(QuoteResponse{Symbol: "TCS", PricePaise: 10000, PreviousClosePaise: 10000, DayChangeAvailable: true})
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{`"change_paise":0`, `"change_percent":0`, `"day_change_available":true`} {
		if !strings.Contains(string(data), field) {
			t.Fatalf("missing %s in %s", field, data)
		}
	}
}
