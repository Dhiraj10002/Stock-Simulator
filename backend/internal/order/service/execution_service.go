package service

import (
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Execute fills an order at an explicit simulator price. It atomically updates
// the order, wallet, position, wallet transaction, and trade record.
func (s *OrderService) Execute(userID, orderID string, executionPricePaise int64) error {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user identity")
	}
	orderUUID, err := uuid.Parse(orderID)
	if err != nil {
		return fmt.Errorf("invalid order identity")
	}
	if executionPricePaise <= 0 {
		return errors.New("execution price must be positive")
	}

	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		var order model.Order
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("uuid = ? AND user_uuid = ?", orderUUID, userUUID).First(&order).Error; err != nil {
			return err
		}
		if order.Status != model.OrderStatusPending && order.Status != model.OrderStatusOpen {
			return fmt.Errorf("order cannot be executed in %s status", order.Status)
		}
		if order.Type == model.OrderTypeLimit && ((order.Side == model.OrderSideBuy && executionPricePaise > order.PricePaise) || (order.Side == model.OrderSideSell && executionPricePaise < order.PricePaise)) {
			return errors.New("execution price does not satisfy limit order")
		}
		if order.Quantity > math.MaxInt64/executionPricePaise {
			return errors.New("order value is too large")
		}
		total := order.Quantity * executionPricePaise

		var wallet model.Wallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_uuid = ?", userUUID).First(&wallet).Error; err != nil {
			return err
		}
		var position model.Position
		positionErr := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_uuid = ? AND symbol = ?", userUUID, order.Symbol).First(&position).Error

		if order.Side == model.OrderSideBuy {
			if order.ReservedPaise > 0 && total > order.ReservedPaise {
				return errors.New("execution price exceeds reserved order amount")
			}
			if order.ReservedPaise == 0 && wallet.AvailableBalancePaise() < total {
				return errors.New("insufficient available wallet balance")
			}
			wallet.CashBalancePaise -= total
			if order.ReservedPaise > 0 {
				if wallet.BlockedPaise < order.ReservedPaise {
					return errors.New("reserved wallet amount is missing")
				}
				wallet.BlockedPaise -= order.ReservedPaise
			}
			if positionErr == gorm.ErrRecordNotFound {
				position = model.Position{UserUUID: userUUID, Symbol: order.Symbol, Quantity: order.Quantity, AveragePricePaise: executionPricePaise, CurrentPricePaise: executionPricePaise}
			} else if positionErr != nil {
				return positionErr
			} else {
				oldValue := position.InvestedValuePaise()
				position.Quantity += order.Quantity
				position.AveragePricePaise = (oldValue + total) / position.Quantity
				position.CurrentPricePaise = executionPricePaise
			}
		} else {
			if positionErr != nil {
				return errors.New("position not found")
			}
			if position.Quantity < order.Quantity {
				return errors.New("insufficient position quantity")
			}
			wallet.CashBalancePaise += total
			position.Quantity -= order.Quantity
			position.CurrentPricePaise = executionPricePaise
		}

		if err := tx.Save(&wallet).Error; err != nil {
			return err
		}
		if err := tx.Save(&position).Error; err != nil {
			return err
		}
		walletType := model.WalletTransactionDebit
		walletAmount := -total
		if order.Side == model.OrderSideSell {
			walletType, walletAmount = model.WalletTransactionCredit, total
		}
		if err := tx.Create(&model.WalletTransaction{WalletUUID: wallet.UUID, Type: walletType, AmountPaise: walletAmount, BalancePaise: wallet.CashBalancePaise, BlockedPaise: wallet.BlockedPaise, Note: "Order execution"}).Error; err != nil {
			return err
		}
		if err := tx.Create(&model.Trade{OrderUUID: order.UUID, UserUUID: userUUID, Symbol: order.Symbol, Side: order.Side, Quantity: order.Quantity, PricePaise: executionPricePaise, TotalPaise: total, ExecutedAt: time.Now()}).Error; err != nil {
			return err
		}
		order.Status, order.PricePaise = model.OrderStatusExecuted, executionPricePaise
		return tx.Save(&order).Error
	})
}
