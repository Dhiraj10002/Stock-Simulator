package repository

import (
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
	"time"
)

type PortfolioRepository struct{}

func New() *PortfolioRepository { return &PortfolioRepository{} }

func (r *PortfolioRepository) ListPositions(userUUID uuid.UUID) ([]model.Position, error) {
	var positions []model.Position
	err := database.GetDB().Where("user_uuid = ? AND quantity > 0", userUUID).Order("symbol ASC").Find(&positions).Error
	return positions, err
}

func (r *PortfolioRepository) RealizedPnl(userUUID uuid.UUID, from time.Time) (int64, error) {
	var result struct{ Total int64 }
	err := database.GetDB().Model(&model.Trade{}).
		Select("COALESCE(SUM(realized_pnl_paise), 0) AS total").
		Where("user_uuid = ? AND executed_at >= ?", userUUID, from).
		Scan(&result).Error
	return result.Total, err
}
