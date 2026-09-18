package service

import (
	"fmt"
	"math"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/risk/dto"
	"github.com/google/uuid"
)

type RiskService struct {
	market *marketService.Service
}

func New(market *marketService.Service) *RiskService {
	return &RiskService{market: market}
}

func (s *RiskService) GetOverview(userUUID uuid.UUID) (*dto.RiskOverviewResponse, error) {
	var wallet model.Wallet
	if err := database.GetDB().Where("user_uuid = ?", userUUID).First(&wallet).Error; err != nil {
		return nil, fmt.Errorf("wallet not found: %w", err)
	}

	var positions []model.Position
	if err := database.GetDB().Where("user_uuid = ? AND quantity <> 0", userUUID).Find(&positions).Error; err != nil {
		return nil, fmt.Errorf("failed to fetch positions: %w", err)
	}

	var activeOrdersCount int64
	_ = database.GetDB().Model(&model.Order{}).
		Where("user_uuid = ? AND status IN ?", userUUID, []string{model.OrderStatusPending, model.OrderStatusOpen, model.OrderStatusTriggerPending}).
		Count(&activeOrdersCount).Error

	totalUnrealizedPnl := int64(0)
	intradayCount := 0
	deliveryCount := 0

	for _, pos := range positions {
		if pos.Product == model.OrderProductIntraday {
			intradayCount++
		} else if pos.Product == model.OrderProductDelivery {
			deliveryCount++
		}

		curPrice := pos.CurrentPricePaise
		if s.market != nil {
			if q, err := s.market.CurrentQuote(pos.Symbol); err == nil && q != nil && q.PricePaise > 0 {
				curPrice = q.PricePaise
			}
		}

		pnl := (curPrice - pos.AveragePricePaise) * pos.Quantity
		totalUnrealizedPnl += pnl
	}

	accountEquity := wallet.CashBalancePaise + totalUnrealizedPnl
	availableBalance := wallet.AvailableBalancePaise()

	marginUtilization := 0.0
	status := "HEALTHY"
	message := "Margin health is optimal and well within regulatory maintenance requirements."

	if wallet.BlockedPaise > 0 {
		if accountEquity <= 0 {
			marginUtilization = 999.0
			status = "CRITICAL"
			message = "CRITICAL: Severe margin deficit. Intraday positions subject to immediate liquidation."
		} else {
			marginUtilization = math.Round((float64(wallet.BlockedPaise)*100.0/float64(accountEquity))*100) / 100
			if marginUtilization >= 120.0 {
				status = "CRITICAL"
				message = "CRITICAL: Margin utilization exceeds 120%. High-risk intraday positions subject to liquidation."
			} else if marginUtilization >= 100.0 {
				status = "MARGIN_CALL"
				message = "MARGIN CALL: Blocked margin exceeds available equity. Close positions to restore margin health."
			} else if marginUtilization >= 80.0 {
				status = "WARNING"
				message = "MARGIN WARNING: Over 80% of account equity is utilized. Monitor adverse price swings."
			}
		}
	}

	return &dto.RiskOverviewResponse{
		AccountEquityPaise:     accountEquity,
		CashBalancePaise:       wallet.CashBalancePaise,
		BlockedPaise:           wallet.BlockedPaise,
		AvailableBalancePaise:  availableBalance,
		UnrealizedPnlPaise:     totalUnrealizedPnl,
		MarginUtilizationPct:   marginUtilization,
		Status:                 status,
		Message:                message,
		IntradayPositionsCount: intradayCount,
		DeliveryPositionsCount: deliveryCount,
		ActiveOrdersCount:      int(activeOrdersCount),
	}, nil
}
