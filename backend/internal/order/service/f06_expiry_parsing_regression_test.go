package service

import (
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
)

// TestRegression_F06_ExpiryParsingFailsOpen reproduces defect F06:
// 1. The layout list in expiryDate contains "02JAN2006", where "JAN" is treated
//    by Go's time.Parse as literal text "JAN" rather than the month placeholder "Jan".
// 2. strings.ToUpper causes "02-Jan-2006" to become "02-SEP-2006", failing title-case parsing.
// 3. Any parse failure in isExpired returns false (fails open), causing expired
//    contracts with standard broker formats like "29SEP2026" to never expire.
func TestRegression_F06_ExpiryParsingFailsOpen(t *testing.T) {
	months := []struct {
		expiryStr   string
		expectedMon time.Month
		monthName   string
	}{
		{"29JAN2026", time.January, "January"},
		{"26FEB2026", time.February, "February"},
		{"26MAR2026", time.March, "March"},
		{"30APR2026", time.April, "April"},
		{"28MAY2026", time.May, "May"},
		{"25JUN2026", time.June, "June"},
		{"30JUL2026", time.July, "July"},
		{"27AUG2026", time.August, "August"},
		{"24SEP2026", time.September, "September"},
		{"29SEP2026", time.September, "September"},
		{"29OCT2026", time.October, "October"},
		{"26NOV2026", time.November, "November"},
		{"31DEC2026", time.December, "December"},
	}

	for _, m := range months {
		t.Run("Parse_"+m.expiryStr, func(t *testing.T) {
			parsed, err := expiryDate(m.expiryStr)
			if err != nil {
				// Defect F06 confirmed: all months except January fail because "JAN" is literal in "02JAN2006"
				t.Logf("CONFIRMED DEFECT F06: Valid Angel One format %q failed to parse: %v", m.expiryStr, err)
			} else {
				if m.expectedMon != time.January {
					t.Errorf("Unexpectedly passed for %q: got %v", m.expiryStr, parsed)
				} else {
					t.Logf("Notice: %q passed only because literal 'JAN' matched January", m.expiryStr)
				}
			}
		})
	}

	t.Run("FailOpen_FailsToRecognizeExpiredContract", func(t *testing.T) {
		// Reference time: 2026-10-01 16:00:00 (definitely after 29-SEP-2026 15:30:00 cutoff)
		loc := calendar.Location()
		nowAfterExpiry := time.Date(2026, 10, 1, 16, 0, 0, 0, loc)

		// With valid ISO format, it recognizes expiry:
		if !isExpired("2026-09-29", nowAfterExpiry) {
			t.Errorf("expected 2026-09-29 to be recognized as expired")
		}

		// With broker master format "29SEP2026", isExpired fails open:
		expiredResult := isExpired("29SEP2026", nowAfterExpiry)
		if !expiredResult {
			t.Logf("CONFIRMED DEFECT F06: isExpired('29SEP2026') returned FALSE on 2026-10-01 because parse error fails open")
		} else {
			t.Errorf("Expected isExpired('29SEP2026') to fail open (return false) in unfixed code")
		}
	})

	t.Run("HyphenatedMonthTitleCaseRejection", func(t *testing.T) {
		// "29-Sep-2026" uppercased to "29-SEP-2026" fails "02-Jan-2006"
		parsed, err := expiryDate("29-Sep-2026")
		if err != nil {
			t.Logf("CONFIRMED DEFECT F06: '29-Sep-2026' failed to parse due to strings.ToUpper: %v", err)
		} else {
			t.Logf("Parsed: %v", parsed)
		}
	})
}
