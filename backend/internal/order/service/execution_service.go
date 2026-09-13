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

// Execute settles an order at the current market quote. The client cannot
// provide a fill price: the Redis market-data service is the only price source.
func (s *OrderService) Execute(userID, orderID string) error {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user identity")
	}
	orderUUID, err := uuid.Parse(orderID)
	if err != nil {
		return fmt.Errorf("invalid order identity")
	}

	// Fetch before taking database locks. ExecutableQuote validates price and
	// freshness so a Redis outage or old tick cannot settle an order.
	var pendingOrder model.Order
	if err := database.GetDB().Where("uuid = ? AND user_uuid = ?", orderUUID, userUUID).First(&pendingOrder).Error; err != nil {
		return err
	}
	quote, err := s.market.ExecutableQuote(pendingOrder.Symbol)
	if err != nil {
		return err
	}
	executionPricePaise := quote.PricePaise

	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		// The wallet is the per-user serialization point. Keep this ordering in
		// sync with reservation, cancellation, and simulation reset.
		var wallet model.Wallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_uuid = ?", userUUID).First(&wallet).Error; err != nil {
			return err
		}

		var order model.Order
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("uuid = ? AND user_uuid = ?", orderUUID, userUUID).First(&order).Error; err != nil {
			return err
		}
		if order.Status != model.OrderStatusPending && order.Status != model.OrderStatusOpen {
			return fmt.Errorf("order cannot be executed in %s status", order.Status)
		}
		// Defense in depth for historical/manual rows created before product
		// support was restricted at order creation.
		if !isSupportedProduct(order.Product) {
			return fmt.Errorf("%s orders are not available yet; only DELIVERY orders are supported", order.Product)
		}
		if order.Quantity <= 0 || (order.Side != model.OrderSideBuy && order.Side != model.OrderSideSell) {
			return errors.New("order has invalid settlement data")
		}
		if order.Type == model.OrderTypeLimit && !limitSatisfied(&order, executionPricePaise) {
			return errors.New("market price does not satisfy limit order")
		}
		total, ok := multiply(order.Quantity, executionPricePaise)
		if !ok {
			return errors.New("order value is too large")
		}

		if wallet.CashBalancePaise < 0 || wallet.BlockedPaise < 0 || wallet.BlockedPaise > wallet.CashBalancePaise {
			return errors.New("wallet has invalid balances")
		}
		var position model.Position
		positionErr := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_uuid = ? AND symbol = ?", userUUID, order.Symbol).First(&position).Error

		realizedPnlPaise := int64(0)
		if order.Side == model.OrderSideBuy {
			if order.ReservedPaise > 0 && total > order.ReservedPaise {
				return errors.New("market price exceeds reserved order amount")
			}
			if order.ReservedPaise == 0 && wallet.AvailableBalancePaise() < total {
				return errors.New("insufficient available wallet balance")
			}
			if wallet.CashBalancePaise < total {
				return errors.New("insufficient wallet balance")
			}
			wallet.CashBalancePaise -= total
			if order.ReservedPaise > 0 {
				if wallet.BlockedPaise < order.ReservedPaise {
					return errors.New("reserved wallet amount is missing")
				}
				wallet.BlockedPaise -= order.ReservedPaise
			}
			if positionErr == gorm.ErrRecordNotFound {
				position = model.Position{UserUUID: userUUID, Symbol: order.Symbol, Quantity: order.Quantity, AveragePricePaise: executionPricePaise, CostBasisPaise: total, CurrentPricePaise: executionPricePaise}
			} else if positionErr != nil {
				return positionErr
			} else {
				newQuantity, ok := add(position.Quantity, order.Quantity)
				if !ok {
					return errors.New("position quantity is too large")
				}
				oldCostBasis := position.InvestedValuePaise()
				newCostBasis, ok := add(oldCostBasis, total)
				if !ok {
					return errors.New("position value is too large")
				}
				position.Quantity = newQuantity
				position.CostBasisPaise = newCostBasis
				position.AveragePricePaise = newCostBasis / newQuantity
				position.CurrentPricePaise = executionPricePaise
			}
		} else {
			if positionErr != nil {
				return errors.New("position not found")
			}
			if position.Quantity < order.Quantity {
				return errors.New("insufficient position quantity")
			}
			costSold, ok := proportionalCostBasis(position.InvestedValuePaise(), order.Quantity, position.Quantity)
			if !ok {
				return errors.New("position value is too large")
			}
			realizedPnlPaise, ok = subtract(total, costSold)
			if !ok {
				return errors.New("realized P&L is too large")
			}
			remainingCostBasis, ok := subtract(position.InvestedValuePaise(), costSold)
			if !ok {
				return errors.New("position value is invalid")
			}
			newRealizedPnl, ok := add(position.RealizedPnlPaise, realizedPnlPaise)
			if !ok {
				return errors.New("realized P&L is too large")
			}
			newBalance, ok := add(wallet.CashBalancePaise, total)
			if !ok {
				return errors.New("wallet balance is too large")
			}
			wallet.CashBalancePaise = newBalance
			position.Quantity -= order.Quantity
			position.CostBasisPaise = remainingCostBasis
			position.RealizedPnlPaise = newRealizedPnl
			if position.Quantity == 0 {
				position.AveragePricePaise = 0
			} else {
				position.AveragePricePaise = remainingCostBasis / position.Quantity
			}
			position.CurrentPricePaise = executionPricePaise
		}

		if err := tx.Save(&wallet).Error; err != nil {
			return err
		}
		if err := tx.Save(&position).Error; err != nil {
			return err
		}
		walletType, walletAmount := model.WalletTransactionDebit, -total
		if order.Side == model.OrderSideSell {
			walletType, walletAmount = model.WalletTransactionCredit, total
		}
		if err := tx.Create(&model.WalletTransaction{WalletUUID: wallet.UUID, Type: walletType, AmountPaise: walletAmount, BalancePaise: wallet.CashBalancePaise, BlockedPaise: wallet.BlockedPaise, Note: "Order execution"}).Error; err != nil {
			return err
		}
		if err := tx.Create(&model.Trade{OrderUUID: order.UUID, UserUUID: userUUID, Symbol: order.Symbol, Side: order.Side, Quantity: order.Quantity, PricePaise: executionPricePaise, TotalPaise: total, RealizedPnlPaise: realizedPnlPaise, ExecutedAt: time.Now()}).Error; err != nil {
			return err
		}
		order.Status = model.OrderStatusExecuted
		order.ExecutedPricePaise = executionPricePaise
		order.ReservedPaise = 0

		return tx.Save(&order).Error
	})
}

