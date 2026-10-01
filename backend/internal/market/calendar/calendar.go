package calendar

import (
	"fmt"
	"sort"
	"time"
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

	// nseHolidays stores recognized NSE holidays in YYYY-MM-DD format.
	// Versioned from NSE/CMTR/71775 and NSE/FAOP/71777 (2025-12-12).
	// Special-session timing must be separately verified before enabling trading.
	nseHolidays = map[string]string{
		"2026-01-26": "Republic Day",
		"2026-03-03": "Holi",
		"2026-03-26": "Shri Ram Navami",
		"2026-03-31": "Shri Mahavir Jayanti",
		"2026-03-21": "Id-Ul-Fitr (Ramadan Eid)",
		"2026-02-15": "Mahashivratri",
		"2026-04-03": "Good Friday",
		"2026-04-14": "Dr. Baba Saheb Ambedkar Jayanti",
		"2026-05-01": "Maharashtra Day",
		"2026-05-28": "Bakri Id",
		"2026-06-26": "Muharram",
		"2026-09-14": "Ganesh Chaturthi",
		"2026-08-15": "Independence Day",
		"2026-10-02": "Mahatma Gandhi Jayanti",
		"2026-10-20": "Dussehra",
		"2026-11-08": "Diwali Laxmi Pujan (special-session times pending)",
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

// SessionBounds returns the 09:15 open, 15:20 MIS cutoff, and 15:30 close
// for the given day in IST.
func SessionBounds(t time.Time) (marketOpen, misCutoff, marketClose time.Time) {
	ist := t.In(istLocation)
	y, m, d := ist.Year(), ist.Month(), ist.Day()
	marketOpen = time.Date(y, m, d, 9, 15, 0, 0, istLocation)
	misCutoff = time.Date(y, m, d, 15, 20, 0, 0, istLocation)
	marketClose = time.Date(y, m, d, 15, 30, 0, 0, istLocation)
	return
}

// IsMarketOpen reports whether Indian stock exchanges (NSE/BSE) are currently
// in regular trading session (09:15 to 15:30 IST, Monday through Friday,
// excluding exchange holidays).
func IsMarketOpen(t time.Time) bool {
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
	open, _, closeTime := SessionBounds(ist)
	return !ist.Before(open) && !ist.After(closeTime)
}

// ValidateNewOrderSession checks whether new orders can be accepted.
// Per product specification:
// - New orders are rejected outside the trading session (09:15-15:30 IST, Mon-Fri).
// - Existing open limit orders remain open across sessions and are not rejected here.
func ValidateNewOrderSession(t time.Time) error {
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
	open, _, closeTime := SessionBounds(ist)
	if ist.Before(open) {
		return fmt.Errorf("market is closed; trading session opens at 09:15 IST (current time: %s)", ist.Format("15:04:05 IST"))
	}
	if ist.After(closeTime) {
		return fmt.Errorf("market is closed; trading session closed at 15:30 IST (current time: %s)", ist.Format("15:04:05 IST"))
	}
	return nil
}

// ValidateMISCutoff checks whether new MIS (intraday) orders are allowed.
// MIS orders are rejected if the market is closed or after 15:20 IST.
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
	result := CalendarSnapshot{Year: year, Available: year == 2026, Exchange: "NSE cash and equity derivatives", Version: "NSE-CMTR-71775-FAOP-71777", SourceURL: "https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf", Holidays: []Holiday{}}
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
