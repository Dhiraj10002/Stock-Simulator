package service

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/analytics/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
)

type AnalyticsService struct{}

func New() *AnalyticsService {
	return &AnalyticsService{}
}

func (s *AnalyticsService) GetPerformanceOverview(userID string) (*dto.PerformanceOverviewResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user identity")
	}

	var trades []model.Trade
	if db := database.GetDB(); db != nil {
		if err := db.Where("user_uuid = ?", userUUID).Order("executed_at ASC").Find(&trades).Error; err != nil {
			return nil, err
		}
	}

	var winningTrades, losingTrades, breakEvenTrades int
	var grossProfit, grossLoss int64
	var largestWin, largestLoss int64
	var largestWinSym, largestLossSym string

	for _, t := range trades {
		// Only evaluate trades with realized P&L (sells or closed derivative/intraday positions)
		if t.RealizedPnlPaise > 0 {
			winningTrades++
			grossProfit += t.RealizedPnlPaise
			if t.RealizedPnlPaise > largestWin {
				largestWin = t.RealizedPnlPaise
				largestWinSym = t.Symbol
			}
		} else if t.RealizedPnlPaise < 0 {
			losingTrades++
			absLoss := -t.RealizedPnlPaise
			grossLoss += absLoss
			if absLoss > largestLoss {
				largestLoss = absLoss
				largestLossSym = t.Symbol
			}
		} else if t.Side == "SELL" || t.Product == "INTRADAY" || t.Product == "FNO" {
			breakEvenTrades++
		}
	}

	closedTrades := winningTrades + losingTrades + breakEvenTrades
	winRate := 0.0
	if closedTrades > 0 {
		winRate = math.Round((float64(winningTrades)/float64(closedTrades))*10000) / 100
	}

	netRealized := grossProfit - grossLoss

	profitFactor := 0.0
	if grossLoss > 0 {
		profitFactor = math.Round((float64(grossProfit)/float64(grossLoss))*100) / 100
	} else if grossProfit > 0 {
		profitFactor = 99.9
	}

	var avgWin, avgLoss int64
	if winningTrades > 0 {
		avgWin = grossProfit / int64(winningTrades)
	}
	if losingTrades > 0 {
		avgLoss = grossLoss / int64(losingTrades)
	}

	winLossRatio := 0.0
	if avgLoss > 0 {
		winLossRatio = math.Round((float64(avgWin)/float64(avgLoss))*100) / 100
	} else if avgWin > 0 {
		winLossRatio = 99.9
	}

	return &dto.PerformanceOverviewResponse{
		TotalTrades:         len(trades),
		WinningTrades:       winningTrades,
		LosingTrades:        losingTrades,
		BreakEvenTrades:     breakEvenTrades,
		WinRatePct:          winRate,
		NetRealizedPnlPaise: netRealized,
		GrossProfitPaise:    grossProfit,
		GrossLossPaise:      grossLoss,
		ProfitFactor:        profitFactor,
		AverageWinPaise:     avgWin,
		AverageLossPaise:    avgLoss,
		WinLossRatio:        winLossRatio,
		LargestWinPaise:     largestWin,
		LargestWinSymbol:    largestWinSym,
		LargestLossPaise:    largestLoss,
		LargestLossSymbol:   largestLossSym,
	}, nil
}

func (s *AnalyticsService) GetPnlCalendar(userID, month string) (*dto.PnlCalendarResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user identity")
	}

	if month == "" {
		month = time.Now().Format("2006-01")
	}

	var trades []model.Trade
	if db := database.GetDB(); db != nil {
		if err := db.Where("user_uuid = ?", userUUID).Order("executed_at ASC").Find(&trades).Error; err != nil {
			return nil, err
		}
	}

	dailyMap := make(map[string]*dto.DailyPnlDay)

	for _, t := range trades {
		dateStr := t.ExecutedAt.Format("2006-01-02")
		// Filter by requested month (e.g. "2026-09")
		if !strings.HasPrefix(dateStr, month) {
			continue
		}

		day, exists := dailyMap[dateStr]
		if !exists {
			day = &dto.DailyPnlDay{
				Date: dateStr,
			}
			dailyMap[dateStr] = day
		}

		day.TradesCount++
		day.RealizedPnlPaise += t.RealizedPnlPaise

		if t.RealizedPnlPaise > 0 {
			day.WinTrades++
		} else if t.RealizedPnlPaise < 0 {
			day.LossTrades++
		}
	}

	days := make([]dto.DailyPnlDay, 0, len(dailyMap))
	var monthTotalPnl int64
	var profitableDays, lossDays int

	for _, day := range dailyMap {
		days = append(days, *day)
		monthTotalPnl += day.RealizedPnlPaise
		if day.RealizedPnlPaise > 0 {
			profitableDays++
		} else if day.RealizedPnlPaise < 0 {
			lossDays++
		}
	}

	// Sort days chronologically
	sort.Slice(days, func(i, j int) bool {
		return days[i].Date < days[j].Date
	})

	return &dto.PnlCalendarResponse{
		Month:               month,
		Days:                days,
		MonthTotalPnlPaise:  monthTotalPnl,
		ProfitableDaysCount: profitableDays,
		LossDaysCount:       lossDays,
	}, nil
}
