package product

import (
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"testing"
)

func TestInstrumentProductEligibility(t *testing.T) {
	for _, tc := range []struct {
		kind, token, product string
		wantError            bool
	}{
		{"INDEX", "99926000", "DELIVERY", true},
		{"AMXIDX", "99926000", "INTRADAY", true},
		{"", "99926000", "DELIVERY", true},
		{"FUTSTK", "12345", "DELIVERY", true},
		{"OPTSTK", "12345", "INTRADAY", true},
		{"EQUITY", "2885", "FNO", true},
		{"FUTSTK", "12345", "FNO", false},
		{"OPTIDX", "12345", "FNO", false},
		{"EQUITY", "2885", "DELIVERY", false},
		{"", "2885", "INTRADAY", false},
	} {
		if got := ValidateInstrumentProduct(model.Instrument{InstrumentType: tc.kind, Token: tc.token}, tc.product); (got != nil) != tc.wantError {
			t.Errorf("%+v: unexpected result %v", tc, got)
		}
	}
}
