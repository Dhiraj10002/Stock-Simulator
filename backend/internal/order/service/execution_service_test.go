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
