package service

import (
	"fmt"
	"math"
	"time"

	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/portfolio/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/portfolio/repository"
	"github.com/google/uuid"
)

type PortfolioService struct {
	repo             *repository.PortfolioRepository
	market           *marketService.Service
	currentQuoteFunc func(symbol string) (*marketDTO.QuoteResponse, error)
	nowFunc          func() time.Time
}

func New(market *marketService.Service) *PortfolioService {
	return &PortfolioService{repo: repository.New(), market: market}
}

func (s *PortfolioService) SetCurrentQuoteFunc(fn func(symbol string) (*marketDTO.QuoteResponse, error)) {
	s.currentQuoteFunc = fn
}

func (s *PortfolioService) SetNowFunc(fn func() time.Time) {
	s.nowFunc = fn
}

func (s *PortfolioService) currentQuote(symbol string) (*marketDTO.QuoteResponse, error) {
	if s.currentQuoteFunc != nil {
		return s.currentQuoteFunc(symbol)
	}
	if s.market != nil {
		return s.market.CurrentQuote(symbol)
	}
	return nil, fmt.Errorf("market service not configured")
}

func (s *PortfolioService) now() time.Time {
	if s.nowFunc != nil {
		return s.nowFunc()
	}
	return time.Now()
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
		// Display valuation uses CurrentQuote (latest tick/cached price) decoupled
		// from 120s executable freshness so users can view holdings outside market hours
		// or on weekends. If Redis is unavailable, fall back to last recorded price or cost basis.
		var quotePrice int64
		quote, quoteErr := s.currentQuote(position.Symbol)
		if quoteErr == nil && quote != nil && quote.PricePaise > 0 {
			quotePrice = quote.PricePaise
		} else if position.CurrentPricePaise > 0 {
			quotePrice = position.CurrentPricePaise
		} else if position.AveragePricePaise > 0 {
			quotePrice = position.AveragePricePaise
		} else {
			return nil, fmt.Errorf("current quote for %s: price not available", position.Symbol)
		}

		position.CurrentPricePaise = quotePrice
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
	now := s.now().In(location)
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
		UUID: position.UUID.String(), Symbol: position.Symbol,
		Product: position.Product, UnderlyingSymbol: position.UnderlyingSymbol,
		Quantity: position.Quantity,
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
