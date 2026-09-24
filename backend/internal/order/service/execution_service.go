package service

import (
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/product"
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
	if pendingOrder.Product != model.OrderProductDelivery {
		return s.executeMarginProduct(userUUID, orderUUID, pendingOrder)
	}
	quote, err := s.executableQuote(pendingOrder.Symbol)
	if err != nil {
		return err
	}
	executionPricePaise := quote.PricePaise
	if pendingOrder.Type == model.OrderTypeMarket || pendingOrder.Type == model.OrderTypeSLM {
		executionPricePaise = calculateSlippage(pendingOrder.Quantity, quote.PricePaise, pendingOrder.Side)
	}

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
		if order.Status != model.OrderStatusPending && order.Status != model.OrderStatusOpen && order.Status != model.OrderStatusTriggerPending {
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
		if (order.Type == model.OrderTypeLimit || order.Type == model.OrderTypeSL) && !limitSatisfied(&order, executionPricePaise) {
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

func (s *OrderService) executeMarginProduct(userUUID, orderUUID uuid.UUID, pending model.Order) error {
	quote, err := s.executableQuote(pending.Symbol)
	if err != nil {
		return err
	}
	instrumentType, underlying := "", ""
	if pending.Product == model.OrderProductFNO {
		instrument, err := s.repo.FindInstrument(pending.Symbol)
		if err != nil || instrument == nil {
			if s.market == nil || s.market.FeedMode() != marketDTO.FeedModeLive {
				if synth, synthErr := product.ParseSyntheticFNOContract(pending.Symbol); synthErr == nil && synth != nil {
					instrument = synth
				}
			}
		}
		if instrument == nil {
			return fmt.Errorf("F&O instrument not found")
		}
		if isExpired(instrument.Expiry, s.now()) {
			return fmt.Errorf("cannot execute expired contract %s (expiry: %s)", pending.Symbol, instrument.Expiry)
		}
		instrumentType, err = product.ValidateFNOInstrument(*instrument, pending.Quantity)
		if err != nil {
			return err
		}
		underlying = instrument.UnderlyingSymbol
	}
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		var wallet model.Wallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_uuid = ?", userUUID).First(&wallet).Error; err != nil {
			return err
		}
		var order model.Order
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("uuid = ? AND user_uuid = ?", orderUUID, userUUID).First(&order).Error; err != nil {
			return err
		}
		if order.Status != model.OrderStatusPending && order.Status != model.OrderStatusOpen && order.Status != model.OrderStatusTriggerPending {
			return fmt.Errorf("order cannot be executed in %s status", order.Status)
		}
		fillPrice := quote.PricePaise
		if order.Type == model.OrderTypeMarket || order.Type == model.OrderTypeSLM {
			fillPrice = calculateSlippage(order.Quantity, quote.PricePaise, order.Side)
		}
		if (order.Type == model.OrderTypeLimit || order.Type == model.OrderTypeSL) && !limitSatisfied(&order, fillPrice) {
			return errors.New("market price does not satisfy limit order")
		}
		if order.Product == model.OrderProductIntraday {
			if err := product.ValidateMISOrder(s.now()); err != nil && order.Source != model.OrderSourceSystem {
				return err
			}
		}
		total, ok := multiply(order.Quantity, fillPrice)
		if !ok {
			return errors.New("order value is too large")
		}
		var position model.Position
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_uuid = ? AND symbol = ? AND product = ?", userUUID, order.Symbol, order.Product).First(&position).Error
		if err != nil && err != gorm.ErrRecordNotFound {
			return err
		}
		transition, err := calculatePositionTransition(position.Quantity, position.AveragePricePaise, order.Quantity, quote.PricePaise, order.Side)
		if err != nil {
			return err
		}
		newQty := transition.NewQuantity
		newAverage := transition.NewAveragePrice
		realized := transition.RealizedPnlPaise
		newMargin, err := s.marginForPosition(order.Product, instrumentType, newQty, newAverage)
		if err != nil {
			return err
		}
		marginDelta, ok := subtract(newMargin, position.MarginBlockedPaise)
		if !ok {
			return errors.New("margin is too large")
		}
		availableAfterReservation, ok := add(wallet.AvailableBalancePaise(), order.ReservedPaise)
		if !ok {
			return errors.New("wallet balance is too large")
		}
		if marginDelta > availableAfterReservation {
			return errors.New("insufficient available wallet balance for margin")
		}
		if order.Product == model.OrderProductFNO && instrumentType == product.InstrumentOption && order.Side == model.OrderSideBuy {
			if availableAfterReservation < total {
				return errors.New("insufficient available wallet balance for option premium")
			}
		}
		newBlocked, ok := subtract(wallet.BlockedPaise, order.ReservedPaise)
		if !ok || newBlocked < 0 {
			return errors.New("reserved wallet amount is missing")
		}
		newBlocked, ok = add(newBlocked, marginDelta)
		if !ok {
			return errors.New("invalid margin balance")
		}
		if newBlocked < 0 {
			newBlocked = 0
		}
		wallet.BlockedPaise = newBlocked
		cashChange := realized
		if order.Product == model.OrderProductFNO && instrumentType == product.InstrumentOption {
			cashChange = -total
			if order.Side == model.OrderSideSell {
				cashChange = total
			}
		}
		wallet.CashBalancePaise, ok = add(wallet.CashBalancePaise, cashChange)
		if !ok || wallet.CashBalancePaise < wallet.BlockedPaise {
			return errors.New("insufficient wallet balance")
		}
		if err := tx.Save(&wallet).Error; err != nil {
			return err
		}
		if cashChange != 0 {
			walletType := model.WalletTransactionCredit
			if cashChange < 0 {
				walletType = model.WalletTransactionDebit
			}
			if err := tx.Create(&model.WalletTransaction{
				WalletUUID:   wallet.UUID,
				Type:         walletType,
				AmountPaise:  cashChange,
				BalancePaise: wallet.CashBalancePaise,
				BlockedPaise: wallet.BlockedPaise,
				Note:         "Order execution",
			}).Error; err != nil {
				return err
			}
		}
		position.UserUUID, position.Symbol, position.Product = userUUID, order.Symbol, order.Product
		position.InstrumentType, position.UnderlyingSymbol = instrumentType, underlying
		position.Quantity, position.AveragePricePaise, position.CurrentPricePaise = newQty, newAverage, quote.PricePaise
		position.MarginBlockedPaise = newMargin
		position.RealizedPnlPaise, ok = add(position.RealizedPnlPaise, realized)
		if !ok {
			return errors.New("realized P&L is too large")
		}
		position.CostBasisPaise, ok = multiply(abs(newQty), newAverage)
		if !ok {
			return errors.New("position value is too large")
		}
		if err := tx.Save(&position).Error; err != nil {
			return err
		}
		if err := tx.Create(&model.Trade{OrderUUID: order.UUID, UserUUID: userUUID, Symbol: order.Symbol, Side: order.Side, Quantity: order.Quantity, PricePaise: quote.PricePaise, TotalPaise: total, Product: order.Product, Source: order.Source, Reason: order.Reason, RealizedPnlPaise: realized, ExecutedAt: time.Now()}).Error; err != nil {
			return err
		}
		order.Status, order.ExecutedPricePaise, order.ReservedPaise = model.OrderStatusExecuted, quote.PricePaise, 0
		return tx.Save(&order).Error
	})
}

