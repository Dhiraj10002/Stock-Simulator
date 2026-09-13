package service

import "testing"

func TestFutureExpiryPnl(t *testing.T) {
	// Long: (120-100)*75; short has the inverse result.
	if pnl := (int64(12000) - 10000) * 75; pnl != 150000 {
		t.Fatalf("long P&L = %d", pnl)
	}
	if pnl := (int64(10000) - 12000) * -75; pnl != 150000 {
		t.Fatalf("short P&L = %d", pnl)
	}
}

func TestOptionIntrinsic(t *testing.T) {
	for _, test := range []struct {
		kind               string
		spot, strike, want int64
	}{
		{"CALL", 12000, 10000, 2000}, {"CALL", 9000, 10000, 0},
		{"PUT", 8000, 10000, 2000}, {"PUT", 11000, 10000, 0},
	} {
		got, err := optionIntrinsic(test.kind, test.spot, test.strike)
		if err != nil || got != test.want {
			t.Fatalf("%s intrinsic = (%d, %v), want %d", test.kind, got, err, test.want)
		}
	}
	if _, err := optionIntrinsic("", 12000, 10000); err == nil {
		t.Fatal("missing option type was accepted")
	}
}

func TestExpiryInputParsing(t *testing.T) {
	if value, err := parsePaise("25000.000000"); err != nil || value != 2500000 {
		t.Fatalf("strike parse = (%d, %v)", value, err)
	}
	if _, err := parsePaise("100.001"); err == nil {
		t.Fatal("fractional paise accepted")
	}
}
