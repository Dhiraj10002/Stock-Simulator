package service

import (
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
)

// TestRegression_F06_ExpiryParsingResolved verifies that:
// 1. All 12 monthly expiry formats from Angel One (DDMMMYYYY) parse with exact month resolution.
// 2. Both hyphenated ("29-Sep-2026", "29-SEP-2026") and non-hyphenated ("29SEP2026") strings parse correctly.
// 3. isExpired correctly recognizes expired contracts and fails closed on malformed dates.
func TestRegression_F06_ExpiryParsingResolved(t *testing.T) {
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
				t.Fatalf("Valid Angel One format %q failed to parse: %v", m.expiryStr, err)
			}
			if parsed.Month() != m.expectedMon {
				t.Fatalf("Month mismatch for %q: expected %s (%d), got %s (%d)",
					m.expiryStr, m.monthName, m.expectedMon, parsed.Month(), parsed.Month())
			}
			if parsed.Year() != 2026 {
				t.Fatalf("Year mismatch for %q: expected 2026, got %d", m.expiryStr, parsed.Year())
			}
		})
	}

	t.Run("FailClosed_RecognizesExpiredContract", func(t *testing.T) {
		loc := calendar.Location()
		nowAfterExpiry := time.Date(2026, 10, 1, 16, 0, 0, 0, loc)

		// Standard broker master format "29SEP2026" must be recognized as expired on 2026-10-01
		if !isExpired("29SEP2026", nowAfterExpiry) {
			t.Fatalf("expected 29SEP2026 to be recognized as expired on 2026-10-01")
		}

		// Active trading time on expiry day morning (10:00 AM) must NOT be expired
		morningOfExpiry := time.Date(2026, 9, 29, 10, 0, 0, 0, loc)
		if isExpired("29SEP2026", morningOfExpiry) {
			t.Fatalf("expected 29SEP2026 to be active on morning of expiry")
		}

		// Cutoff at 15:30:00 IST on expiry day must be expired
		cutoffTime := time.Date(2026, 9, 29, 15, 30, 0, 0, loc)
		if !isExpired("29SEP2026", cutoffTime) {
			t.Fatalf("expected 29SEP2026 to be expired at 15:30:00 IST cutoff")
		}

		// Malformed/unparseable expiry date must FAIL CLOSED (return true) to prevent trading bad contracts
		if !isExpired("MALFORMED_DATE", morningOfExpiry) {
			t.Fatalf("expected malformed expiry date to fail closed (isExpired = true)")
		}
	})

	t.Run("HyphenatedAndTitleCaseFormats", func(t *testing.T) {
		testCases := []string{
			"29-Sep-2026",
			"29-SEP-2026",
			"29-sep-2026",
			"2026-09-29",
		}
		for _, tc := range testCases {
			parsed, err := expiryDate(tc)
			if err != nil {
				t.Fatalf("format %q failed to parse: %v", tc, err)
			}
			if parsed.Month() != time.September || parsed.Day() != 29 || parsed.Year() != 2026 {
				t.Fatalf("unexpected parsed result for %q: %v", tc, parsed)
			}
		}
	})
}
