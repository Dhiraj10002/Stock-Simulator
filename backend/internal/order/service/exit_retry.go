package service

import (
	"errors"
	"fmt"
	"strings"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/product"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrExitKeyConflict = errors.New("exit retry key belongs to another position")

// activateStop commits the one-way trigger transition independently of filling.
// A quote outside the limit, or a later settlement failure, must not undo it.
func (s *OrderService) activateStop(user, id uuid.UUID, price int64) error {
	activated := false
	symbol := ""
	err := database.GetDB().Transaction(func(tx *gorm.DB) error {
		var order model.Order
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("uuid = ? AND user_uuid = ?", id, user).First(&order).Error; err != nil {
			return err
		}
		if order.Status != model.OrderStatusTriggerPending {
			return nil
		}
		if !triggerSatisfied(&order, price) {
			return errors.New("stop trigger condition not met")
		}
		if err := tx.Model(&order).Update("status", model.OrderStatusOpen).Error; err != nil {
			return err
		}
		activated = true
		symbol = order.Symbol
		return nil
	})
	if err == nil && activated {
		s.refreshActiveOrdersForSymbol(symbol)
	}
	return err
}

func staleExit(order *model.Order, position *model.Position) bool {
	return order.ExitPositionUUID != nil && (position.UUID != *order.ExitPositionUUID || order.ExitPositionUpdatedAt == nil || !position.UpdatedAt.Equal(*order.ExitPositionUpdatedAt))
}

// SquareOffPosition reserves an immutable exit intent under the wallet/position
// locks, then executes it. A process crash or lost response is recovered using
// the same key, including after the original position has closed or reopened.
func (s *OrderService) SquareOffPosition(user, positionID uuid.UUID, keys ...string) (*dto.OrderResponse, error) {
	db := database.GetDB()
	if db == nil {
		return nil, errors.New("database not connected")
	}
	key := ""
	if len(keys) > 0 {
		key = strings.TrimSpace(keys[0])
	}
	if len(key) > 128 {
		return nil, errors.New("exit retry key must be at most 128 characters")
	}
	var order model.Order
	err := db.Transaction(func(tx *gorm.DB) error {
		var wallet model.Wallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_uuid = ?", user).First(&wallet).Error; err != nil {
			return err
		}
		find := func() (bool, error) {
			err := tx.Where("user_uuid = ? AND exit_key = ?", user, key).First(&order).Error
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return false, nil
			}
			if err != nil {
				return false, err
			}
			if order.ExitPositionUUID == nil || *order.ExitPositionUUID != positionID {
				return false, ErrExitKeyConflict
			}
			return true, nil
		}
		if key != "" {
			if found, err := find(); found || err != nil {
				return err
			}
		}
		var position model.Position
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("uuid = ? AND user_uuid = ?", positionID, user).First(&position).Error; err != nil {
			return fmt.Errorf("position not found: %w", err)
		}
		// Legacy callers without a key get concurrent-call protection. HTTP clients
		// must supply a key for retries across completed executions.
		if key == "" {
			key = fmt.Sprintf("%s:%d", positionID, position.UpdatedAt.UnixMicro())
			if found, err := find(); found || err != nil {
				return err
			}
		}
		if err := calendar.ValidateNewOrderSession(s.now()); err != nil {
			return err
		}
		if position.Quantity == 0 {
			return errors.New("position is already closed")
		}
		if position.Product == model.OrderProductFNO {
			var inst *model.Instrument
			if instRow, instErr := s.repo.FindInstrument(position.Symbol); instErr == nil && instRow != nil {
				inst = instRow
			} else if synth, synthErr := product.ParseSyntheticFNOContract(position.Symbol); synthErr == nil && synth != nil {
				inst = synth
			}
			if inst != nil && isExpired(inst.Expiry, s.now()) {
				kind, kErr := product.ValidateFNOInstrument(*inst, abs(position.Quantity))
				if kErr == nil {
					settlementPrice, pErr := s.expiryPrice(*inst, kind)
					if pErr != nil {
						settlementPrice = position.CurrentPricePaise
					}
					if err := s.settleExpiredPosition(position.UUID, settlementPrice, kind); err == nil {
						var settledOrder model.Order
						if err := tx.Where("user_uuid = ? AND symbol = ? AND reason = ?", user, position.Symbol, model.OrderReasonFNOExpiry).Order("created_at DESC").First(&settledOrder).Error; err == nil {
							order = settledOrder
							return nil
						}
					}
				}
			}
		}
		side := model.OrderSideSell
		if position.Quantity < 0 {
			side = model.OrderSideBuy
		}
		order = model.Order{UserUUID: user, Symbol: position.Symbol, Product: position.Product, Type: model.OrderTypeMarket, Side: side, Quantity: abs(position.Quantity), Status: model.OrderStatusPending, Reason: model.OrderReasonSquareOff, ExitKey: &key, ExitPositionUUID: &position.UUID, ExitPositionUpdatedAt: &position.UpdatedAt}
		return tx.Create(&order).Error
	})
	if err != nil {
		return nil, err
	}
	if order.Status == model.OrderStatusPending || order.Status == model.OrderStatusOpen {
		s.RegisterActiveOrder(order)
		execErr := s.Execute(user.String(), order.UUID.String())
		s.refreshActiveOrdersForSymbol(order.Symbol)
		if err := db.Where("uuid = ? AND user_uuid = ?", order.UUID, user).First(&order).Error; err != nil {
			return nil, err
		}
		// Another request may have completed this exact intent while we waited.
		if execErr != nil && order.Status != model.OrderStatusExecuted && order.Status != model.OrderStatusCancelled && order.Status != model.OrderStatusRejected {
			return nil, execErr
		}
	}
	return toResponse(&order), nil
}