func limitSatisfied(order *model.Order, executionPricePaise int64) bool {
	if order.Type != model.OrderTypeLimit || order.PricePaise <= 0 || executionPricePaise <= 0 {
		return false
	}
	return (order.Side == model.OrderSideBuy && executionPricePaise <= order.PricePaise) ||
		(order.Side == model.OrderSideSell && executionPricePaise >= order.PricePaise)
}

// proportionalCostBasis allocates the exact remaining cost to a partial sale.
// The final sale takes the full residual, so rounding never loses a paise.
func proportionalCostBasis(costBasis, soldQuantity, heldQuantity int64) (int64, bool) {
	if costBasis < 0 || soldQuantity <= 0 || heldQuantity <= 0 || soldQuantity > heldQuantity {
		return 0, false
	}
	if soldQuantity == heldQuantity {
		return costBasis, true
	}
	product, ok := multiply(costBasis, soldQuantity)
	if !ok {
		return 0, false
	}
	return product / heldQuantity, true
}

func multiply(left, right int64) (int64, bool) {
	if left <= 0 || right <= 0 || left > math.MaxInt64/right {
		return 0, false
	}
	return left * right, true
}

func add(left, right int64) (int64, bool) {
	if (right > 0 && left > math.MaxInt64-right) || (right < 0 && left < math.MinInt64-right) {
		return 0, false
	}
	return left + right, true
}

func subtract(left, right int64) (int64, bool) {
	if (right > 0 && left < math.MinInt64+right) || (right < 0 && left > math.MaxInt64+right) {
		return 0, false
	}
	return left - right, true
}
