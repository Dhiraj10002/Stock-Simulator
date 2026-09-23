package service

import (
	"context"
	"fmt"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
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
		s.ProcessMISSquareOff(s.now())
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *OrderService) ProcessMISSquareOff(now time.Time) {
	if calendar.IsWeekend(now) {
		return
	}
	if isHoliday, _ := calendar.IsTradingHoliday(now); isHoliday {
		return
	}
	_, start, deadline := calendar.SessionBounds(now)
	if now.Before(start) {
		return
	}

	// 1. At or after 15:20 IST cutoff: Cancel all pending/open/trigger-pending MIS orders
	var openOrders []model.Order
	if err := database.GetDB().Where("product = ? AND status IN ?",
		model.OrderProductIntraday,
		[]string{model.OrderStatusPending, model.OrderStatusOpen, model.OrderStatusTriggerPending}).Find(&openOrders).Error; err == nil {
		for _, order := range openOrders {
			_ = s.repo.Cancel(order.UserUUID, order.UUID)
		}
	}

	// 2. Fetch all remaining open MIS positions
	var positions []model.Position
	if err := database.GetDB().Where("product = ? AND quantity <> 0", model.OrderProductIntraday).Find(&positions).Error; err != nil {
		return
	}

	// If at or after the 15:30 IST deadline, transition remaining unexecuted positions to FAILED
	if !now.Before(deadline) {
		for _, position := range positions {
			if position.SquareOffState != riskStatusFailed {
				_ = database.GetDB().Model(&model.Position{}).Where("uuid = ?", position.UUID).Update("square_off_state", riskStatusFailed).Error
				s.recordRisk(position, riskStatusFailed, "MIS square-off deadline 15:30 IST reached without execution")
			}
		}
		return
	}

	// 3. Between 15:20 and 15:30 IST: Execute auto market square-off
	for _, position := range positions {
		squareOffSide := model.OrderSideSell
		if position.Quantity < 0 {
			squareOffSide = model.OrderSideBuy
		}
		order := &model.Order{
			UserUUID: position.UserUUID,
			Symbol:   position.Symbol,
			Side:     squareOffSide,
			Type:     model.OrderTypeMarket,
			Product:  model.OrderProductIntraday,
			Quantity: abs(position.Quantity),
			Status:   model.OrderStatusPending,
			Source:   model.OrderSourceSystem,
			Reason:   model.OrderReasonMISSquareOff,
		}
		if err := s.repo.Create(order); err == nil {
			err = s.Execute(position.UserUUID.String(), order.UUID.String())
			if err != nil {
				_ = s.repo.Reject(position.UserUUID, order.UUID)
				_ = database.GetDB().Model(&model.Position{}).Where("uuid = ?", position.UUID).Update("square_off_state", riskStatusPending).Error
				s.recordRisk(position, riskStatusPending, fmt.Sprintf("MIS square-off retry pending: %v", err))
			} else {
				_ = database.GetDB().Model(&model.Position{}).Where("uuid = ?", position.UUID).Update("square_off_state", "COMPLETED").Error
				_ = database.GetDB().Model(&model.RiskEvent{}).Where("user_uuid = ? AND symbol = ? AND product = ? AND event_type = ? AND status = ?",
					position.UserUUID, position.Symbol, position.Product, riskEventMISSquareOff, riskStatusPending).Update("status", "RESOLVED").Error
			}
		}
	}
}

func (s *OrderService) recordRisk(position model.Position, status, message string) {
	var event model.RiskEvent
	query := database.GetDB().Where("user_uuid = ? AND symbol = ? AND product = ? AND event_type = ? AND status IN ?",
		position.UserUUID, position.Symbol, position.Product, riskEventMISSquareOff,
		[]string{riskStatusPending, riskStatusFailed}).First(&event)
	if query.Error == nil {
		_ = database.GetDB().Model(&event).Updates(map[string]any{"status": status, "message": message}).Error
		return
	}
	_ = database.GetDB().Create(&model.RiskEvent{
		UserUUID:  position.UserUUID,
		Symbol:    position.Symbol,
		Product:   position.Product,
		EventType: riskEventMISSquareOff,
		Status:    status,
		Message:   message,
	}).Error
}

// TriggerManualMISSquareOff executes an immediate MIS square-off for a specific user.
// It cancels pending/open/trigger-pending intraday orders and squares off open intraday positions at market.
func (s *OrderService) TriggerManualMISSquareOff(userUUID uuid.UUID) (int, error) {
	// 1. Cancel active intraday orders for user
	var openOrders []model.Order
	orderQuery := database.GetDB().Where("product = ? AND status IN ?",
		model.OrderProductIntraday,
		[]string{model.OrderStatusPending, model.OrderStatusOpen, model.OrderStatusTriggerPending})
	if userUUID != uuid.Nil {
		orderQuery = orderQuery.Where("user_uuid = ?", userUUID)
	}
	if err := orderQuery.Find(&openOrders).Error; err == nil {
		for _, order := range openOrders {
			_ = s.repo.Cancel(order.UserUUID, order.UUID)
		}
	}

	// 2. Fetch open intraday positions
	var positions []model.Position
	posQuery := database.GetDB().Where("product = ? AND quantity <> 0", model.OrderProductIntraday)
	if userUUID != uuid.Nil {
		posQuery = posQuery.Where("user_uuid = ?", userUUID)
	}
	if err := posQuery.Find(&positions).Error; err != nil {
		return 0, err
	}

	closedCount := 0
	for _, position := range positions {
		squareOffSide := model.OrderSideSell
		if position.Quantity < 0 {
			squareOffSide = model.OrderSideBuy
		}
		order := &model.Order{
			UserUUID: position.UserUUID,
			Symbol:   position.Symbol,
			Side:     squareOffSide,
			Type:     model.OrderTypeMarket,
			Product:  model.OrderProductIntraday,
			Quantity: abs(position.Quantity),
			Status:   model.OrderStatusPending,
			Source:   model.OrderSourceSystem,
			Reason:   model.OrderReasonMISSquareOff,
		}
		if err := s.repo.Create(order); err == nil {
			if execErr := s.Execute(position.UserUUID.String(), order.UUID.String()); execErr == nil {
				closedCount++
				_ = database.GetDB().Model(&model.Position{}).Where("uuid = ?", position.UUID).Update("square_off_state", "COMPLETED").Error
			} else {
				_ = s.repo.Reject(position.UserUUID, order.UUID)
			}
		}
	}
	return closedCount, nil
}
