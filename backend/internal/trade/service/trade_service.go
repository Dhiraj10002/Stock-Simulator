package service

import (
	"fmt"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/trade/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/trade/repository"
	"github.com/google/uuid"
)

type TradeService struct{ repo *repository.TradeRepository }

func New() *TradeService { return &TradeService{repo: repository.New()} }

func (s *TradeService) List(userID string) ([]dto.TradeResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user identity")
	}
	trades, err := s.repo.List(userUUID)
	if err != nil {
		return nil, err
	}
	result := make([]dto.TradeResponse, 0, len(trades))
	for _, trade := range trades {
		result = append(result, toResponse(trade))
	}
	return result, nil
}

func toResponse(trade model.Trade) dto.TradeResponse {
	return dto.TradeResponse{UUID: trade.UUID.String(), OrderUUID: trade.OrderUUID.String(), Symbol: trade.Symbol, Side: trade.Side, Quantity: trade.Quantity, PricePaise: trade.PricePaise, TotalPaise: trade.TotalPaise, ExecutedAt: trade.ExecutedAt.UTC().Format("2006-01-02T15:04:05Z07:00")}
}
