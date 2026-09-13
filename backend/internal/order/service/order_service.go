package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/repository"
	"github.com/google/uuid"
)

type OrderService struct {
	repo   *repository.OrderRepository
	market *marketService.Service
}

func New(market *marketService.Service) *OrderService {
	return &OrderService{repo: repository.New(), market: market}
}

func (s *OrderService) Create(userID string, request dto.CreateOrderRequest) (*dto.OrderResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user identity")
	}
	request.Symbol = strings.ToUpper(strings.TrimSpace(request.Symbol))
	if request.Symbol == "" {
		return nil, fmt.Errorf("symbol is required")
	}
	if request.Product != model.OrderProductDelivery {
		return nil, fmt.Errorf("%s orders are not available yet; only DELIVERY orders are supported", request.Product)
	}
	if request.Type == model.OrderTypeLimit && request.PricePaise <= 0 {
		return nil, fmt.Errorf("limit orders require a positive price")
	}
	if request.Type == model.OrderTypeMarket && request.PricePaise != 0 {
		return nil, fmt.Errorf("market orders must not include a price")
	}
	if request.Type == model.OrderTypeMarket {
		// Reject before persisting when there is no safe executable price. This
		// prevents a market order becoming an unfillable pending order.
		if _, err := s.market.ExecutableQuote(request.Symbol); err != nil {
			return nil, err
		}
	}

	order := &model.Order{UserUUID: userUUID, Symbol: request.Symbol, Side: request.Side, Type: request.Type, Product: request.Product, Quantity: request.Quantity, PricePaise: request.PricePaise, Status: model.OrderStatusPending}
	reservation := int64(0)
	if request.Side == model.OrderSideBuy && request.Type == model.OrderTypeLimit {
		if request.Quantity > 0 && request.PricePaise > 0 && request.Quantity > int64(^uint64(0)>>1)/request.PricePaise {
			return nil, fmt.Errorf("order value is too large")
		}
		reservation = request.Quantity * request.PricePaise
	}
	if reservation > 0 {
		if err := s.repo.CreateWithReservation(order, reservation); err != nil {
			return nil, fmt.Errorf("insufficient available wallet balance")
		}
	} else if err := s.repo.Create(order); err != nil {
		return nil, err
	}

	if order.Type == model.OrderTypeMarket {
		if err := s.Execute(userID, order.UUID.String()); err != nil {
			if rejectErr := s.repo.Reject(userUUID, order.UUID); rejectErr != nil {
				return nil, fmt.Errorf("market order execution failed: %w (could not mark rejected: %v)", err, rejectErr)
			}
			return nil, err
		}
		return s.Get(userID, order.UUID.String())
	}

	// A limit may already be marketable at creation. Matching it here avoids
	// waiting for the next tick while retaining its original limit price.
	if err := s.MatchSymbol(request.Symbol); err != nil {
		return nil, err
	}
	return s.Get(userID, order.UUID.String())
}

func isSupportedProduct(product string) bool {
	return product == model.OrderProductDelivery
}

// RunMatcher consumes quote notifications for the process lifetime. Limit
// prices are never overwritten: Execute compares the fresh quote with the
// stored PricePaise before settling.
func (s *OrderService) RunMatcher(ctx context.Context) {
	subscription := s.market.SubscribeQuotes(ctx)
	defer subscription.Close()
	for message := range subscription.Channel() {
		var quote marketDTO.QuoteResponse
		if err := json.Unmarshal([]byte(message.Payload), &quote); err != nil || quote.Symbol == "" {
			continue
		}
		// A failed fill (e.g. insufficient funds or a concurrently cancelled
		// order) only affects that order; future quote updates remain usable.
		_ = s.MatchSymbol(quote.Symbol)
	}
}

// MatchSymbol checks all open limit orders against a fresh executable quote.
// It is intentionally idempotent: Execute locks and revalidates every order.
func (s *OrderService) MatchSymbol(symbol string) error {
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	if symbol == "" {
		return nil
	}
	quote, err := s.market.ExecutableQuote(symbol)
	if err != nil {
		return nil // a zero or stale tick must not trigger settlement
	}
	orders, err := s.repo.ListOpenLimitOrders(symbol)
	if err != nil {
		return err
	}
	for _, order := range orders {
		if limitSatisfied(&order, quote.PricePaise) {
			_ = s.Execute(order.UserUUID.String(), order.UUID.String())
		}
	}
	return nil
}

func (s *OrderService) List(userID string) ([]dto.OrderResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user identity")
	}
	orders, err := s.repo.List(userUUID)
	if err != nil {
		return nil, err
	}
	result := make([]dto.OrderResponse, 0, len(orders))
	for _, order := range orders {
		result = append(result, *toResponse(&order))
	}
	return result, nil
}

func (s *OrderService) Get(userID, orderID string) (*dto.OrderResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user identity")
	}
	orderUUID, err := uuid.Parse(orderID)
	if err != nil {
		return nil, fmt.Errorf("invalid order identity")
	}
	order, err := s.repo.FindByUUID(userUUID, orderUUID)
	if err != nil {
		return nil, err
	}
	return toResponse(order), nil
}

func (s *OrderService) Cancel(userID, orderID string) error {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user identity")
	}

	orderUUID, err := uuid.Parse(orderID)
	if err != nil {
		return fmt.Errorf("invalid order identity")
	}

	return s.repo.Cancel(userUUID, orderUUID)
}

func toResponse(order *model.Order) *dto.OrderResponse {
	return &dto.OrderResponse{UUID: order.UUID.String(), Symbol: order.Symbol, Side: order.Side, Type: order.Type, Product: order.Product, Quantity: order.Quantity, PricePaise: order.PricePaise, ExecutedPricePaise: order.ExecutedPricePaise, ReservedPaise: order.ReservedPaise, Status: order.Status}
}
