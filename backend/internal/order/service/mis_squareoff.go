package service

import (
	"context"
	"fmt"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
)

const (
	riskEventMISSquareOff = "MIS_SQUARE_OFF"
	riskStatusPending     = "PENDING"
	riskStatusFailed      = "FAILED"
)

// RunProductLifecycle starts the simulator's time-based MIS control. It is
// intentionally separate from quote matching: a missing quote must result in
// a recorded retry/failure, never a synthetic fill.
func (s *OrderService) RunProductLifecycle(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		s.ProcessMISSquareOff(time.Now())
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *OrderService) ProcessMISSquareOff(now time.Time) {
	ist, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		return
	}
	local := now.In(ist)
	start := time.Date(local.Year(), local.Month(), local.Day(), 15, 20, 0, 0, ist)
	deadline := time.Date(local.Year(), local.Month(), local.Day(), 15, 30, 0, 0, ist)
	if local.Before(start) {
		return
	}

	var openOrders []model.Order
	if err := database.GetDB().Where("product = ? AND source = ? AND status IN ?", model.OrderProductIntraday, model.OrderSourceUser, []string{model.OrderStatusPending, model.OrderStatusOpen}).Find(&openOrders).Error; err == nil {
		for _, order := range openOrders {
			_ = s.repo.Cancel(order.UserUUID, order.UUID)
		}
	}

	var positions []model.Position
	if err := database.GetDB().Where("product = ? AND quantity <> 0", model.OrderProductIntraday).Find(&positions).Error; err != nil {
		return
	}
	for _, position := range positions {
		squareOffSide := model.OrderSideSell
		if position.Quantity < 0 {
			squareOffSide = model.OrderSideBuy
		}
		order := &model.Order{UserUUID: position.UserUUID, Symbol: position.Symbol, Side: squareOffSide, Type: model.OrderTypeMarket, Product: model.OrderProductIntraday, Quantity: abs(position.Quantity), Status: model.OrderStatusPending, Source: model.OrderSourceSystem, Reason: model.OrderReasonMISSquareOff}
		if err := s.repo.Create(order); err == nil {
			err = s.Execute(position.UserUUID.String(), order.UUID.String())
		}
		if err != nil {
			status := riskStatusPending
			if !local.Before(deadline) {
				status = riskStatusFailed
			}
			_ = database.GetDB().Model(&model.Position{}).Where("uuid = ?", position.UUID).Update("square_off_state", status).Error
			s.recordRisk(position, status, fmt.Sprintf("MIS square-off could not execute: %v", err))
		}
	}
}

func (s *OrderService) recordRisk(position model.Position, status, message string) {
	var event model.RiskEvent
	query := database.GetDB().Where("user_uuid = ? AND symbol = ? AND product = ? AND event_type = ? AND status IN ?", position.UserUUID, position.Symbol, position.Product, riskEventMISSquareOff, []string{riskStatusPending, riskStatusFailed}).First(&event)
	if query.Error == nil {
		_ = database.GetDB().Model(&event).Updates(map[string]any{"status": status, "message": message}).Error
		return
	}
	_ = database.GetDB().Create(&model.RiskEvent{UserUUID: position.UserUUID, Symbol: position.Symbol, Product: position.Product, EventType: riskEventMISSquareOff, Status: status, Message: message}).Error
}
