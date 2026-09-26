package service

import (
	"errors"
	"fmt"
	"math"
	"time"
	_ "time/tzdata"

	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/portfolio/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/portfolio/repository"
	"github.com/google/uuid"
)

type PortfolioService struct {
	repo              *repository.PortfolioRepository
	market            *marketService.Service
	currentQuoteFunc  func(symbol string) (*marketDTO.QuoteResponse, error)
	nowFunc           func() time.Time
	listPositionsFunc func(userUUID uuid.UUID) ([]model.Position, error)
	realizedPnlFunc   func(userUUID uuid.UUID, from time.Time) (int64, error)
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

func (s *PortfolioService) SetListPositionsFunc(fn func(userUUID uuid.UUID) ([]model.Position, error)) {
	s.listPositionsFunc = fn
}

func (s *PortfolioService) SetRealizedPnlFunc(fn func(userUUID uuid.UUID, from time.Time) (int64, error)) {
	s.realizedPnlFunc = fn
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

func (s *PortfolioService) listPositions(userUUID uuid.UUID) ([]model.Position, error) {
	if s.listPositionsFunc != nil {
		return s.listPositionsFunc(userUUID)
	}
	if s.repo != nil {
		return s.repo.ListPositions(userUUID)
	}
	return nil, fmt.Errorf("portfolio repository not configured")
}

func (s *PortfolioService) realizedPnl(userUUID uuid.UUID, from time.Time) (int64, error) {
	if s.realizedPnlFunc != nil {
		return s.realizedPnlFunc(userUUID, from)
	}
	if s.repo != nil {
		return s.repo.RealizedPnl(userUUID, from)
	}
	return 0, nil
}

func (s *PortfolioService) Get(userID string) (*dto.PortfolioResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user identity")
	}
	positions, err := s.listPositions(userUUID)
	if err != nil {
		return nil, err
	}

	result := &dto.PortfolioResponse{
		Positions:       make([]dto.PositionResponse, 0, len(positions)),
		ValuationStatus: "REALTIME",
	}

	allQuotesFresh := true
	hasUnavailableQuote := false

	for _, position := range positions {
		var quotePrice int64
		quoteStatus := "FRESH"
		quoteSource := ""
		isAvailable := false
		isStale := false

		quote, quoteErr := s.currentQuote(position.Symbol)
		if quoteErr == nil && quote != nil && quote.PricePaise > 0 {
			quotePrice = quote.PricePaise
			quoteSource = quote.Source
			isAvailable = true
			if quote.UpdatedAt != "" {
				if t, parseErr := time.Parse(time.RFC3339, quote.UpdatedAt); parseErr == nil {
					if s.now().Sub(t) > 2*time.Minute {
						quoteStatus = "STALE"
						isStale = true
						allQuotesFresh = false
					}
				}
			}
		} else if errors.Is(quoteErr, marketService.ErrQuoteStale) {
			quoteStatus = "STALE"
			isStale = true
			isAvailable = true
			allQuotesFresh = false
			if quote != nil && quote.PricePaise > 0 {
				quotePrice = quote.PricePaise
				quoteSource = quote.Source
			} else if position.CurrentPricePaise > 0 {
				quotePrice = position.CurrentPricePaise
			}
		} else {
			// Quote is missing or feed unavailable.
			// Hard rule: Never hide missing market data behind fake prices or silent fallbacks to cost basis.
			quoteStatus = "UNAVAILABLE"
			isAvailable = false
			hasUnavailableQuote = true
			allQuotesFresh = false
			if position.CurrentPricePaise > 0 {
				quotePrice = position.CurrentPricePaise
			} else {
				quotePrice = 0
			}
		}

		position.CurrentPricePaise = quotePrice
		item := toPositionResponse(position)
		item.QuoteStatus = quoteStatus
		item.QuoteSource = quoteSource
		item.IsQuoteAvailable = isAvailable
		item.IsQuoteStale = isStale

		result.Positions = append(result.Positions, item)
		result.InvestedValuePaise += item.InvestedValuePaise

		if isAvailable {
			result.CurrentValuePaise += item.CurrentValuePaise
			result.UnrealizedPnlPaise += item.UnrealizedPnlPaise
		} else if position.CurrentPricePaise > 0 {
			// Retain last known recorded value for degraded display
			result.CurrentValuePaise += item.CurrentValuePaise
			result.UnrealizedPnlPaise += item.UnrealizedPnlPaise
		}
	}

	if len(positions) == 0 {
		result.ValuationStatus = "REALTIME"
	} else if hasUnavailableQuote {
		result.ValuationStatus = "DEGRADED"
	} else if !allQuotesFresh {
		result.ValuationStatus = "STALE"
	} else {
		result.ValuationStatus = "REALTIME"
	}

	result.RealizedPnlPaise, err = s.realizedPnl(userUUID, time.Unix(0, 0))
	if err != nil {
		return nil, err
	}
	location, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		location = time.UTC
	}
	now := s.now().In(location)
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, location)
	dailyRealized, err := s.realizedPnl(userUUID, dayStart)
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
		UUID:               position.UUID.String(),
		Symbol:             position.Symbol,
		Product:            position.Product,
		UnderlyingSymbol:   position.UnderlyingSymbol,
		Quantity:           position.Quantity,
		AveragePricePaise:  position.AveragePricePaise,
		CurrentPricePaise:  position.CurrentPricePaise,
		InvestedValuePaise: position.InvestedValuePaise(),
		CurrentValuePaise:  position.CurrentValuePaise(),
		UnrealizedPnlPaise: position.UnrealizedPnlPaise(),
		RealizedPnlPaise:   position.RealizedPnlPaise,
	}
}

func addPnl(left, right int64) (int64, error) {
	if (right > 0 && left > math.MaxInt64-right) || (right < 0 && left < math.MinInt64-right) {
		return 0, fmt.Errorf("portfolio P&L is too large")
	}
	return left + right, nil
}

