package calendar

import (
	"strings"
	"testing"
	"time"
)

func TestMarketCalendar_TradingSession(t *testing.T) {
	loc := Location()

	tests := []struct {
		name      string
		timeInIST time.Time
		wantOpen  bool
		wantErr   string
	}{
		{
			name:      "Weekday before market open (09:14:59)",
			timeInIST: time.Date(2026, 9, 16, 9, 14, 59, 0, loc), // Wednesday
			wantOpen:  false,
			wantErr:   "opens at 09:15 IST",
		},
		{
			name:      "Weekday exact market open (09:15:00)",
			timeInIST: time.Date(2026, 9, 16, 9, 15, 0, 0, loc), // Wednesday
			wantOpen:  true,
			wantErr:   "",
		},
		{
			name:      "Weekday active trading hours (11:30:00)",
			timeInIST: time.Date(2026, 9, 16, 11, 30, 0, 0, loc), // Wednesday
			wantOpen:  true,
			wantErr:   "",
		},
		{
			name:      "Weekday exact market close (15:30:00)",
			timeInIST: time.Date(2026, 9, 16, 15, 30, 0, 0, loc), // Wednesday
			wantOpen:  true,
			wantErr:   "",
		},
		{
			name:      "Weekday after market close (15:30:01)",
			timeInIST: time.Date(2026, 9, 16, 15, 30, 1, 0, loc), // Wednesday
			wantOpen:  false,
			wantErr:   "closed at 15:30 IST",
		},
		{
			name:      "Weekday evening (18:00:00)",
			timeInIST: time.Date(2026, 9, 16, 18, 0, 0, 0, loc), // Wednesday
			wantOpen:  false,
			wantErr:   "closed at 15:30 IST",
		},
		{
			name:      "Saturday daytime (11:00:00)",
			timeInIST: time.Date(2026, 9, 19, 11, 0, 0, 0, loc), // Saturday
			wantOpen:  false,
			wantErr:   "closed on weekends",
		},
		{
			name:      "Sunday daytime (14:00:00)",
			timeInIST: time.Date(2026, 9, 20, 14, 0, 0, 0, loc), // Sunday
			wantOpen:  false,
			wantErr:   "closed on weekends",
		},
		{
			name:      "Holiday during market hours (Gandhi Jayanti 2 Oct 2026)",
			timeInIST: time.Date(2026, 10, 2, 11, 0, 0, 0, loc), // Friday, Mahatma Gandhi Jayanti
			wantOpen:  false,
			wantErr:   "Mahatma Gandhi Jayanti",
		},
		{
			name:      "Holiday during market hours (Republic Day 26 Jan 2026)",
			timeInIST: time.Date(2026, 1, 26, 10, 0, 0, 0, loc), // Monday, Republic Day
			wantOpen:  false,
			wantErr:   "Republic Day",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			isOpen := IsMarketOpen(tc.timeInIST)
			if isOpen != tc.wantOpen {
				t.Fatalf("IsMarketOpen(%v) = %v, want %v", tc.timeInIST, isOpen, tc.wantOpen)
			}

			err := ValidateNewOrderSession(tc.timeInIST)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("ValidateNewOrderSession(%v) unexpected error: %v", tc.timeInIST, err)
				}
			} else {
				if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
					t.Fatalf("ValidateNewOrderSession(%v) = %v, want error containing %q", tc.timeInIST, err, tc.wantErr)
				}
			}
		})
	}
}

func TestMarketCalendar_MISCutoff(t *testing.T) {
	loc := Location()

	tests := []struct {
		name      string
		timeInIST time.Time
		wantPass  bool
		wantErr   string
	}{
		{
			name:      "MIS before open (09:00:00)",
			timeInIST: time.Date(2026, 9, 16, 9, 0, 0, 0, loc),
			wantPass:  false,
			wantErr:   "opens at 09:15 IST",
		},
		{
			name:      "MIS normal morning (10:00:00)",
			timeInIST: time.Date(2026, 9, 16, 10, 0, 0, 0, loc),
			wantPass:  true,
		},
		{
			name:      "MIS right before cutoff (15:19:59)",
			timeInIST: time.Date(2026, 9, 16, 15, 19, 59, 0, loc),
			wantPass:  true,
		},
		{
			name:      "MIS exact cutoff (15:20:00)",
			timeInIST: time.Date(2026, 9, 16, 15, 20, 0, 0, loc),
			wantPass:  false,
			wantErr:   "not accepted after 15:20 IST",
		},
		{
			name:      "MIS after cutoff (15:25:00)",
			timeInIST: time.Date(2026, 9, 16, 15, 25, 0, 0, loc),
			wantPass:  false,
			wantErr:   "not accepted after 15:20 IST",
		},
		{
			name:      "MIS weekend",
			timeInIST: time.Date(2026, 9, 20, 11, 0, 0, 0, loc),
			wantPass:  false,
			wantErr:   "closed on weekends",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateMISCutoff(tc.timeInIST)
			if tc.wantPass {
				if err != nil {
					t.Fatalf("ValidateMISCutoff(%v) unexpected error: %v", tc.timeInIST, err)
				}
			} else {
				if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
					t.Fatalf("ValidateMISCutoff(%v) = %v, want error containing %q", tc.timeInIST, err, tc.wantErr)
				}
			}
		})
	}
}

func TestMarketCalendar_UTCConversion(t *testing.T) {
	// 09:15 IST is 03:45 UTC
	utcOpen := time.Date(2026, 9, 16, 3, 45, 0, 0, time.UTC)
	if !IsMarketOpen(utcOpen) {
		t.Fatalf("expected UTC time %v to be recognized as market open in IST", utcOpen)
	}

	// 15:30 IST is 10:00 UTC
	utcClose := time.Date(2026, 9, 16, 10, 0, 0, 0, time.UTC)
	if !IsMarketOpen(utcClose) {
		t.Fatalf("expected UTC time %v to be recognized as market open in IST", utcClose)
	}

	// 15:31 IST is 10:01 UTC (closed)
	utcAfterClose := time.Date(2026, 9, 16, 10, 1, 0, 0, time.UTC)
	if IsMarketOpen(utcAfterClose) {
		t.Fatalf("expected UTC time %v to be recognized as market closed in IST", utcAfterClose)
	}
}
