package service

import (
	"fmt"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/portfolio/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/portfolio/repository"
	"github.com/google/uuid"
)

type PortfolioService struct {
	repo *repository.PortfolioRepository
}

func New() *PortfolioService { return &PortfolioService{repo: repository.New()} }

func (s *PortfolioService) Get(userID string) (*dto.PortfolioResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user identity")
	}
	positions, err := s.repo.ListPositions(userUUID)
	if err != nil {
		return nil, err
	}

	result := &dto.PortfolioResponse{Positions: make([]dto.PositionResponse, 0, len(positions))}
	for _, position := range positions {
		item := toPositionResponse(position)
		result.Positions = append(result.Positions, item)
		result.InvestedValuePaise += item.InvestedValuePaise
		result.CurrentValuePaise += item.CurrentValuePaise
		result.UnrealizedPnlPaise += item.UnrealizedPnlPaise
	}
	return result, nil
}

func (s *PortfolioService) Positions(userID string) ([]dto.PositionResponse, error) {
	portfolio, err := s.Get(userID)
	if err != nil {
		return nil, err
	}
	return portfolio.Positions, nil
}

func (s *PortfolioService) Pnl(userID string) (*dto.PortfolioResponse, error) {
	portfolio, err := s.Get(userID)
	if err != nil {
		return nil, err
	}
	portfolio.Positions = nil
	return portfolio, nil
}

func toPositionResponse(position model.Position) dto.PositionResponse {
	return dto.PositionResponse{
		UUID: position.UUID.String(), Symbol: position.Symbol, Quantity: position.Quantity,
		AveragePricePaise: position.AveragePricePaise, CurrentPricePaise: position.CurrentPricePaise,
		InvestedValuePaise: position.InvestedValuePaise(), CurrentValuePaise: position.CurrentValuePaise(),
		UnrealizedPnlPaise: position.UnrealizedPnlPaise(),
	}
}
