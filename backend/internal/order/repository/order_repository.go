package repository

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/alias"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type OrderRepository struct{}

func New() *OrderRepository { return &OrderRepository{} }

func (r *OrderRepository) Create(order *model.Order) error {
	if database.GetDB() == nil {
		return errors.New("database not connected")
	}
	return database.GetDB().Create(order).Error
}

// CreateDeliverySell verifies that the user holds enough free shares
// (position quantity minus open/pending sell orders) and creates the order atomically.
func (r *OrderRepository) CreateDeliverySell(order *model.Order) error {
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		// Lock wallet first to preserve uniform per-user serialization hierarchy
		var wallet model.Wallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_uuid = ?", order.UserUUID).First(&wallet).Error; err != nil {
			return err
		}

		var position model.Position
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_uuid = ? AND symbol = ? AND product = ?", order.UserUUID, order.Symbol, model.OrderProductDelivery).
			First(&position).Error

		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("cannot place DELIVERY sell order without holding shares of %s", order.Symbol)
			}
			return err
		}
		if position.Quantity <= 0 {
			return fmt.Errorf("insufficient shares to sell: position quantity is %d", position.Quantity)
		}

		var committedShares int64
		err = tx.Model(&model.Order{}).
			Where("user_uuid = ? AND symbol = ? AND product = ? AND side = ? AND status IN ?",
				order.UserUUID, order.Symbol, model.OrderProductDelivery, model.OrderSideSell,
				[]string{model.OrderStatusPending, model.OrderStatusOpen, model.OrderStatusTriggerPending}).
			Select("COALESCE(SUM(quantity), 0)").
			Scan(&committedShares).Error
		if err != nil {
			return err
		}

		availableShares := position.Quantity - committedShares
		if order.Quantity > availableShares {
			return fmt.Errorf("insufficient available shares to sell: holding %d, %d committed to open orders, %d available",
				position.Quantity, committedShares, availableShares)
		}

		return tx.Create(order).Error
	})
}

func (r *OrderRepository) CreateWithReservation(order *model.Order, reservation int64) error {
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		var wallet model.Wallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_uuid = ?", order.UserUUID).First(&wallet).Error; err != nil {
			return err
		}
		if wallet.AvailableBalancePaise() < reservation {
			return gorm.ErrInvalidData
		}
		wallet.BlockedPaise += reservation
		if err := tx.Save(&wallet).Error; err != nil {
			return err
		}

		if err := tx.Create(&model.WalletTransaction{
			WalletUUID:   wallet.UUID,
			Type:         model.WalletTransactionReserve,
			AmountPaise:  reservation,
			BalancePaise: wallet.CashBalancePaise,
			BlockedPaise: wallet.BlockedPaise,
			Note:         "Order margin reserved",
		}).Error; err != nil {
			return err
		}

		order.ReservedPaise = reservation
		return tx.Create(order).Error
	})
}

func (r *OrderRepository) List(userUUID uuid.UUID) ([]model.Order, error) {
	// Automatically purge terminal orders (executed, cancelled, rejected) older than 24 hours
	cutoff := time.Now().Add(-24 * time.Hour)
	_ = database.GetDB().
		Where("user_uuid = ? AND status IN ? AND created_at < ?",
			userUUID,
			[]string{model.OrderStatusExecuted, model.OrderStatusCancelled, model.OrderStatusRejected},
			cutoff).
		Delete(&model.Order{}).Error

	var orders []model.Order
	err := database.GetDB().
		Where("user_uuid = ?", userUUID).
		Order("created_at DESC").
		Find(&orders).Error
	return orders, err
}

func (r *OrderRepository) ClearHistory(userUUID uuid.UUID) (int64, error) {
	tx := database.GetDB().Begin()
	defer func() {
		if rec := recover(); rec != nil {
			tx.Rollback()
		}
	}()

	_ = tx.Where("user_uuid = ?", userUUID).Delete(&model.Trade{})

	res := tx.Where("user_uuid = ? AND status IN ?",
		userUUID,
		[]string{model.OrderStatusExecuted, model.OrderStatusCancelled, model.OrderStatusRejected}).
		Delete(&model.Order{})

	if err := res.Error; err != nil {
		tx.Rollback()
		return 0, err
	}

	return res.RowsAffected, tx.Commit().Error
}

func (r *OrderRepository) FindByUUID(userUUID, orderUUID uuid.UUID) (*model.Order, error) {
	var order model.Order
	err := database.GetDB().
		Where("uuid = ? AND user_uuid = ?", orderUUID, userUUID).
		First(&order).Error
	return &order, err
}

