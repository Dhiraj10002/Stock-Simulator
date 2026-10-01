package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"time"
	_ "time/tzdata"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
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
		return s.market.CachedQuote(symbol)
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

func (s *PortfolioService) cacheSnapshotToRedis(snap *model.AccountDailySnapshot) {
	if s.market == nil || s.market.Client() == nil || snap == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	key := fmt.Sprintf("portfolio:snapshot:%s:%s", snap.UserUUID.String(), snap.SessionDate)
	if data, err := json.Marshal(snap); err == nil {
		_ = s.market.Client().Set(ctx, key, data, 24*time.Hour).Err()
	}
}

func (s *PortfolioService) getSnapshotFromRedis(userUUID uuid.UUID, sessionDate string) *model.AccountDailySnapshot {
	if s.market == nil || s.market.Client() == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	key := fmt.Sprintf("portfolio:snapshot:%s:%s", userUUID.String(), sessionDate)
	data, err := s.market.Client().Get(ctx, key).Bytes()
	if err != nil {
		return nil
	}
	var snap model.AccountDailySnapshot
	if err := json.Unmarshal(data, &snap); err == nil {
		return &snap
	}
	return nil
}

// EnsureSessionSnapshot retrieves or captures the 09:15 IST opening equity snapshot for a user.
func (s *PortfolioService) EnsureSessionSnapshot(userUUID uuid.UUID, now time.Time) (*model.AccountDailySnapshot, error) {
	todayStr := now.In(calendar.Location()).Format("2006-01-02")

	if s.repo == nil {
		if cached := s.getSnapshotFromRedis(userUUID, todayStr); cached != nil {
			return cached, nil
		}
		return nil, fmt.Errorf("portfolio repository not configured")
	}

	snap, err := s.repo.FindDailySnapshot(userUUID, todayStr)
	if err == nil && snap != nil {
		s.cacheSnapshotToRedis(snap)
		return snap, nil
	}

	wallet, err := s.repo.FindWallet(userUUID)
	if err != nil {
		return nil, err
	}

	sessionOpen, _, _ := calendar.SessionBounds(now)
	isNewUserToday := !wallet.CreatedAt.Before(sessionOpen)

	var openingCash int64
	var openingHoldings int64
	var openingEquity int64
	var netInflows int64

	if isNewUserToday {
		// If user registered today after session open, baseline is established at registration
		depositsToday, _ := s.repo.GetDepositsSince(userUUID, wallet.CreatedAt)
		tradesToday, _ := s.repo.GetTradesSince(userUUID, wallet.CreatedAt)

		var tradesCashDelta int64
		for _, tr := range tradesToday {
			if tr.Side == model.OrderSideBuy {
				tradesCashDelta += tr.TotalPaise
			} else if tr.Side == model.OrderSideSell {
				tradesCashDelta -= tr.TotalPaise
			}
		}

		openingCash = wallet.CashBalancePaise - depositsToday + tradesCashDelta
		openingHoldings = 0
		openingEquity = openingCash - wallet.BlockedPaise
		if openingEquity <= 0 {
			openingEquity = 100000000 // ₹10 Lakhs default
		}
		netInflows = depositsToday
	} else {
		// User registered before today; calculate baseline at today's 09:15 session open
		depositsToday, _ := s.repo.GetDepositsSince(userUUID, sessionOpen)
		tradesToday, _ := s.repo.GetTradesSince(userUUID, sessionOpen)

		var tradesCashDelta int64
		tradesQtyBySymbol := make(map[string]int64)
		for _, tr := range tradesToday {
			if tr.Side == model.OrderSideBuy {
				tradesCashDelta += tr.TotalPaise
				tradesQtyBySymbol[tr.Symbol] += tr.Quantity
			} else if tr.Side == model.OrderSideSell {
				tradesCashDelta -= tr.TotalPaise
				tradesQtyBySymbol[tr.Symbol] -= tr.Quantity
			}
		}

		openingCash = wallet.CashBalancePaise - depositsToday + tradesCashDelta

		positions, _ := s.listPositions(userUUID)
		for _, pos := range positions {
			overnightQty := pos.Quantity - tradesQtyBySymbol[pos.Symbol]
			if overnightQty <= 0 {
				continue
			}
			prevClose := int64(0)
			if q, qErr := s.currentQuote(pos.Symbol); qErr == nil && q != nil && q.PreviousClosePaise > 0 {
				prevClose = q.PreviousClosePaise
			} else if pos.CurrentPricePaise > 0 {
				prevClose = pos.CurrentPricePaise
			} else {
				prevClose = pos.AveragePricePaise
			}
			openingHoldings += overnightQty * prevClose
		}

		openingEquity = openingCash + openingHoldings - wallet.BlockedPaise
		if openingEquity <= 0 {
			openingEquity = wallet.CashBalancePaise
		}
		netInflows = depositsToday
	}

	newSnapshot := &model.AccountDailySnapshot{
		UserUUID:                  userUUID,
		SessionDate:               todayStr,
		OpeningCashPaise:          openingCash,
		OpeningHoldingsValuePaise: openingHoldings,
		OpeningEquityPaise:        openingEquity,
		NetCashInflowsPaise:       netInflows,
		CreatedAt:                 now,
	}

	if saveErr := s.repo.CreateDailySnapshot(newSnapshot); saveErr != nil {
		if existing, findErr := s.repo.FindDailySnapshot(userUUID, todayStr); findErr == nil && existing != nil {
			s.cacheSnapshotToRedis(existing)
			return existing, nil
		}
	}

	s.cacheSnapshotToRedis(newSnapshot)
	return newSnapshot, nil
}

// ProcessSessionOpenSnapshots records 09:15 IST opening equity snapshots for all active users.
func (s *PortfolioService) ProcessSessionOpenSnapshots(now time.Time) {
	if !calendar.IsMarketOpen(now) {
		return
	}
	if s.repo == nil {
		return
	}
	userUUIDs, err := s.repo.ListActiveUserUUIDs()
	if err != nil || len(userUUIDs) == 0 {
		return
	}
	for _, uUUID := range userUUIDs {
		_, _ = s.EnsureSessionSnapshot(uUUID, now)
	}
}

// RunSessionSnapshotScheduler periodically processes opening snapshots during trading sessions.
func (s *PortfolioService) RunSessionSnapshotScheduler(ctx context.Context) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		s.ProcessSessionOpenSnapshots(s.now())
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
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
				if t, parseErr := marketDTO.ParseQuoteTime(quote.UpdatedAt); parseErr == nil {
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

	// Calculate true Daily Account P&L based on session baseline (09:15 IST)
	if snap, snapErr := s.EnsureSessionSnapshot(userUUID, s.now()); snapErr == nil && snap != nil {
		wallet, wErr := s.repo.FindWallet(userUUID)
		cash := int64(0)
		blocked := int64(0)
		if wErr == nil && wallet != nil {
			cash = wallet.CashBalancePaise
			blocked = wallet.BlockedPaise
		}
		currentAccountValue := cash + result.CurrentValuePaise - blocked
		totalInflows := snap.NetCashInflowsPaise

		dailyPnl := currentAccountValue - snap.OpeningEquityPaise - totalInflows
		result.DailyPnlPaise = &dailyPnl

		if snap.OpeningEquityPaise > 0 {
			pct := math.Round((float64(dailyPnl)/float64(snap.OpeningEquityPaise))*10000) / 100
			result.DailyPnlPercent = &pct
		} else {
			zero := 0.0
			result.DailyPnlPercent = &zero
		}
	} else {
		result.DailyPnlPaise = nil
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
		MarginBlockedPaise: position.MarginBlockedPaise,
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
