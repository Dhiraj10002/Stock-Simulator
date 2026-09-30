package service

import (
	"errors"
	"fmt"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
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
}

// Preview validates using Create's existing dry-run hook. Projection uses the
// same transition and margin functions as execution; submission revalidates it.
func (s *OrderService) Preview(user string, request dto.CreateOrderRequest) (*OrderPreview, error) {
	var order model.Order
	previewNow := s.now
	if err := calendar.ValidateNewOrderSession(s.now()); err != nil {
		n := s.now()
		previewNow = func() time.Time {
			return time.Date(n.Year(), n.Month(), n.Day(), 11, 0, 0, 0, calendar.Location())
		}
	}
	probe := &OrderService{repo: s.repo, market: s.market, rules: s.rules, nowFunc: previewNow, executableQuoteFunc: s.executableQuoteFunc, instrumentFinder: s.instrumentFinder, createOrderFunc: func(o *model.Order) error { order = *o; return nil }}
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
		quote, err := s.executableQuote(order.Symbol)
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
			inst, err := s.repo.FindInstrument(order.Symbol)
			if err != nil {
				return nil, err
			}
			if inst == nil {
				return nil, errors.New("instrument not found")
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
	return &OrderPreview{QuoteSource: quoteSource, QuoteUpdatedAt: quoteUpdatedAt, RequiredFundsPaise: required, AvailableBalancePaise: wallet.AvailableBalancePaise(), EstimatedPricePaise: price, SufficientFunds: wallet.AvailableBalancePaise() >= required}, nil
}
