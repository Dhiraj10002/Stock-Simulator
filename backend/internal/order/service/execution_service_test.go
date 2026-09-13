package service

import (
	"math"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
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

func TestSupportedProducts(t *testing.T) {
	for _, product := range []string{"DELIVERY", "INTRADAY", "FNO"} {
		if !isSupportedProduct(product) {
			t.Fatalf("%q must be supported", product)
		}
	}
	if isSupportedProduct("") {
		t.Fatal("empty product must be rejected")
	}
}

func TestLimitMatchingAndExactPartialSaleCostBasis(t *testing.T) {
	buy := &model.Order{Type: model.OrderTypeLimit, Side: model.OrderSideBuy, PricePaise: 10_000}
	if !limitSatisfied(buy, 9_999) || limitSatisfied(buy, 10_001) {
		t.Fatal("buy limit matching is incorrect")
	}
	sell := &model.Order{Type: model.OrderTypeLimit, Side: model.OrderSideSell, PricePaise: 10_000}
	if !limitSatisfied(sell, 10_001) || limitSatisfied(sell, 9_999) {
		t.Fatal("sell limit matching is incorrect")
	}

	allocated, ok := proportionalCostBasis(10_001, 1, 3)
	if !ok || allocated != 3_333 {
		t.Fatalf("first partial allocation = (%d, %v), want (3333, true)", allocated, ok)
	}
	remaining := int64(10_001 - allocated)
	allocated, ok = proportionalCostBasis(remaining, 2, 2)
	if !ok || allocated != remaining {
		t.Fatalf("final allocation = (%d, %v), want (%d, true)", allocated, ok, remaining)
	}
}
