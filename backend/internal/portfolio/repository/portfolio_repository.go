package repository

import (
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
)

type PortfolioRepository struct{}

func New() *PortfolioRepository { return &PortfolioRepository{} }

func (r *PortfolioRepository) ListPositions(userUUID uuid.UUID) ([]model.Position, error) {
	var positions []model.Position
	err := database.GetDB().Where("user_uuid = ? AND quantity > 0", userUUID).Order("symbol ASC").Find(&positions).Error
	return positions, err
}
