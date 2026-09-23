package service

import (
	"context"
	"strings"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/ai/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
)

func TestMentorService_Analyze_RuleBasedFallback(t *testing.T) {
	cfg := &config.Config{
		GeminiAPIKey: "",
		GeminiModel:  "gemini-2.0-flash",
	}
	svc := New(cfg)

	tests := []struct {
		name     string
		question string
		expected string
	}{
		{
			name:     "MIS intraday question",
			question: "What happens during 15:20 MIS square-off?",
			expected: "MIS (Margin Intraday Square-off) Rules",
		},
		{
			name:     "FNO derivatives question",
			question: "How do options and futures settle on expiry?",
			expected: "F&O (Futures & Options) Mechanics",
		},
		{
			name:     "Margin and leverage question",
			question: "How does blocked margin work in my wallet?",
			expected: "Virtual Margin & Capital Management",
		},
		{
			name:     "CNC delivery question",
			question: "Can I short-sell delivery CNC shares?",
			expected: "CNC (Cash-and-Carry / Delivery) Rules",
		},
		{
			name:     "General trading question",
			question: "How should I structure my daily routine and setup?",
			expected: "Educational Simulator Copilot",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ans, err := svc.Analyze(context.Background(), "user-123", tc.question)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !strings.Contains(ans, tc.expected) {
				t.Errorf("expected answer to contain %q, got %q", tc.expected, ans)
			}
		})
	}
}

func TestMentorService_BuildRuleBasedCritique(t *testing.T) {
	cfg := &config.Config{
		GeminiAPIKey: "",
		GeminiModel:  "gemini-2.0-flash",
	}
	svc := New(cfg)

	metrics := dto.CritiqueMetrics{
		WinRate:                60.0,
		ConcentrationRisk:      "HIGH",
		LeverageRisk:           "SAFE",
		RevengeTradingDetected: true,
		LimitOrderUsagePct:     75.0,
		TotalTradesEvaluated:   10,
	}

	critique := svc.buildRuleBasedCritique(65, "MODERATE", "B", metrics, "RELIANCE")
	expectedSubstrings := []string{
		"Trader Discipline Grade: B — MODERATE (65 / 100)",
		"Impulse Warning:",
		"Concentration Risk:",
		"RELIANCE",
		"Execution Discipline:",
		"Win Rate:",
	}

	for _, sub := range expectedSubstrings {
		if !strings.Contains(critique, sub) {
			t.Errorf("critique missing expected substring: %q", sub)
		}
	}
}

func TestMathAbs(t *testing.T) {
	if mathAbs(10) != 10 {
		t.Errorf("expected 10, got %d", mathAbs(10))
	}
	if mathAbs(-10) != 10 {
		t.Errorf("expected 10, got %d", mathAbs(-10))
	}
	if mathAbs(0) != 0 {
		t.Errorf("expected 0, got %d", mathAbs(0))
	}
}

func TestMentorService_PreTradeCheck(t *testing.T) {
	cfg := &config.Config{
		GeminiAPIKey: "",
		GeminiModel:  "gemini-2.0-flash",
	}
	svc := New(cfg)

	// Test Slippage Warning on Market order > 50 qty + Missing SL warning on INTRADAY
	req := dto.PreTradeCheckRequest{
		Symbol:     "RELIANCE",
		Side:       "BUY",
		Product:    "INTRADAY",
		Type:       "MARKET",
		Quantity:   100,
		PricePaise: 125000, // ₹1,250.00
	}

	res, err := svc.PreTradeCheck(context.Background(), "31372e69-2088-45d8-a2d8-8607a58e3685", req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if res.RequiredMarginPaise != 2500000 { // (100 * 125000 + 4) / 5 = 2,500,000 paise (₹25,000)
		t.Errorf("expected required margin 2500000 paise, got %d", res.RequiredMarginPaise)
	}

	// Should contain slippage warning and missing SL warning
	hasSlippageWarning := false
	hasMissingSLWarning := false
	for _, w := range res.Warnings {
		if strings.Contains(w, "Exchange Slippage Alert") {
			hasSlippageWarning = true
		}
		if strings.Contains(w, "Missing Stop-Loss Protection") {
			hasMissingSLWarning = true
		}
	}
	if !hasSlippageWarning {
		t.Errorf("expected slippage warning for 100 qty market order, warnings: %v", res.Warnings)
	}
	if !hasMissingSLWarning {
		t.Errorf("expected missing stop-loss warning for intraday order without SL, warnings: %v", res.Warnings)
	}

	// Test Risk-to-Reward calculation
	reqWithRR := dto.PreTradeCheckRequest{
		Symbol:        "NIFTY24DEC24000CE",
		Side:          "BUY",
		Product:       "FNO",
		Type:          "LIMIT",
		Quantity:      25,
		PricePaise:    10000, // ₹100
		StopLossPaise: 9000,  // ₹90 (Risk: ₹10)
		TargetPaise:   12500, // ₹125 (Reward: ₹25) -> R:R = 2.5
	}
	resRR, err := svc.PreTradeCheck(context.Background(), "31372e69-2088-45d8-a2d8-8607a58e3685", reqWithRR)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resRR.RiskRewardRatio != 2.5 {
		t.Errorf("expected R:R 2.5, got %.2f", resRR.RiskRewardRatio)
	}
	if resRR.RiskScore <= 0 || resRR.RiskScore > 100 {
		t.Errorf("expected valid risk score between 1 and 100, got %d", resRR.RiskScore)
	}

	// Test Circuit Limit Breach & Wishful Thinking Bias on RELIANCE
	reqCircuitBreach := dto.PreTradeCheckRequest{
		Symbol:        "RELIANCE",
		Side:          "BUY",
		Product:       "INTRADAY",
		Type:          "LIMIT",
		Quantity:      50,
		PricePaise:    298550,  // ₹2,985.50
		StopLossPaise: 294500,  // ₹2,945.00
		TargetPaise:   1000000, // ₹10,000.00 (+235% intraday)
	}
	resCB, err := svc.PreTradeCheck(context.Background(), "31372e69-2088-45d8-a2d8-8607a58e3685", reqCircuitBreach)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resCB.RiskLevel != "HIGH_RISK" {
		t.Errorf("expected HIGH_RISK for +235%% intraday target, got %s", resCB.RiskLevel)
	}
	if resCB.RiskScore > 40 {
		t.Errorf("expected safety score <= 40 for fantasy setup, got %d", resCB.RiskScore)
	}
	hasCircuitWarning := false
	hasWishfulWarning := false
	for _, w := range resCB.Warnings {
		if strings.Contains(w, "Circuit Limit Breach") {
			hasCircuitWarning = true
		}
		if strings.Contains(w, "Wishful Thinking Bias") {
			hasWishfulWarning = true
		}
	}
	if !hasCircuitWarning {
		t.Errorf("expected circuit limit breach warning, got warnings: %v", resCB.Warnings)
	}
	if !hasWishfulWarning {
		t.Errorf("expected wishful thinking bias warning, got warnings: %v", resCB.Warnings)
	}
}
