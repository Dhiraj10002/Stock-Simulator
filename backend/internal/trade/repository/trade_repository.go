package repository

import (
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
)

type TradeRepository struct{}

func New() *TradeRepository { return &TradeRepository{} }

func (r *TradeRepository) List(userUUID uuid.UUID) ([]model.Trade, error) {
	var trades []model.Trade
	err := database.GetDB().Where("user_uuid = ?", userUUID).Order("executed_at DESC").Find(&trades).Error
	return trades, err
}
