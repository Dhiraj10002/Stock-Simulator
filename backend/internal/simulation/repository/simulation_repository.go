package repository

import (
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SimulationRepository persists changes to a user's current trading state.
type SimulationRepository struct{}

func New() *SimulationRepository { return &SimulationRepository{} }

// ResetCurrentState atomically starts a new simulation while retaining all
// historical orders, trades, and wallet transactions.
func (r *SimulationRepository) ResetCurrentState(userUUID uuid.UUID, initialBalancePaise int64) error {
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		// Preserve order history. Updating open orders first follows the same
		// order-then-wallet locking order used by execution and cancellation.
		orderResult := tx.Model(&model.Order{}).
			Where("user_uuid = ? AND status IN ?", userUUID, []string{model.OrderStatusPending, model.OrderStatusOpen}).
			Update("status", model.OrderStatusCancelled)
		if orderResult.Error != nil {
			return orderResult.Error
		}

		var wallet model.Wallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_uuid = ?", userUUID).
			First(&wallet).Error; err != nil {
			return err
		}

		previousCashPaise, previousBlockedPaise := wallet.CashBalancePaise, wallet.BlockedPaise
		wallet.CashBalancePaise = initialBalancePaise
		wallet.BlockedPaise = 0
		if err := tx.Save(&wallet).Error; err != nil {
			return err
		}

		// P&L is derived from mutable positions, so snapshot it before clearing
		// those rows. Trades remain intact as execution history.
		var positions []model.Position
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_uuid = ?", userUUID).
			Find(&positions).Error; err != nil {
			return err
		}
		var investedValuePaise, currentValuePaise int64
		for _, position := range positions {
			investedValuePaise += position.InvestedValuePaise()
			currentValuePaise += position.CurrentValuePaise()
		}
		if err := tx.Create(&model.SimulationReset{
			UserUUID:             userUUID,
			InitialBalancePaise:  initialBalancePaise,
			PreviousCashPaise:    previousCashPaise,
			PreviousBlockedPaise: previousBlockedPaise,
			InvestedValuePaise:   investedValuePaise,
			CurrentValuePaise:    currentValuePaise,
			UnrealizedPnlPaise:   currentValuePaise - investedValuePaise,
			CancelledOrderCount:  orderResult.RowsAffected,
			ClearedPositionCount: int64(len(positions)),
		}).Error; err != nil {
			return err
		}

		if err := tx.Where("user_uuid = ?", userUUID).Delete(&model.Position{}).Error; err != nil {
			return err
		}

		return tx.Create(&model.WalletTransaction{
			WalletUUID:   wallet.UUID,
			Type:         model.WalletTransactionReset,
			AmountPaise:  initialBalancePaise,
			BalancePaise: initialBalancePaise,
			BlockedPaise: 0,
			Note:         "Simulation reset",
		}).Error
	})
}
