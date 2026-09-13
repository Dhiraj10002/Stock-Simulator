package service

import (
	"fmt"
	"strings"

	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
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
	if request.Type == model.OrderTypeLimit && request.PricePaise <= 0 {
		return nil, fmt.Errorf("limit orders require a positive price")
	}
	if request.Type == model.OrderTypeMarket && request.PricePaise != 0 {
		return nil, fmt.Errorf("market orders must not include a price")
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
	return toResponse(order), nil
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
