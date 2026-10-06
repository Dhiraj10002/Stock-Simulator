package service

import (
	"math/big"
	"regexp"
	"strings"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
)

var identityDecimalPattern = regexp.MustCompile(`^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$`)

// sameDerivativeIdentity compares contract values, not their storage formatting.
// It never rescales strikes or rounds away a difference in their numeric value.
func sameDerivativeIdentity(prior, next model.Instrument) bool {
	if prior.InstrumentType != next.InstrumentType {
		return false
	}
	if prior.Expiry != next.Expiry {
		oldExpiry, oldErr := ParseExpiryDate(prior.Expiry, nil)
		newExpiry, newErr := ParseExpiryDate(next.Expiry, nil)
		if oldErr != nil || newErr != nil || !oldExpiry.Equal(newExpiry) {
			return false
		}
	}
	if prior.Strike == next.Strike {
		return true
	}
	oldStrike, oldOK := identityDecimal(prior.Strike)
	newStrike, newOK := identityDecimal(next.Strike)
	if next.InstrumentType == "FUTIDX" || next.InstrumentType == "FUTSTK" {
		// Legacy imports stored Angel's -1 sentinel; canonical futures omit it.
		noStrike := func(raw string, value *big.Rat, valid bool) bool {
			return strings.TrimSpace(raw) == "" || (valid && value.Cmp(big.NewRat(-1, 1)) == 0)
		}
		if noStrike(prior.Strike, oldStrike, oldOK) && noStrike(next.Strike, newStrike, newOK) {
			return true
		}
	}
	return oldOK && newOK && oldStrike.Sign() > 0 && newStrike.Sign() > 0 && oldStrike.Cmp(newStrike) == 0
}

func identityDecimal(raw string) (*big.Rat, bool) {
	clean := strings.TrimSpace(raw)
	if !identityDecimalPattern.MatchString(clean) {
		return nil, false
	}
	return new(big.Rat).SetString(clean)
}
