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
			question: "How should I structure my risk-reward ratio?",
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

	critique := svc.buildRuleBasedCritique(65, "MODERATE", metrics, "RELIANCE")
	expectedSubstrings := []string{
		"Trader Discipline Rating: MODERATE (65 / 100)",
		"Impulse Warning:",
		"Concentration Risk:",
		"RELIANCE",
		"Execution Discipline:",
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
