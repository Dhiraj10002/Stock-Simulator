package product

import "testing"

func TestRegressionDatedContracts(t *testing.T) {
	for _, tc := range []struct{ symbol, expiry, strike string }{
		{"TCS29SEP261940CE", "2026-09-29", "1940.000000"},
		{"TCS27OCT262140PE", "2026-10-27", "2140.000000"},
		{"NIFTY29SEP26FUT", "2026-09-29", "0.000000"},
	} {
		inst, err := ParseSyntheticFNOContract(tc.symbol)
		if err != nil {
			t.Fatal(err)
		}
		if inst.Expiry != tc.expiry || inst.Strike != tc.strike {
			t.Fatalf("%s: got expiry=%s strike=%s", tc.symbol, inst.Expiry, inst.Strike)
		}
	}
	for _, symbol := range []string{"RELIANCE", "ELECTCAST", "IRCTC", "SETCO", "TCS31FEB261940CE", "TCS 0 CE"} {
		if IsSyntheticContract(symbol) {
			t.Errorf("recognized invalid derivative %s", symbol)
		}
	}
}
func TestRegressionExpiryFormats(t *testing.T) {
	for _, value := range []string{"2026-09-29", "29SEP2026", "29-Sep-2026"} {
		expiry, err := ParseContractExpiry(value)
		if err != nil || expiry.Format("2006-01-02 15:04") != "2026-09-29 15:30" {
			t.Fatalf("%s: %v %v", value, expiry, err)
		}
	}
}
