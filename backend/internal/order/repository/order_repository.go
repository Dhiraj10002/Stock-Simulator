package repository

import (
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type OrderRepository struct{}

func New() *OrderRepository { return &OrderRepository{} }

func (r *OrderRepository) Create(order *model.Order) error {
	return database.GetDB().Create(order).Error
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
		order.ReservedPaise = reservation
		if err := tx.Create(order).Error; err != nil {
			return err
		}
		return tx.Create(&model.WalletTransaction{
			WalletUUID:   wallet.UUID,
			Type:         model.WalletTransactionReserve,
			AmountPaise:  reservation,
			BalancePaise: wallet.CashBalancePaise,
			BlockedPaise: wallet.BlockedPaise,
			Note:         "Order funds reserved",
		}).Error
	})
}

func (r *OrderRepository) List(userUUID uuid.UUID) ([]model.Order, error) {
	var orders []model.Order
	err := database.GetDB().Where("user_uuid = ?", userUUID).Order("created_at DESC").Find(&orders).Error
	return orders, err
}

func (r *OrderRepository) FindByUUID(userUUID, orderUUID uuid.UUID) (*model.Order, error) {
	var order model.Order
	err := database.GetDB().Where("user_uuid = ? AND uuid = ?", userUUID, orderUUID).First(&order).Error
	return &order, err
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
			order.Status != model.OrderStatusOpen {
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
