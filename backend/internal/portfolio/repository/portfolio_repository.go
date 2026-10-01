package repository

import (
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

