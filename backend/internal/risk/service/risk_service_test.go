package service

import (
	"math"
	"testing"
)

func evaluateMarginStatus(blockedPaise, accountEquity int64) (float64, string, string) {
	if blockedPaise <= 0 {
		return 0.0, "HEALTHY", "Margin health is optimal and well within regulatory maintenance requirements."
	}
	if accountEquity <= 0 {
		return 999.0, "CRITICAL", "CRITICAL: Severe margin deficit. Intraday positions subject to immediate liquidation."
	}
	utilization := math.Round((float64(blockedPaise)*100.0/float64(accountEquity))*100) / 100
	if utilization >= 120.0 {
		return utilization, "CRITICAL", "CRITICAL: Margin utilization exceeds 120%. High-risk intraday positions subject to liquidation."
	} else if utilization >= 100.0 {
		return utilization, "MARGIN_CALL", "MARGIN CALL: Blocked margin exceeds available equity. Close positions to restore margin health."
	} else if utilization >= 80.0 {
		return utilization, "WARNING", "MARGIN WARNING: Over 80% of account equity is utilized. Monitor adverse price swings."
	}
	return utilization, "HEALTHY", "Margin health is optimal and well within regulatory maintenance requirements."
}

func TestMarginRiskTiers(t *testing.T) {
	equity := int64(1_000_000_00) // ₹10,00,000

	// 1. Healthy: 20% utilization
	util, status, _ := evaluateMarginStatus(200_000_00, equity)
	if status != "HEALTHY" || util != 20.0 {
		t.Fatalf("expected HEALTHY at 20%%, got (%s, %.2f)", status, util)
	}

	// 2. Warning: 85% utilization
	util, status, _ = evaluateMarginStatus(850_000_00, equity)
	if status != "WARNING" || util != 85.0 {
		t.Fatalf("expected WARNING at 85%%, got (%s, %.2f)", status, util)
	}

	// 3. Margin Call: 105% utilization
	util, status, _ = evaluateMarginStatus(1_050_000_00, equity)
	if status != "MARGIN_CALL" || util != 105.0 {
		t.Fatalf("expected MARGIN_CALL at 105%%, got (%s, %.2f)", status, util)
	}

	// 4. Critical: 125% utilization
	util, status, _ = evaluateMarginStatus(1_250_000_00, equity)
	if status != "CRITICAL" || util != 125.0 {
		t.Fatalf("expected CRITICAL at 125%%, got (%s, %.2f)", status, util)
	}

	// 5. Critical: Negative equity
	util, status, _ = evaluateMarginStatus(100_000_00, -50_000_00)
	if status != "CRITICAL" || util != 999.0 {
		t.Fatalf("expected CRITICAL on negative equity, got (%s, %.2f)", status, util)
	}
}
