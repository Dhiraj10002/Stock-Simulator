package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	orderService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/service"
	"gorm.io/gorm"
	"math"
	"math/big"
	"strings"
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
	if s.repo == nil {
		return nil, fmt.Errorf("portfolio repository not configured")
	}
	boundary, err := accountingBoundary(now)
	if err != nil {
		return nil, err
	}
	day := boundary.Format("2006-01-02")
	return s.repo.EnsureDailySnapshot(userUUID, day, func(tx *gorm.DB, wallet model.Wallet) (*model.AccountDailySnapshot, error) {
		// Initial registration and resets establish an explicit capital epoch.
		var epoch model.WalletTransaction
		if err := tx.Where("wallet_uuid = ? AND type IN ? AND created_at <= ?", wallet.UUID,
			[]string{model.WalletTransactionInitialCredit, model.WalletTransactionReset}, now).
			Order("created_at DESC, id DESC").First(&epoch).Error; err != nil {
			return nil, err
		}
		openingCash := epoch.BalancePaise
		from := epoch.CreatedAt
		if from.Before(boundary) {
			var last model.WalletTransaction
			if err := tx.Where("wallet_uuid = ? AND created_at < ?", wallet.UUID, boundary).
				Order("created_at DESC, id DESC").First(&last).Error; err != nil {
				return nil, err
			}
			openingCash = last.BalancePaise
		} else {
			boundary = from
		}
		var trades []model.Trade
		if err := tx.Where("user_uuid = ? AND executed_at >= ? AND executed_at < ?", userUUID, from, boundary).
			Order("executed_at ASC, id ASC").Find(&trades).Error; err != nil {
			return nil, err
		}
		positions := map[string]model.Position{}
		for _, tr := range trades {
			key := tr.Symbol + "|" + tr.Product
			pos := positions[key]
			if tr.PricePaise == 0 && tr.Reason == model.OrderReasonFNOExpiry {
				if tr.Quantity != absPortfolio(pos.Quantity) {
					return nil, fmt.Errorf("invalid zero-price expiry ledger")
				}
				pos.Quantity = 0
				pos.AveragePricePaise = 0
				positions[key] = pos
				continue
			}
			transition, err := orderService.ReplayPositionTransition(pos.Quantity, pos.AveragePricePaise, tr.Quantity, tr.PricePaise, tr.Side)
			if err != nil {
				return nil, err
			}
			pos.Symbol, pos.Product = tr.Symbol, tr.Product
			pos.Quantity, pos.AveragePricePaise = transition.NewQuantity, transition.NewAveragePrice
			positions[key] = pos
		}
		openingValue := int64(0)
		for _, pos := range positions {
			if pos.Quantity == 0 {
				continue
			}
			q, err := s.currentQuote(pos.Symbol)
			if err != nil || q == nil || !q.DayChangeAvailable || q.PreviousClosePaise <= 0 {
				return nil, fmt.Errorf("opening reference unavailable for %s", pos.Symbol)
			}
			qt, err := marketDTO.ParseQuoteTime(q.UpdatedAt)
			if err != nil || qt.In(calendar.Location()).Format("2006-01-02") != day {
				return nil, fmt.Errorf("opening reference has wrong session")
			}
			pos.CurrentPricePaise = q.PreviousClosePaise
			if pos.Product == model.OrderProductFNO {
				var inst model.Instrument
				if err := tx.Where("symbol = ?", pos.Symbol).First(&inst).Error; err != nil {
					return nil, err
				}
				pos.InstrumentType = inst.InstrumentType
			}
			value, err := positionEquity(pos)
			if err != nil {
				return nil, err
			}
			openingValue, err = addPnl(openingValue, value)
			if err != nil {
				return nil, err
			}
		}
		// Refuse incomplete legacy ledgers instead of inventing an opening value.
		var current []model.Position
		if err := tx.Where("user_uuid = ? AND quantity <> 0", userUUID).Find(&current).Error; err != nil {
			return nil, err
		}
		var after []model.Trade
		if err := tx.Where("user_uuid = ? AND executed_at >= ? AND executed_at <= ?", userUUID, boundary, now).Find(&after).Error; err != nil {
			return nil, err
		}
		qty := map[string]int64{}
		for k, pos := range positions {
			qty[k] = pos.Quantity
		}
		for _, tr := range after {
			delta := tr.Quantity
			if tr.Side == model.OrderSideSell {
				delta = -delta
			}
			qty[tr.Symbol+"|"+tr.Product] += delta
		}
		for _, pos := range current {
			key := pos.Symbol + "|" + pos.Product
			if qty[key] != pos.Quantity {
				return nil, fmt.Errorf("incomplete position ledger")
			}
			delete(qty, key)
		}
		for _, n := range qty {
			if n != 0 {
				return nil, fmt.Errorf("incomplete position ledger")
			}
		}
		inflow, err := repository.DepositsInTransaction(tx, wallet.UUID, boundary)
		if err != nil {
			return nil, err
		}
		equity, err := addPnl(openingCash, openingValue)
		if err != nil {
			return nil, err
		}
		return &model.AccountDailySnapshot{UserUUID: userUUID, SessionDate: day, OpeningCashPaise: openingCash,
			OpeningHoldingsValuePaise: openingValue, OpeningEquityPaise: equity, NetCashInflowsPaise: inflow, CreatedAt: now}, nil
	})
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

	equityValue := int64(0)
	equityValid := true
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
		value, equityErr := positionEquity(position)
		if equityErr != nil || !isAvailable {
			equityValid = false
		} else {
			equityValue, equityErr = addPnl(equityValue, value)
			if equityErr != nil {
				equityValid = false
			}
		}
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

	// Read wallet, positions and capital flows at one serialized ledger boundary.
	if equityValid {
		if snap, err := s.EnsureSessionSnapshot(userUUID, s.now()); err == nil && snap != nil {
			_ = s.repo.ReadAccount(userUUID, snap.SessionDate, func(wallet model.Wallet, positions []model.Position, snapshot *model.AccountDailySnapshot) error {
				equity := wallet.CashBalancePaise
				for _, p := range positions {
					q, err := s.currentQuote(p.Symbol)
					if err != nil || q == nil {
						return fmt.Errorf("quote unavailable")
					}
					p.CurrentPricePaise = q.PricePaise
					value, err := positionEquity(p)
					if err != nil {
						return err
					}
					equity, err = addPnl(equity, value)
					if err != nil {
						return err
					}
				}
				daily, err := addPnl(equity, -snapshot.OpeningEquityPaise)
				if err != nil {
					return err
				}
				daily, err = addPnl(daily, -snapshot.NetCashInflowsPaise)
				if err != nil {
					return err
				}
				result.DailyPnlPaise = &daily
				if snapshot.OpeningEquityPaise > 0 {
					pct := math.Round(float64(daily)/float64(snapshot.OpeningEquityPaise)*10000) / 100
					result.DailyPnlPercent = &pct
				}
				return nil
			})
		}
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
		InstrumentType:     position.InstrumentType,
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

// Select the latest supported regular session; weekend/pre-open reads cannot create a new day.
func accountingBoundary(now time.Time) (time.Time, error) {
	day := now.In(calendar.Location())
	if !calendar.Snapshot(day.Year()).Available {
		return time.Time{}, fmt.Errorf("calendar unavailable")
	}
	for i := 0; i < 10; i++ {
		open, _, _ := calendar.SessionBounds(day)
		holiday, _ := calendar.IsTradingHoliday(day)
		if !calendar.IsWeekend(day) && !holiday && !now.Before(open) {
			return open, nil
		}
		day = day.AddDate(0, 0, -1)
	}
	return time.Time{}, fmt.Errorf("accounting session unavailable")
}

func positionEquity(p model.Position) (int64, error) {
	if p.Quantity == 0 {
		return 0, nil
	}
	if p.CurrentPricePaise <= 0 {
		return 0, fmt.Errorf("missing position valuation")
	}
	mark := p.CurrentPricePaise
	kind := strings.ToUpper(p.InstrumentType)
	switch p.Product {
	case model.OrderProductDelivery:
	case model.OrderProductIntraday:
		mark -= p.AveragePricePaise
	case model.OrderProductFNO:
		switch kind {
		case "FUTURE", "FUTIDX", "FUTSTK":
			mark -= p.AveragePricePaise
		case "OPTION", "OPTIDX", "OPTSTK":
		default:
			return 0, fmt.Errorf("unknown derivative valuation type")
		}
	default:
		return 0, fmt.Errorf("unknown product")
	}
	v := new(big.Int).Mul(big.NewInt(p.Quantity), big.NewInt(mark))
	if !v.IsInt64() {
		return 0, fmt.Errorf("position equity overflow")
	}
	return v.Int64(), nil
}

func absPortfolio(n int64) int64 {
	if n < 0 {
		return -n
	}
	return n
}
