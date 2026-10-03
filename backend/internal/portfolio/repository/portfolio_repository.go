package repository

import (
	"errors"
	"fmt"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type PortfolioRepository struct{}

func New() *PortfolioRepository { return &PortfolioRepository{} }

func (r *PortfolioRepository) ListPositions(userUUID uuid.UUID) ([]model.Position, error) {
	db := database.GetDB()
	if db == nil {
		return nil, nil
	}
	var positions []model.Position
	err := db.Where("user_uuid = ? AND quantity <> 0", userUUID).Order("symbol ASC").Find(&positions).Error
	return positions, err
}

func (r *PortfolioRepository) RealizedPnl(userUUID uuid.UUID, from time.Time) (int64, error) {
	db := database.GetDB()
	if db == nil {
		return 0, nil
	}
	var result struct{ Total int64 }
	err := db.Model(&model.Trade{}).
		Select("COALESCE(SUM(realized_pnl_paise), 0) AS total").
		Where("user_uuid = ? AND executed_at >= ?", userUUID, from).
		Scan(&result).Error
	return result.Total, err
}

func (r *PortfolioRepository) FindWallet(userUUID uuid.UUID) (*model.Wallet, error) {
	db := database.GetDB()
	if db == nil {
		return nil, gorm.ErrRecordNotFound
	}
	var wallet model.Wallet
	err := db.Where("user_uuid = ?", userUUID).First(&wallet).Error
	if err != nil {
		return nil, err
	}
	return &wallet, nil
}

func (r *PortfolioRepository) FindDailySnapshot(userUUID uuid.UUID, sessionDate string) (*model.AccountDailySnapshot, error) {
	db := database.GetDB()
	if db == nil {
		return nil, gorm.ErrRecordNotFound
	}
	var snapshot model.AccountDailySnapshot
	err := db.Where("user_uuid = ? AND session_date = ?", userUUID, sessionDate).First(&snapshot).Error
	if err != nil {
		return nil, err
	}
	return &snapshot, nil
}

func (r *PortfolioRepository) CreateDailySnapshot(snapshot *model.AccountDailySnapshot) error {
	db := database.GetDB()
	if db == nil {
		return nil
	}
	return db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_uuid"}, {Name: "session_date"}},
		DoNothing: true,
	}).Create(snapshot).Error
}

func (r *PortfolioRepository) RecordDepositInflow(userUUID uuid.UUID, sessionDate string, amountPaise int64) error {
	db := database.GetDB()
	if db == nil {
		return nil
	}
	return db.Model(&model.AccountDailySnapshot{}).
		Where("user_uuid = ? AND session_date = ?", userUUID, sessionDate).
		UpdateColumn("net_cash_inflows_paise", gorm.Expr("net_cash_inflows_paise + ?", amountPaise)).Error
}

func (r *PortfolioRepository) GetDepositsSince(userUUID uuid.UUID, from time.Time) (int64, error) {
	db := database.GetDB()
	if db == nil {
		return 0, nil
	}
	var wallet model.Wallet
	if err := db.Where("user_uuid = ?", userUUID).First(&wallet).Error; err != nil {
		return 0, nil
	}
	var result struct{ Total int64 }
	err := db.Model(&model.WalletTransaction{}).
		Select("COALESCE(SUM(amount_paise), 0) AS total").
		Where("wallet_uuid = ? AND (type = ? OR LOWER(note) LIKE ?) AND created_at >= ?", wallet.UUID, "DEPOSIT", "%deposit%", from).
		Scan(&result).Error
	return result.Total, err
}

func (r *PortfolioRepository) GetTradesSince(userUUID uuid.UUID, from time.Time) ([]model.Trade, error) {
	db := database.GetDB()
	if db == nil {
		return nil, nil
	}
	var trades []model.Trade
	err := db.Where("user_uuid = ? AND executed_at >= ?", userUUID, from).
		Order("executed_at ASC").
		Find(&trades).Error
	return trades, err
}

func (r *PortfolioRepository) ListActiveUserUUIDs() ([]uuid.UUID, error) {
	db := database.GetDB()
	if db == nil {
		return nil, nil
	}
	var userUUIDs []uuid.UUID
	err := db.Model(&model.Wallet{}).Distinct("user_uuid").Pluck("user_uuid", &userUUIDs).Error
	return userUUIDs, err
}

