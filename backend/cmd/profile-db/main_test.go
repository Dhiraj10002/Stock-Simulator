package main

import "testing"

func TestSummaryUsesNearestRankAndSortsSamples(t *testing.T) {
	got := summarize([]float64{10, 1, 100, 2, 3})
	if got.MinMs != 1 || got.P50Ms != 3 || got.P95Ms != 100 || got.MaxMs != 100 {
		t.Fatalf("unexpected latency distribution: %+v", got)
	}
}
