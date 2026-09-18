package greeks

import (
	"math"
	"testing"
)

func TestBlackScholesGreeks(t *testing.T) {
	spot := 25000.0
	strike := 25000.0 // ATM
	timeYears := 7.0 / 365.0
	rate := 0.065
	vol := 0.15

	call := CalculateGreeks(spot, strike, timeYears, rate, vol, true)
	put := CalculateGreeks(spot, strike, timeYears, rate, vol, false)

	// 1. Call Delta should be approximately 0.50 - 0.55
	if call.Delta <= 0.45 || call.Delta >= 0.60 {
		t.Fatalf("expected ATM Call Delta around 0.50-0.55, got %f", call.Delta)
	}

	// 2. Put Delta should be approximately -0.45 to -0.55
	if put.Delta >= -0.40 || put.Delta <= -0.60 {
		t.Fatalf("expected ATM Put Delta around -0.45 to -0.55, got %f", put.Delta)
	}

	// 3. Gamma should be strictly positive
	if call.Gamma <= 0 || put.Gamma <= 0 {
		t.Fatalf("expected positive Gamma, got Call: %f, Put: %f", call.Gamma, put.Gamma)
	}

	// 4. Vega should be positive
	if call.Vega <= 0 || put.Vega <= 0 {
		t.Fatalf("expected positive Vega, got Call: %f, Put: %f", call.Vega, put.Vega)
	}

	// 5. Theta should be negative (time decay)
	if call.Theta >= 0 || put.Theta >= 0 {
		t.Fatalf("expected negative Theta, got Call: %f, Put: %f", call.Theta, put.Theta)
	}

	// 6. Put-Call Parity: C - P = S - K * exp(-r*T)
	discountFactor := math.Exp(-rate * timeYears)
	expectedDiff := spot - strike*discountFactor
	actualDiff := call.Price - put.Price
	if math.Abs(actualDiff-expectedDiff) > 2.0 {
		t.Fatalf("Put-Call parity violation: |%f - %f| > 2.0", actualDiff, expectedDiff)
	}
}

func TestDeepITMAndOTMDelta(t *testing.T) {
	spot := 25000.0
	deepITMStrike := 22000.0 // +3000 ITM
	deepOTMStrike := 28000.0 // +3000 OTM
	timeYears := 14.0 / 365.0
	rate := 0.065
	vol := 0.15

	deepITMCall := CalculateGreeks(spot, deepITMStrike, timeYears, rate, vol, true)
	if deepITMCall.Delta < 0.95 {
		t.Fatalf("expected deep ITM Call delta near 1.0, got %f", deepITMCall.Delta)
	}

	deepOTMCall := CalculateGreeks(spot, deepOTMStrike, timeYears, rate, vol, true)
	if deepOTMCall.Delta > 0.05 {
		t.Fatalf("expected deep OTM Call delta near 0.0, got %f", deepOTMCall.Delta)
	}
}