// EnsureDailySnapshot serializes baseline creation with executions, deposits and resets.
func (r *PortfolioRepository) EnsureDailySnapshot(user uuid.UUID, day string, build func(*gorm.DB, model.Wallet) (*model.AccountDailySnapshot, error)) (*model.AccountDailySnapshot, error) {
	db := database.GetDB()
	if db == nil {
		return nil, fmt.Errorf("database unavailable")
	}
	var result *model.AccountDailySnapshot
	err := db.Transaction(func(tx *gorm.DB) error {
		var wallet model.Wallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_uuid = ?", user).First(&wallet).Error; err != nil {
			return err
		}
		var reset model.WalletTransaction
		epoch := ""
		resetErr := tx.Where("wallet_uuid = ? AND type = ?", wallet.UUID, model.WalletTransactionReset).Order("created_at DESC,id DESC").First(&reset).Error
		if resetErr == nil {
			epoch = reset.UUID.String()
		} else if !errors.Is(resetErr, gorm.ErrRecordNotFound) {
			return resetErr
		}
		var existing model.AccountDailySnapshot
		err := tx.Where("user_uuid = ? AND session_date = ? AND epoch = ?", user, day, epoch).First(&existing).Error
		if err == nil {
			existing.SessionDate = day
			result = &existing
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		candidate, err := build(tx, wallet)
		if err != nil {
			return err
		}
		candidate.Epoch = epoch
		if err := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "user_uuid"}, {Name: "session_date"}, {Name: "epoch"}}, DoNothing: true}).Create(candidate).Error; err != nil {
			return err
		}
		if err := tx.Where("user_uuid = ? AND session_date = ? AND epoch = ?", user, day, epoch).First(&existing).Error; err != nil {
			return err
		}
		existing.SessionDate = day
		result = &existing
		return nil
	})
	return result, err
}
func DepositsInTransaction(tx *gorm.DB, wallet uuid.UUID, from time.Time) (int64, error) {
	var total struct{ Total int64 }
	err := tx.Model(&model.WalletTransaction{}).Select("COALESCE(SUM(amount_paise),0) AS total").Where("wallet_uuid = ? AND (type = ? OR (type = ? AND note = ?)) AND created_at >= ?", wallet, "DEPOSIT", "CREDIT", "Paper trading margin deposit", from).Scan(&total).Error
	return total.Total, err
}

func (r *PortfolioRepository) ReadAccount(user uuid.UUID, day string, consume func(model.Wallet, []model.Position, *model.AccountDailySnapshot) error) error {
	db := database.GetDB()
	if db == nil {
		return fmt.Errorf("database unavailable")
	}
	return db.Transaction(func(tx *gorm.DB) error {
		var w model.Wallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_uuid = ?", user).First(&w).Error; err != nil {
			return err
		}
		var positions []model.Position
		if err := tx.Where("user_uuid = ? AND quantity <> 0", user).Find(&positions).Error; err != nil {
			return err
		}
		var snap model.AccountDailySnapshot
		if err := tx.Where("user_uuid = ? AND session_date = ?", user, day).Order("id DESC").First(&snap).Error; err != nil {
			return err
		}
		var reset model.WalletTransaction
		resetErr := tx.Where("wallet_uuid = ? AND type = ?", w.UUID, model.WalletTransactionReset).Order("created_at DESC,id DESC").First(&reset).Error
		if resetErr == nil && snap.Epoch != reset.UUID.String() {
			return fmt.Errorf("accounting epoch changed")
		}
		if resetErr != nil && !errors.Is(resetErr, gorm.ErrRecordNotFound) {
			return resetErr
		}
		session, err := time.ParseInLocation("2006-01-02", day, calendar.Location())
		if err != nil {
			return err
		}
		boundary, _, _ := calendar.SessionBounds(session)
		if resetErr == nil && reset.CreatedAt.After(boundary) {
			boundary = reset.CreatedAt
		}
		actual, err := DepositsInTransaction(tx, w.UUID, boundary)
		if err != nil {
			return err
		}
		snap.NetCashInflowsPaise = actual
		return consume(w, positions, &snap)
	})
}
