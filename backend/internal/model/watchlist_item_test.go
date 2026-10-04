package model

import (
	"encoding/json"
	"testing"
)

func TestWatchlistJSONMatchesClientContract(t *testing.T) {
	encoded, err := json.Marshal(WatchlistItem{Symbol: "RELIANCE-EQ"})
	if err != nil {
		t.Fatal(err)
	}
	var row map[string]any
	if err = json.Unmarshal(encoded, &row); err != nil {
		t.Fatal(err)
	}
	if row["symbol"] != "RELIANCE-EQ" || row["Symbol"] != nil {
		t.Fatalf("client symbol contract broken: %s", encoded)
	}
	for _, key := range []string{"id", "uuid", "user_uuid", "created_at"} {
		if _, ok := row[key]; !ok {
			t.Fatalf("missing JSON field: %s", key)
		}
	}
}