func (s *OrderService) marginForPosition(productName, instrumentType string, quantity, averagePrice int64) (int64, error) {
	if quantity == 0 {
		return 0, nil
	}
	// Long option premium is paid from cash at entry; it is not blocked margin.
	if productName == model.OrderProductFNO && instrumentType == product.InstrumentOption && quantity > 0 {
		return 0, nil
	}
	notional, ok := multiply(abs(quantity), averagePrice)
	if !ok {
		return 0, errors.New("position value is too large")
	}
	side := model.OrderSideBuy
	if quantity < 0 {
		side = model.OrderSideSell
	}
	return s.rules.Margin(productName, instrumentType, side, notional)
}

func abs(value int64) int64 {
	if value < 0 {
		return -value
	}
	return value
}

// calculateSlippage simulates realistic exchange market impact for market and SL-M orders.
func calculateSlippage(quantity int64, ltpPaise int64, side string) int64 {
	if quantity <= 50 || ltpPaise <= 0 {
		return ltpPaise
	}
	// Simulated slippage between 0.02% (2 bps) and 0.06% (6 bps) based on quantity
	slipBps := int64(2) + (quantity / 250)
	if slipBps > 6 {
		slipBps = 6
	}
	slipAmount := (ltpPaise * slipBps) / 10000
	if slipAmount < 5 { // minimum 5 paise exchange tick
		slipAmount = 5
	}
	if side == model.OrderSideBuy {
		return ltpPaise + slipAmount
	}
	res := ltpPaise - slipAmount
	if res <= 0 {
		return 5
	}
	return res
}

