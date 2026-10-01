package calendar

import (
	"testing"
	"time"
)

func TestSourcedCalendarAndAdmissionAgree(t *testing.T) {
	snapshot := Snapshot(2026)
	if !snapshot.Available || len(snapshot.Holidays) != 19 {
		t.Fatalf("incomplete sourced calendar: %+v", snapshot)
	}
	for _, h := range snapshot.Holidays {
		d, err := time.ParseInLocation("2006-01-02", h.Date, Location())
		if err != nil {
			t.Fatal(err)
		}
		at := d.Add(11 * time.Hour)
		if IsMarketOpen(at) || ValidateNewOrderSession(at) == nil {
			t.Fatalf("holiday admitted: %s", h.Date)
		}
	}
	// The prior copied schedule incorrectly blocked March 20 and May 27.
	for _, day := range []string{"2026-03-20", "2026-05-27"} {
		d, _ := time.ParseInLocation("2006-01-02", day, Location())
		if !IsMarketOpen(d.Add(11 * time.Hour)) {
			t.Fatalf("regular session closed: %s", day)
		}
	}
	if Snapshot(2027).Available || IsMarketOpen(time.Date(2027, 1, 4, 11, 0, 0, 0, Location())) || ValidateNewOrderSession(time.Date(2027, 1, 4, 11, 0, 0, 0, Location())) == nil {
		t.Fatal("unknown calendar year admitted")
	}
}
