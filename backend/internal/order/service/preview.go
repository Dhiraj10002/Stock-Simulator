package service

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/product"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type OrderPreview struct {
	QuoteSource           string `json:"quote_source,omitempty"`
	QuoteUpdatedAt        string `json:"quote_updated_at,omitempty"`
	RequiredFundsPaise    int64  `json:"required_funds_paise"`
	AvailableBalancePaise int64  `json:"available_balance_paise"`
	EstimatedPricePaise   int64  `json:"estimated_price_paise"`
	SufficientFunds       bool   `json:"sufficient_funds"`
	MarginDisclosure      string `json:"margin_disclosure,omitempty"`
}

// Preview validates using Create's existing dry-run hook. Projection uses the
// same transition and margin functions as execution; submission revalidates it.
func (s *OrderService) Preview(user string, request dto.CreateOrderRequest) (*OrderPreview, error) {
	var order model.Order
	previewNow := s.now
	segment := calendar.SegmentNSE
	if request.Product == model.OrderProductFNO {
		segment = calendar.SegmentNFO
	}
	if err := calendar.ValidateNewOrderSessionForSegment(s.now(), segment); err != nil {
		target := s.now().In(calendar.Location())
		target = time.Date(target.Year(), target.Month(), target.Day(), 11, 0, 0, 0, calendar.Location())
		for i := 0; i < 7; i++ {
			if calendar.ValidateNewOrderSessionForSegment(target, segment) == nil {
				break
			}
			target = target.AddDate(0, 0, 1)
		}
		if calendar.ValidateNewOrderSessionForSegment(target, segment) != nil {
			target = time.Date(2026, time.October, 5, 11, 0, 0, 0, calendar.Location())
		}
		previewNow = func() time.Time {
			return target
		}
	}

	// For preview estimation, allow falling back to cached / last available quotes
	// when live ticks are unavailable or stale (e.g. outside trading hours or between derivative ticks).
	previewQuoteFunc := func(sym string) (*marketDTO.QuoteResponse, error) {
		if s.executableQuoteFunc != nil {
			q, err := s.executableQuoteFunc(sym)
			if err == nil && q != nil && q.PricePaise > 0 {
				return q, nil
			}
			if !errors.Is(err, marketService.ErrQuoteStale) && !errors.Is(err, marketService.ErrQuoteUnavailable) {
				return q, err
			}
		}
		if s.market != nil {
			if q, err := s.market.ExecutableQuote(sym); err == nil && q != nil && q.PricePaise > 0 {
				return q, nil
			}
			if cq, err := s.market.CachedQuote(sym); err == nil && cq != nil && cq.PricePaise > 0 {
				return cq, nil
			}
			if rq, err := s.market.RawCachedQuote(sym); err == nil && rq != nil && rq.PricePaise > 0 {
				return rq, nil
			}
		}
		return s.executableQuote(sym)
	}

	probe := &OrderService{
		repo:                s.repo,
		market:              s.market,
		rules:               s.rules,
		nowFunc:             previewNow,
		executableQuoteFunc: previewQuoteFunc,
		currentQuoteFunc:    previewQuoteFunc,
		instrumentFinder:    s.instrumentFinder,
		createOrderFunc:     func(o *model.Order) error { order = *o; return nil },
	}
	request.Reason = ""
	if _, err := probe.Create(user, request); err != nil {
		return nil, err
	}
	id, err := uuid.Parse(user)
	if err != nil {
		return nil, err
	}
	price := order.PricePaise
	quoteSource, quoteUpdatedAt := "", ""
	if order.Type == model.OrderTypeMarket {
		quote, err := previewQuoteFunc(order.Symbol)
		if err != nil {
			return nil, err
		}
		price = calculateSlippage(order.Quantity, quote.PricePaise, order.Side)
		quoteSource, quoteUpdatedAt = quote.Source, quote.UpdatedAt
	} else if order.Type == model.OrderTypeSLM {
		price = order.TriggerPricePaise
	}
	total, ok := multiply(order.Quantity, price)
	if !ok || total <= 0 {
		return nil, errors.New("invalid order value")
	}
	var wallet model.Wallet
	if db := database.GetDB(); db != nil {
		if err := db.Where("user_uuid = ?", id).First(&wallet).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}
	var position model.Position
	if db := database.GetDB(); db != nil {
		if err := db.Where("user_uuid = ? AND symbol = ? AND product = ?", id, order.Symbol, order.Product).First(&position).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
	}
	required := int64(0)
	if order.Product == model.OrderProductDelivery {
		if order.Side == model.OrderSideBuy {
			required = total
		} else if position.Quantity < order.Quantity {
			return nil, errors.New("insufficient delivery position quantity")
		}
	} else {
		kind := ""
		if order.Product == model.OrderProductFNO {
			var inst *model.Instrument
			if s.instrumentFinder != nil {
				inst, _ = s.instrumentFinder(order.Symbol)
			}
			if inst == nil && s.repo != nil {
				inst, _ = s.repo.FindInstrument(order.Symbol)
			}
			if inst == nil {
				synth, synthErr := product.ParseSyntheticFNOContract(order.Symbol)
				if synthErr == nil && synth != nil {
					inst = synth
				}
			}
			if inst == nil {
				return nil, fmt.Errorf("instrument %q not found", order.Symbol)
			}
			if inst.SnapshotVersion != "" {
				if (!inst.IsTradable || !inst.Active) && order.ExitPositionUUID == nil {
					return nil, fmt.Errorf("instrument %q is not tradable (benchmark index or unsupported segment)", order.Symbol)
				}
			} else {
				seg := strings.ToUpper(strings.TrimSpace(inst.ExchangeSegment))
				if (seg == "BSE" || seg == "BFO" || strings.ToUpper(strings.TrimSpace(inst.InstrumentType)) == "INDEX") && !inst.IsTradable && order.ExitPositionUUID == nil {
					return nil, fmt.Errorf("instrument %q is not tradable (benchmark index or unsupported segment)", order.Symbol)
				}
			}
			kind, err = product.ValidateFNOInstrument(*inst, order.Quantity)
			if err != nil {
				return nil, err
			}
		}
		if order.Type != model.OrderTypeMarket {
			required, err = s.rules.Margin(order.Product, kind, order.Side, total)
			if err != nil {
				return nil, err
			}
		} else {
			transition, err := calculatePositionTransition(position.Quantity, position.AveragePricePaise, order.Quantity, price, order.Side)
			if err != nil {
				return nil, err
			}
			margin, err := s.marginForPosition(order.Product, kind, transition.NewQuantity, transition.NewAveragePrice)
			if err != nil {
				return nil, err
			}
			delta, ok := subtract(margin, position.MarginBlockedPaise)
			if !ok {
				return nil, fmt.Errorf("margin overflow")
			}
			cash := transition.RealizedPnlPaise
			if kind == product.InstrumentOption {
				cash = total
				if order.Side == model.OrderSideBuy {
					cash = -total
					required = total
				}
			}
			afterCash, ok := subtract(delta, cash)
			if !ok {
				return nil, fmt.Errorf("funds overflow")
			}
			required = max(required, delta, afterCash, 0)
		}
	}
	disclosure := ""
	if order.Product == model.OrderProductFNO {
		disclosure = product.MarginDisclosure
	}
	return &OrderPreview{
		QuoteSource:           quoteSource,
		QuoteUpdatedAt:        quoteUpdatedAt,
		RequiredFundsPaise:    required,
		AvailableBalancePaise: wallet.AvailableBalancePaise(),
		EstimatedPricePaise:   price,
		SufficientFunds:       wallet.AvailableBalancePaise() >= required,
		MarginDisclosure:      disclosure,
	}, nil
}