func (r *OrderRepository) FindInstrument(symbol string) (*model.Instrument, error) {
	if database.GetDB() == nil {
		return nil, errors.New("database not connected")
	}
	var instrument model.Instrument
	clean := strings.ToUpper(strings.TrimSpace(symbol))
	if clean == "" {
		return nil, gorm.ErrRecordNotFound
	}

	// 1. Direct query: exact symbol match, with -EQ suffix, or exact name
	err := database.GetDB().Where("UPPER(symbol) = ? OR UPPER(symbol) = ? OR UPPER(name) = ?", clean, clean+"-EQ", clean).First(&instrument).Error
	if err == nil {
		return &instrument, nil
	}

	// 2. Dynamic alias resolution: check canonical symbol
	canonical := alias.ResolveCanonicalSymbol(clean)
	if canonical != "" && canonical != clean {
		err = database.GetDB().Where("UPPER(symbol) = ? OR UPPER(symbol) = ? OR UPPER(name) = ?", canonical, canonical+"-EQ", canonical).First(&instrument).Error
		if err == nil {
			return &instrument, nil
		}
	}

	// 3. Reverse alias resolution: check any aliases that map to this symbol
	aliases := alias.GetAliases(clean)
	for _, a := range aliases {
		err = database.GetDB().Where("UPPER(symbol) = ? OR UPPER(symbol) = ? OR UPPER(name) = ?", a, a+"-EQ", a).First(&instrument).Error
		if err == nil {
			return &instrument, nil
		}
	}

	return nil, err
}

// ListOpenLimitOrders returns candidates in FIFO order. Settlement still locks
// and rechecks each order, so a cancellation racing with a quote is safe.
func (r *OrderRepository) ListOpenLimitOrders(symbol string) ([]model.Order, error) {
	var orders []model.Order
	err := database.GetDB().
		Where("symbol = ? AND type = ? AND status IN ?", symbol, model.OrderTypeLimit, []string{model.OrderStatusPending, model.OrderStatusOpen}).
		Order("created_at ASC").
		Find(&orders).Error
	return orders, err
}

// ListActiveOrders returns all pending, open, or trigger-pending orders for a symbol.
func (r *OrderRepository) ListActiveOrders(symbol string) ([]model.Order, error) {
	var orders []model.Order
	err := database.GetDB().
		Where("symbol = ? AND status IN ?", symbol, []string{model.OrderStatusPending, model.OrderStatusOpen, model.OrderStatusTriggerPending}).
		Order("created_at ASC").
		Find(&orders).Error
	return orders, err
}

func (r *OrderRepository) TriggerOrder(orderUUID uuid.UUID, newStatus string) error {
	return database.GetDB().
		Model(&model.Order{}).
		Where("uuid = ? AND status = ?", orderUUID, model.OrderStatusTriggerPending).
		Update("status", newStatus).Error
}

// Reject marks a newly-created market order as rejected when its immediate
// settlement fails. It never releases funds: market orders have no reservation.
func (r *OrderRepository) Reject(userUUID, orderUUID uuid.UUID) error {
	return database.GetDB().
		Model(&model.Order{}).
		Where("uuid = ? AND user_uuid = ? AND status IN ? AND reserved_paise = 0", orderUUID, userUUID, []string{model.OrderStatusPending, model.OrderStatusOpen, model.OrderStatusTriggerPending}).
		Update("status", model.OrderStatusRejected).Error
}

func (r *OrderRepository) Cancel(userUUID, orderUUID uuid.UUID) error {
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		// Lock the wallet first, matching reservation, execution, and reset.
		var wallet model.Wallet
		if err := tx.
			Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_uuid = ?", userUUID).
			First(&wallet).Error; err != nil {
			return err
		}

		var order model.Order
		if err := tx.
			Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("uuid = ? AND user_uuid = ?", orderUUID, userUUID).
			First(&order).Error; err != nil {
			return err
		}

		if order.Status != model.OrderStatusPending &&
			order.Status != model.OrderStatusOpen &&
			order.Status != model.OrderStatusTriggerPending {
			return gorm.ErrInvalidData
		}

		if order.ReservedPaise > 0 {
			if wallet.BlockedPaise < order.ReservedPaise {
				return gorm.ErrInvalidData
			}

			wallet.BlockedPaise -= order.ReservedPaise

			if err := tx.Save(&wallet).Error; err != nil {
				return err
			}

			if err := tx.Create(&model.WalletTransaction{
				WalletUUID:   wallet.UUID,
				Type:         model.WalletTransactionRelease,
				AmountPaise:  order.ReservedPaise,
				BalancePaise: wallet.CashBalancePaise,
				BlockedPaise: wallet.BlockedPaise,
				Note:         "Cancelled order funds released",
			}).Error; err != nil {
				return err
			}

			order.ReservedPaise = 0
		}

		order.Status = model.OrderStatusCancelled

		return tx.Save(&order).Error
	})
}
