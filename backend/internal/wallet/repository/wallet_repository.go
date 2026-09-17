package repository

import (
	"errors"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type WalletRepository struct{}

func New() *WalletRepository { return &WalletRepository{} }

func (r *WalletRepository) FindByUserUUID(userUUID uuid.UUID) (*model.Wallet, error) {
	var wallet model.Wallet
	err := database.GetDB().Where("user_uuid = ?", userUUID).First(&wallet).Error
	return &wallet, err
}

func (r *WalletRepository) Create(wallet *model.Wallet) error {
	return database.GetDB().Create(wallet).Error
}

func (r *WalletRepository) CreateTransaction(transaction *model.WalletTransaction) error {
	return database.GetDB().Create(transaction).Error
}

func (r *WalletRepository) CreateInitial(wallet *model.Wallet) error {
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(wallet).Error; err != nil {
			return err
		}
		return tx.Create(&model.WalletTransaction{
			WalletUUID: wallet.UUID, Type: model.WalletTransactionInitialCredit,
			AmountPaise: wallet.CashBalancePaise, BalancePaise: wallet.CashBalancePaise,
			BlockedPaise: wallet.BlockedPaise, Note: "Initial virtual capital",
		}).Error
	})
}

func (r *WalletRepository) EnsureStartingBalance(wallet *model.Wallet, amount int64) error {
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		wallet.CashBalancePaise = amount
		wallet.BlockedPaise = 0
		if err := tx.Save(wallet).Error; err != nil {
			return err
		}
		return tx.Create(&model.WalletTransaction{
			WalletUUID:   wallet.UUID,
			Type:         model.WalletTransactionInitialCredit,
			AmountPaise:  amount,
			BalancePaise: amount,
			BlockedPaise: 0,
			Note:         "Auto-provisioned initial virtual capital",
		}).Error
	})
}

func (r *WalletRepository) ListTransactions(walletUUID uuid.UUID) ([]model.WalletTransaction, error) {
	var transactions []model.WalletTransaction
	err := database.GetDB().Where("wallet_uuid = ?", walletUUID).Order("created_at DESC").Find(&transactions).Error
	return transactions, err
}

func (r *WalletRepository) Reset(walletUUID uuid.UUID, amount int64) (*model.Wallet, error) {
	var wallet model.Wallet
	err := database.GetDB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&wallet, "uuid = ?", walletUUID).Error; err != nil {
			return err
		}
		wallet.CashBalancePaise, wallet.BlockedPaise = amount, 0
		if err := tx.Save(&wallet).Error; err != nil {
			return err
		}
		return tx.Create(&model.WalletTransaction{WalletUUID: wallet.UUID, Type: model.WalletTransactionReset, AmountPaise: amount, BalancePaise: amount, Note: "Wallet reset"}).Error
	})
	return &wallet, err
}

func (r *WalletRepository) Credit(walletUUID uuid.UUID, amount int64, note string) error {
	if amount <= 0 {
		return errors.New("credit amount must be positive")
	}
	return r.adjust(walletUUID, amount, 0, model.WalletTransactionCredit, note)
}

func (r *WalletRepository) Debit(walletUUID uuid.UUID, amount int64, note string) error {
	if amount <= 0 {
		return errors.New("debit amount must be positive")
	}
	return r.adjust(walletUUID, -amount, 0, model.WalletTransactionDebit, note)
}

func (r *WalletRepository) Reserve(walletUUID uuid.UUID, amount int64, note string) error {
	if amount <= 0 {
		return errors.New("reserve amount must be positive")
	}
	return r.adjust(walletUUID, 0, amount, model.WalletTransactionReserve, note)
}

func (r *WalletRepository) Release(walletUUID uuid.UUID, amount int64, note string) error {
	if amount <= 0 {
		return errors.New("release amount must be positive")
	}
	return r.adjust(walletUUID, 0, -amount, model.WalletTransactionRelease, note)
}

func (r *WalletRepository) adjust(walletUUID uuid.UUID, cashChange, blockedChange int64, transactionType, note string) error {
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		var wallet model.Wallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&wallet, "uuid = ?", walletUUID).Error; err != nil {
			return err
		}
		if wallet.CashBalancePaise+cashChange < 0 || wallet.AvailableBalancePaise()+cashChange < 0 || wallet.BlockedPaise+blockedChange < 0 || wallet.CashBalancePaise+cashChange < wallet.BlockedPaise+blockedChange {
			return errors.New("insufficient available wallet balance")
		}
		wallet.CashBalancePaise += cashChange
		wallet.BlockedPaise += blockedChange
		if err := tx.Save(&wallet).Error; err != nil {
			return err
		}
		return tx.Create(&model.WalletTransaction{WalletUUID: wallet.UUID, Type: transactionType, AmountPaise: cashChange, BalancePaise: wallet.CashBalancePaise, BlockedPaise: wallet.BlockedPaise, Note: note}).Error
	})
}
