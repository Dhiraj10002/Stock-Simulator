package calendar

import (
	"testing"
	"time"
)

func TestSourcedCalendarAndAdmissionAgree(t *testing.T) {
	snapshot := Snapshot(2026)
	if !snapshot.Available || len(snapshot.Holidays) != 17 {
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
	if holiday, _ := IsTradingHoliday(time.Date(2026, 1, 15, 11, 0, 0, 0, Location())); !holiday {
		t.Fatal("2026-01-15 must be present in the current sourced calendar")
	}
	if Snapshot(2026).Holidays[len(Snapshot(2026).Holidays)-1].Date != "2026-12-25" {
		t.Fatal("calendar holidays are not sorted")
	}
	if Snapshot(2027).Available || IsMarketOpen(time.Date(2027, 1, 4, 11, 0, 0, 0, Location())) || ValidateNewOrderSession(time.Date(2027, 1, 4, 11, 0, 0, 0, Location())) == nil {
		t.Fatal("unknown calendar year admitted")
	}
}
