package service

import (
	"math"
	"testing"
)

func TestSettlementArithmetic(t *testing.T) {
	if _, ok := multiply(math.MaxInt64, 2); ok {
		t.Fatal("expected multiplication overflow to be rejected")
	}
	if _, ok := add(math.MaxInt64, 1); ok {
		t.Fatal("expected positive addition overflow to be rejected")
	}
	if total, ok := multiply(10, 12_000); !ok || total != 120_000 {
		t.Fatalf("multiply returned (%d, %v), want (120000, true)", total, ok)
	}
}

func TestOnlyDeliveryIsSupportedUntilProductRulesExist(t *testing.T) {
	if !isSupportedProduct("DELIVERY") {
		t.Fatal("delivery orders must remain available")
	}
	for _, product := range []string{"INTRADAY", "FNO", ""} {
		if isSupportedProduct(product) {
			t.Fatalf("%q must be rejected until its product rules exist", product)
		}
	}
}
