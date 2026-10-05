package calendar

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

const (
	SegmentNSE    = "NSE"
	SegmentNFO    = "NFO"
	SegmentBSE    = "BSE"
	SegmentNSECAS = "NSE_CAS"
)

var (
	// istLocation caches the Asia/Kolkata timezone with guaranteed fallback
	// so environments without tzdata still resolve IST (UTC+5:30) accurately.
	istLocation = func() *time.Location {
		loc, err := time.LoadLocation("Asia/Kolkata")
		if err != nil {
			return time.FixedZone("IST", 5*3600+30*60)
		}
		return loc
	}()

	// nseHolidays stores NSE 2026 weekday trading holidays for the cash and
	// equity-derivatives sessions. Weekend observances are intentionally omitted
	// because IsWeekend already closes those sessions independently.
	// Source: current NSE holiday publication, plus the January 15, 2026
	// F&O holiday circular that modified the December 2025 schedule.
	nseHolidays = map[string]string{
		"2026-01-15": "Municipal Corporation Election - Maharashtra",
		"2026-01-26": "Republic Day",
		"2026-03-03": "Holi",
		"2026-03-26": "Shri Ram Navami",
		"2026-03-31": "Shri Mahavir Jayanti",
		"2026-04-03": "Good Friday",
		"2026-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
		"2026-05-01": "Maharashtra Day",
		"2026-05-28": "Bakri Id",
		"2026-06-26": "Muharram",
		"2026-09-14": "Ganesh Chaturthi",
		"2026-10-02": "Mahatma Gandhi Jayanti",
		"2026-10-20": "Dussehra",
		"2026-11-08": "Diwali Laxmi Pujan (Muhurat times pending)",
		"2026-11-10": "Diwali-Balipratipada",
		"2026-11-24": "Prakash Gurpurb Sri Guru Nanak Dev",
		"2026-12-25": "Christmas",
	}
)

// Location returns the Indian Standard Time (*time.Location).
func Location() *time.Location {
	return istLocation
}

// IsWeekend reports whether the given time falls on Saturday or Sunday in IST.
func IsWeekend(t time.Time) bool {
	ist := t.In(istLocation)
	weekday := ist.Weekday()
	return weekday == time.Saturday || weekday == time.Sunday
}

// IsTradingHoliday reports whether the date is an exchange holiday in IST,
// returning the holiday name if applicable.
func IsTradingHoliday(t time.Time) (bool, string) {
	ist := t.In(istLocation)
	dateKey := ist.Format("2006-01-02")
	name, found := nseHolidays[dateKey]
	return found, name
}

// SegmentSessionBounds returns segment-specific session open, MIS cutoff, and close
// for the given day in IST per the official exchange schedules:
// - Non-CAS cash equities (NSE/BSE): 09:15 to 15:30 IST
// - Closing Auction Session (CAS) cash: 15:15 to 15:35 IST
// - Equity derivatives (NFO): 09:15 to 15:40 IST (trading and matching until 15:40 IST)
// - Simulator MIS Cutoff: 15:20 IST (simulator risk policy, not exchange closing)
func SegmentSessionBounds(t time.Time, segment string) (marketOpen, misCutoff, marketClose time.Time) {
	ist := t.In(istLocation)
	y, m, d := ist.Year(), ist.Month(), ist.Day()
	marketOpen = time.Date(y, m, d, 9, 15, 0, 0, istLocation)
	// Simulator MIS Cutoff: 15:20 IST is an internal simulator risk policy for
	// intraday square-off, distinct from official exchange closing hours.
	misCutoff = time.Date(y, m, d, 15, 20, 0, 0, istLocation)

	seg := strings.ToUpper(strings.TrimSpace(segment))
	switch {
	case seg == "NFO" || seg == "FO" || seg == "FNO" || seg == "DERIVATIVES":
		// Equity derivatives (NFO): 09:15 to 15:40 IST per August 2026 circular
		closeMinute := 30
		if !ist.Before(time.Date(2026, time.August, 3, 0, 0, 0, 0, istLocation)) {
			closeMinute = 40
		}
		marketClose = time.Date(y, m, d, 15, closeMinute, 0, 0, istLocation)
	case seg == "NSE_CAS" || seg == "CAS":
		// Closing Auction Session (CAS): 15:15 to 15:35 IST
		marketOpen = time.Date(y, m, d, 15, 15, 0, 0, istLocation)
		marketClose = time.Date(y, m, d, 15, 35, 0, 0, istLocation)
	default:
		// Regular Non-CAS Cash equity session: 09:15 to 15:30 IST
		marketClose = time.Date(y, m, d, 15, 30, 0, 0, istLocation)
	}
	return
}

