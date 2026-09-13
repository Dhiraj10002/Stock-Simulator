package service

import (
	"fmt"
	"math"
	"time"

	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/portfolio/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/portfolio/repository"
	"github.com/google/uuid"
)

type PortfolioService struct {
	repo   *repository.PortfolioRepository
	market *marketService.Service
}

func New(market *marketService.Service) *PortfolioService {
	return &PortfolioService{repo: repository.New(), market: market}
}

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
		// Valuation must not silently use an old or malformed cached price.
		quote, err := s.market.ExecutableQuote(position.Symbol)
		if err != nil {
			return nil, fmt.Errorf("current quote for %s: %w", position.Symbol, err)
		}
		if quote.PricePaise <= 0 {
			return nil, fmt.Errorf("current quote for %s has an invalid price", position.Symbol)
		}
		position.CurrentPricePaise = quote.PricePaise
		item := toPositionResponse(position)
		result.Positions = append(result.Positions, item)
		result.InvestedValuePaise += item.InvestedValuePaise
		result.CurrentValuePaise += item.CurrentValuePaise
		result.UnrealizedPnlPaise += item.UnrealizedPnlPaise
	}
	result.RealizedPnlPaise, err = s.repo.RealizedPnl(userUUID, time.Unix(0, 0))
	if err != nil {
		return nil, err
	}
	location, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		return nil, err
	}
	now := time.Now().In(location)
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, location)
	dailyRealized, err := s.repo.RealizedPnl(userUUID, dayStart)
	if err != nil {
		return nil, err
	}
	result.DailyPnlPaise, err = addPnl(result.UnrealizedPnlPaise, dailyRealized)
	if err != nil {
		return nil, err
	}
	result.TotalPnlPaise, err = addPnl(result.UnrealizedPnlPaise, result.RealizedPnlPaise)
	if err != nil {
		return nil, err
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
		UnrealizedPnlPaise: position.UnrealizedPnlPaise(), RealizedPnlPaise: position.RealizedPnlPaise,
	}
}

func addPnl(left, right int64) (int64, error) {
	if (right > 0 && left > math.MaxInt64-right) || (right < 0 && left < math.MinInt64-right) {
		return 0, fmt.Errorf("portfolio P&L is too large")
	}
	return left + right, nil
}