func limitSatisfied(order *model.Order, executionPricePaise int64) bool {
	if (order.Type != model.OrderTypeLimit && order.Type != model.OrderTypeSL) || order.PricePaise <= 0 || executionPricePaise <= 0 {
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
	if left == 0 || right == 0 {
		return 0, true
	}
	if left < 0 || right < 0 || left > math.MaxInt64/right {
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

type PositionTransition struct {
	NewQuantity      int64
	NewAveragePrice  int64
	RealizedPnlPaise int64
	ClosedQuantity   int64
	OpenedQuantity   int64
}

// calculatePositionTransition determines the new quantity, new average entry price,
// and realized P&L when applying an order fill to an existing net position.
// It supports increasing positions, partial reductions, complete closures,
// and full crossing / net position reversals across zero.
func calculatePositionTransition(oldQty, oldAverage, orderQty, execPrice int64, side string) (PositionTransition, error) {
	if orderQty <= 0 {
		return PositionTransition{}, errors.New("order quantity must be positive")
	}
	if execPrice <= 0 {
		return PositionTransition{}, errors.New("execution price must be positive")
	}
	if side != model.OrderSideBuy && side != model.OrderSideSell {
		return PositionTransition{}, errors.New("invalid order side")
	}

	delta := orderQty
	if side == model.OrderSideSell {
		delta = -delta
	}
	newQty, ok := add(oldQty, delta)
	if !ok {
		return PositionTransition{}, errors.New("position quantity is too large")
	}

	// Case 1: Order opposes existing position (reducing, flattening, or reversing across zero)
	if oldQty != 0 && ((oldQty > 0 && delta < 0) || (oldQty < 0 && delta > 0)) {
		closed := orderQty
		if closed > abs(oldQty) {
			closed = abs(oldQty)
		}
		opened := orderQty - closed

		entryNotional, ok := multiply(closed, oldAverage)
		if !ok {
			return PositionTransition{}, errors.New("position value is too large")
		}
		exitNotional, ok := multiply(closed, execPrice)
		if !ok {
			return PositionTransition{}, errors.New("order value is too large")
		}

		var realized int64
		if oldQty > 0 {
			realized, ok = subtract(exitNotional, entryNotional)
		} else {
			realized, ok = subtract(entryNotional, exitNotional)
		}
		if !ok {
			return PositionTransition{}, errors.New("realized P&L is too large")
		}

		var newAverage int64
		if newQty == 0 {
			newAverage = 0
		} else if (oldQty > 0) == (newQty > 0) {
			// Position reduced in same direction; average price of remaining units is unchanged.
			newAverage = oldAverage
		} else {
			// Position reversed across zero; remaining units opened at current execution price.
			newAverage = execPrice
		}

		return PositionTransition{
			NewQuantity:      newQty,
			NewAveragePrice:  newAverage,
			RealizedPnlPaise: realized,
			ClosedQuantity:   closed,
			OpenedQuantity:   opened,
		}, nil
	}

	// Case 2: Opening a brand new position from flat (oldQty == 0)
	if oldQty == 0 {
		return PositionTransition{
			NewQuantity:      newQty,
			NewAveragePrice:  execPrice,
			RealizedPnlPaise: 0,
			ClosedQuantity:   0,
			OpenedQuantity:   orderQty,
		}, nil
	}

	// Case 3: Increasing existing position in the same direction (both long or both short)
	oldNotional, ok := multiply(abs(oldQty), oldAverage)
	if !ok {
		return PositionTransition{}, errors.New("position value is too large")
	}
	addedNotional, ok := multiply(orderQty, execPrice)
	if !ok {
		return PositionTransition{}, errors.New("order value is too large")
	}
	totalNotional, ok := add(oldNotional, addedNotional)
	if !ok {
		return PositionTransition{}, errors.New("position value is too large")
	}
	newAverage := totalNotional / abs(newQty)

	return PositionTransition{
		NewQuantity:      newQty,
		NewAveragePrice:  newAverage,
		RealizedPnlPaise: 0,
		ClosedQuantity:   0,
		OpenedQuantity:   orderQty,
	}, nil
}
