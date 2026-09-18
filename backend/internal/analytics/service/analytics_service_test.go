package service

import (
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
)

func TestAnalyticsMath(t *testing.T) {
	testUUID := uuid.New()
	now := time.Now()

	trades := []model.Trade{
		{
			UserUUID:         testUUID,
			Symbol:           "RELIANCE",
			Side:             "SELL",
			RealizedPnlPaise: 150000, // +₹1,500.00
			ExecutedAt:       now,
		},
		{
			UserUUID:         testUUID,
			Symbol:           "TCS",
			Side:             "SELL",
			RealizedPnlPaise: 250000, // +₹2,500.00
			ExecutedAt:       now,
		},
		{
			UserUUID:         testUUID,
			Symbol:           "INFY",
			Side:             "SELL",
			RealizedPnlPaise: -100000, // -₹1,000.00
			ExecutedAt:       now,
		},
	}

	var winning, losing int
	var grossProfit, grossLoss int64
	for _, tr := range trades {
		if tr.RealizedPnlPaise > 0 {
			winning++
			grossProfit += tr.RealizedPnlPaise
		} else if tr.RealizedPnlPaise < 0 {
			losing++
			grossLoss += -tr.RealizedPnlPaise
		}
	}

	closed := winning + losing
	winRate := (float64(winning) / float64(closed)) * 100
	if winRate < 66.0 || winRate > 67.0 {
		t.Errorf("expected win rate ~66.67%%, got %.2f%%", winRate)
	}

	profitFactor := float64(grossProfit) / float64(grossLoss)
	if profitFactor != 4.0 { // 400,000 / 100,000 = 4.0
		t.Errorf("expected profit factor 4.0, got %.2f", profitFactor)
	}

	netPnl := grossProfit - grossLoss
	if netPnl != 300000 { // ₹3,000.00
		t.Errorf("expected net PnL 300000 paise, got %d", netPnl)
	}
}