// SessionBounds returns the 09:15 open, 15:20 MIS cutoff, and 15:30 close
// for regular cash equity trading in IST.
func SessionBounds(t time.Time) (marketOpen, misCutoff, marketClose time.Time) {
	return SegmentSessionBounds(t, SegmentNSE)
}

// IsMarketOpen reports whether Indian stock exchanges (NSE/BSE) are currently
// in regular trading session (09:15 to 15:30 IST, Monday through Friday,
// excluding exchange holidays).
func IsMarketOpen(t time.Time) bool {
	return IsMarketOpenForSegment(t, SegmentNSE)
}

// IsMarketOpenForSegment reports whether the specified market segment is currently
// in trading session for the given IST timestamp.
func IsMarketOpenForSegment(t time.Time, segment string) bool {
	if t.In(istLocation).Year() != 2026 {
		return false
	}
	if IsWeekend(t) {
		return false
	}
	if isHoliday, _ := IsTradingHoliday(t); isHoliday {
		return false
	}
	ist := t.In(istLocation)
	open, _, closeTime := SegmentSessionBounds(ist, segment)
	return !ist.Before(open) && ist.Before(closeTime)
}

// ValidateNewOrderSession checks whether new cash equity orders can be accepted.
// Per product specification:
// - New orders are rejected outside the trading session (09:15-15:30 IST, Mon-Fri).
// - Existing open limit orders remain open across sessions and are not rejected here.
func ValidateNewOrderSession(t time.Time) error {
	return ValidateNewOrderSessionForSegment(t, SegmentNSE)
}

// ValidateNewOrderSessionForSegment checks whether new orders can be accepted for the
// given segment (e.g. NFO derivatives open until 15:40 IST; cash equities until 15:30 IST).
func ValidateNewOrderSessionForSegment(t time.Time, segment string) error {
	ist := t.In(istLocation)
	if ist.Year() != 2026 {
		return fmt.Errorf("verified exchange calendar unavailable for %d", ist.Year())
	}
	if IsWeekend(ist) {
		return fmt.Errorf("market is closed on weekends; regular trading hours are Monday to Friday 09:15 to 15:30 IST")
	}
	if isHoliday, holidayName := IsTradingHoliday(ist); isHoliday {
		return fmt.Errorf("market is closed for %s; regular trading hours are Monday to Friday 09:15 to 15:30 IST", holidayName)
	}
	open, _, closeTime := SegmentSessionBounds(ist, segment)
	if ist.Before(open) {
		return fmt.Errorf("market is closed; trading session opens at %s (current time: %s)", open.Format("15:04 IST"), ist.Format("15:04:05 IST"))
	}
	if !ist.Before(closeTime) {
		return fmt.Errorf("market is closed; trading session closed at %s (current time: %s)", closeTime.Format("15:04 IST"), ist.Format("15:04:05 IST"))
	}
	return nil
}

// ValidateMISCutoff checks whether new MIS (intraday) orders are allowed.
// MIS orders are rejected if the market is closed or after 15:20 IST.
// Note: 15:20 MIS Cutoff is a simulator risk policy, not an exchange closing.
func ValidateMISCutoff(t time.Time) error {
	if err := ValidateNewOrderSession(t); err != nil {
		return err
	}
	ist := t.In(istLocation)
	_, cutoff, _ := SessionBounds(ist)
	if !ist.Before(cutoff) {
		return fmt.Errorf("MIS orders are not accepted after 15:20 IST (current time: %s)", ist.Format("15:04:05 IST"))
	}
	return nil
}

// Snapshot is shared by the dashboard and order-session policy. A future year
// is unavailable until a new sourced calendar is installed.
type Holiday struct {
	Date          string `json:"date"`
	Occasion      string `json:"occasion"`
	SessionStatus string `json:"session_status"`
}
type CalendarSnapshot struct {
	Year      int       `json:"year"`
	Available bool      `json:"available"`
	Exchange  string    `json:"exchange"`
	SourceURL string    `json:"source_url"`
	Version   string    `json:"version"`
	Holidays  []Holiday `json:"holidays"`
}

func Snapshot(year int) CalendarSnapshot {
	result := CalendarSnapshot{Year: year, Available: year == 2026, Exchange: "NSE cash and equity derivatives", Version: "NSE-2026-current-holiday-publication-2026-10-01", SourceURL: "https://www.nseindia.com/resources/exchange-communication-holidays", Holidays: []Holiday{}}
	if !result.Available {
		return result
	}
	for day, name := range nseHolidays {
		status := "CLOSED"
		if day == "2026-11-08" {
			status = "SPECIAL_TIMES_UNCONFIRMED"
		}
		result.Holidays = append(result.Holidays, Holiday{Date: day, Occasion: name, SessionStatus: status})
	}
	sort.Slice(result.Holidays, func(i, j int) bool { return result.Holidays[i].Date < result.Holidays[j].Date })
	return result
}
