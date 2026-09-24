package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/repository"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/product"
	"github.com/google/uuid"
)

var (
	// ErrInstrumentNotFound indicates the symbol does not exist in the canonical instrument master.
	ErrInstrumentNotFound = errors.New("instrument not found in canonical instrument master")
)

type OrderService struct {
	repo                *repository.OrderRepository
	market              *marketService.Service
	rules               product.Rules
	nowFunc             func() time.Time
	executableQuoteFunc func(symbol string) (*marketDTO.QuoteResponse, error)
	instrumentFinder    func(symbol string) (*model.Instrument, error)
	createOrderFunc     func(order *model.Order) error
	activeSymbolsMu     sync.RWMutex
	activeSymbols       map[string]int
}

func New(market *marketService.Service, cfg *config.Config) *OrderService {
	svc := &OrderService{
		repo:          repository.New(),
		market:        market,
		rules:         product.FromConfig(cfg),
		activeSymbols: make(map[string]int),
	}
	_ = svc.RebuildActiveSymbolsFromDB()
	return svc
}

func (s *OrderService) SetNowFunc(fn func() time.Time) {
	s.nowFunc = fn
}

func (s *OrderService) SetExecutableQuoteFunc(fn func(symbol string) (*marketDTO.QuoteResponse, error)) {
	s.executableQuoteFunc = fn
}

func (s *OrderService) SetInstrumentFinder(fn func(symbol string) (*model.Instrument, error)) {
	s.instrumentFinder = fn
}

func (s *OrderService) SetCreateOrderFunc(fn func(order *model.Order) error) {
	s.createOrderFunc = fn
}

func (s *OrderService) executableQuote(symbol string) (*marketDTO.QuoteResponse, error) {
	if s.executableQuoteFunc != nil {
		return s.executableQuoteFunc(symbol)
	}
	if s.market != nil {
		return s.market.ExecutableQuote(symbol)
	}
	return nil, fmt.Errorf("market service not configured")
}

func (s *OrderService) currentQuote(symbol string) (*marketDTO.QuoteResponse, error) {
	if s.executableQuoteFunc != nil {
		return s.executableQuoteFunc(symbol)
	}
	if s.market != nil {
		return s.market.CurrentQuote(symbol)
	}
	return nil, fmt.Errorf("market service not configured")
}

func (s *OrderService) now() time.Time {
	if s.nowFunc != nil {
		return s.nowFunc()
	}
	return time.Now()
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
	request.Side = strings.ToUpper(strings.TrimSpace(request.Side))
	if request.Side != model.OrderSideBuy && request.Side != model.OrderSideSell {
		return nil, fmt.Errorf("invalid order side %q; must be BUY or SELL", request.Side)
	}
	request.Type = strings.ToUpper(strings.TrimSpace(request.Type))
	if request.Type != model.OrderTypeMarket && request.Type != model.OrderTypeLimit &&
		request.Type != model.OrderTypeSL && request.Type != model.OrderTypeSLM {
		return nil, fmt.Errorf("invalid order type %q; must be MARKET, LIMIT, SL, or SL-M", request.Type)
	}
	request.Product = strings.ToUpper(strings.TrimSpace(request.Product))
	if !isSupportedProduct(request.Product) {
		return nil, fmt.Errorf("unsupported order product %s", request.Product)
	}
	if request.Quantity <= 0 {
		return nil, fmt.Errorf("order quantity must be greater than zero")
	}
	if (request.Type == model.OrderTypeLimit || request.Type == model.OrderTypeSL) && request.PricePaise <= 0 {
		return nil, fmt.Errorf("limit and stop-loss limit orders require a positive price")
	}
	if request.Type == model.OrderTypeMarket && request.PricePaise != 0 {
		return nil, fmt.Errorf("market orders must not include a price")
	}
	if request.Type == model.OrderTypeSLM && request.PricePaise != 0 {
		return nil, fmt.Errorf("SL-M orders must not include a price")
	}
	if (request.Type == model.OrderTypeSL || request.Type == model.OrderTypeSLM) && request.TriggerPricePaise <= 0 {
		return nil, fmt.Errorf("stop-loss orders require a positive trigger price")
	}

	// Market Session Check: New orders are rejected outside trading hours (09:15-15:30 IST, Mon-Fri).
	// Existing open LIMIT orders remain open across sessions and are not rejected here.
	now := s.now()
	if err := calendar.ValidateNewOrderSession(now); err != nil {
		return nil, err
	}

	var instrument *model.Instrument
	isLiveMode := s.market == nil || s.market.FeedMode() == marketDTO.FeedModeLive
	if s.instrumentFinder != nil {
		found, err := s.instrumentFinder(request.Symbol)
		if err == nil && found != nil {
			instrument = found
		} else {
			if isLiveMode {
				return nil, fmt.Errorf("%w: instrument %q not found in canonical instrument master (real F&O under LIVE mode permits only canonical DB instruments)", ErrInstrumentNotFound, request.Symbol)
			}
			synth, synthErr := product.ParseSyntheticFNOContract(request.Symbol)
			if synthErr == nil && synth != nil {
				instrument = synth
			} else {
				return nil, fmt.Errorf("%w: instrument %q not found in canonical instrument master", ErrInstrumentNotFound, request.Symbol)
			}
		}
	} else if database.GetDB() != nil {
		found, err := s.repo.FindInstrument(request.Symbol)
		if err == nil && found != nil {
			instrument = found
		} else {
			if isLiveMode {
				return nil, fmt.Errorf("%w: instrument %q not found in canonical instrument master (real F&O under LIVE mode permits only canonical DB instruments)", ErrInstrumentNotFound, request.Symbol)
			}
			synth, synthErr := product.ParseSyntheticFNOContract(request.Symbol)
			if synthErr == nil && synth != nil {
				instrument = synth
			} else {
				return nil, fmt.Errorf("%w: instrument %q not found in canonical instrument master", ErrInstrumentNotFound, request.Symbol)
			}
		}
	} else if request.Product == model.OrderProductFNO {
		if isLiveMode {
			return nil, fmt.Errorf("F&O instrument verification requires database connection")
		}
		synth, synthErr := product.ParseSyntheticFNOContract(request.Symbol)
		if synthErr == nil && synth != nil {
			instrument = synth
		} else {
			return nil, fmt.Errorf("F&O instrument verification requires database connection")
		}
	}

	// Stop-Loss Directional Validation against current quote
	if request.Type == model.OrderTypeSL || request.Type == model.OrderTypeSLM {
		curQuote, qErr := s.currentQuote(request.Symbol)
		if qErr == nil && curQuote != nil && curQuote.PricePaise > 0 {
			if request.Side == model.OrderSideBuy && request.TriggerPricePaise < curQuote.PricePaise {
				return nil, fmt.Errorf("BUY stop-loss trigger price (%d) must be >= current market price (%d)", request.TriggerPricePaise, curQuote.PricePaise)
			}
			if request.Side == model.OrderSideSell && request.TriggerPricePaise > curQuote.PricePaise {
				return nil, fmt.Errorf("SELL stop-loss trigger price (%d) must be <= current market price (%d)", request.TriggerPricePaise, curQuote.PricePaise)
			}
		}
	}

	// Circuit Breaker Validation against Daily Price Bands (±10% equity, ±20% F&O)
	if (request.Type == model.OrderTypeLimit || request.Type == model.OrderTypeSL) && request.PricePaise > 0 {
		curQuote, qErr := s.currentQuote(request.Symbol)
		if qErr == nil && curQuote != nil && curQuote.PricePaise > 0 {
			refPrice := curQuote.PricePaise
			lc, uc := calculateCircuitLimits(refPrice, request.Product)
			if request.PricePaise > uc {
				return nil, fmt.Errorf("limit price ₹%.2f exceeds daily upper circuit limit of ₹%.2f", float64(request.PricePaise)/100, float64(uc)/100)
			}
			if request.PricePaise < lc {
				return nil, fmt.Errorf("limit price ₹%.2f falls below daily lower circuit limit of ₹%.2f", float64(request.PricePaise)/100, float64(lc)/100)
			}
		}
	}

	// Tick Size Validation for non-market orders
	tickSizeStr := "0.05"
	if instrument != nil && instrument.TickSize != "" {
		tickSizeStr = instrument.TickSize
	}
	if (request.Type == model.OrderTypeLimit || request.Type == model.OrderTypeSL) && request.PricePaise > 0 {
		if err := product.ValidateTickSize(request.PricePaise, tickSizeStr); err != nil {
			return nil, fmt.Errorf("order price invalid: %w", err)
		}
	}
	if (request.Type == model.OrderTypeSL || request.Type == model.OrderTypeSLM) && request.TriggerPricePaise > 0 {
		if err := product.ValidateTickSize(request.TriggerPricePaise, tickSizeStr); err != nil {
			return nil, fmt.Errorf("trigger price invalid: %w", err)
		}
	}

	if request.Product == model.OrderProductIntraday {
		if err := product.ValidateMISOrder(now); err != nil {
			return nil, err
		}
	}
	if request.Product == model.OrderProductFNO {
		if instrument != nil {
			if _, err := product.ValidateFNOInstrument(*instrument, request.Quantity); err != nil {
				return nil, err
			}
			if isExpired(instrument.Expiry, now) {
				return nil, fmt.Errorf("cannot place order on expired contract %s (expiry: %s)", request.Symbol, instrument.Expiry)
			}
		}
	}

	if request.Type == model.OrderTypeMarket {
		// Reject before persisting when there is no safe executable price. This
		// prevents a market order becoming an unfillable pending order.
		if _, err := s.executableQuote(request.Symbol); err != nil {
			return nil, err
		}
	}

	initialStatus := model.OrderStatusPending
	if request.Type == model.OrderTypeSL || request.Type == model.OrderTypeSLM {
		initialStatus = model.OrderStatusTriggerPending
	}

	order := &model.Order{
		UserUUID:          userUUID,
		Symbol:            request.Symbol,
		Side:              request.Side,
		Type:              request.Type,
		Product:           request.Product,
		Quantity:          request.Quantity,
		PricePaise:        request.PricePaise,
		TriggerPricePaise: request.TriggerPricePaise,
		Status:            initialStatus,
	}

	basePrice := request.PricePaise
	if request.Type == model.OrderTypeSLM {
		basePrice = request.TriggerPricePaise
	}

	reservation := int64(0)
	if request.Product == model.OrderProductDelivery && request.Side == model.OrderSideBuy && request.Type != model.OrderTypeMarket {
		if request.Quantity > 0 && basePathPrice(basePrice) > 0 && request.Quantity > int64(^uint64(0)>>1)/basePrice {
			return nil, fmt.Errorf("order value is too large")
		}
		reservation = request.Quantity * basePathPrice(basePrice)
	}
	if request.Product != model.OrderProductDelivery && request.Type != model.OrderTypeMarket {
		notional, ok := multiply(request.Quantity, basePathPrice(basePrice))
		if !ok {
			return nil, fmt.Errorf("order value is too large")
		}
		instrumentType := ""
		if instrument != nil {
			instrumentType, _ = product.ValidateFNOInstrument(*instrument, request.Quantity)
		}
		reservation, err = s.rules.Margin(request.Product, instrumentType, request.Side, notional)
		if err != nil {
			return nil, err
		}
	}

	if s.createOrderFunc != nil {
		if err := s.createOrderFunc(order); err != nil {
			return nil, err
		}
		return toResponse(order), nil
	}

	if reservation > 0 {
		if err := s.repo.CreateWithReservation(order, reservation); err != nil {
			return nil, fmt.Errorf("insufficient available wallet balance")
		}
	} else if request.Product == model.OrderProductDelivery && request.Side == model.OrderSideSell {
		if err := s.repo.CreateDeliverySell(order); err != nil {
			return nil, err
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

	// A limit or stop order may already be marketable/triggered at creation.
	if order.Type != model.OrderTypeMarket {
		s.RegisterActiveSymbol(order.Symbol)
	}
	if err := s.MatchSymbol(request.Symbol); err != nil {
		return nil, err
	}
	return s.Get(userID, order.UUID.String())
}

func (s *OrderService) RegisterActiveSymbol(symbol string) {
	sym := strings.ToUpper(strings.TrimSpace(symbol))
	if sym == "" {
		return
	}
	s.activeSymbolsMu.Lock()
	defer s.activeSymbolsMu.Unlock()
	if s.activeSymbols == nil {
		s.activeSymbols = make(map[string]int)
	}
	s.activeSymbols[sym]++
}

func (s *OrderService) UnregisterActiveSymbol(symbol string) {
	sym := strings.ToUpper(strings.TrimSpace(symbol))
	if sym == "" {
		return
	}
	s.activeSymbolsMu.Lock()
	defer s.activeSymbolsMu.Unlock()
	if s.activeSymbols == nil {
		return
	}
	delete(s.activeSymbols, sym)
}

func (s *OrderService) HasActiveOrders(symbol string) bool {
	sym := strings.ToUpper(strings.TrimSpace(symbol))
	if sym == "" {
		return false
	}
	s.activeSymbolsMu.RLock()
	defer s.activeSymbolsMu.RUnlock()
	if s.activeSymbols == nil {
		return false
	}
	return s.activeSymbols[sym] > 0
}

func (s *OrderService) RebuildActiveSymbolsFromDB() error {
	db := database.GetDB()
	if db == nil {
		return nil
	}
	var symbols []string
	err := db.Model(&model.Order{}).
		Where("status IN ?", []string{
			model.OrderStatusPending,
			model.OrderStatusOpen,
			model.OrderStatusTriggerPending,
		}).
		Pluck("DISTINCT symbol", &symbols).Error
	if err != nil {
		return err
	}

	s.activeSymbolsMu.Lock()
	defer s.activeSymbolsMu.Unlock()
	s.activeSymbols = make(map[string]int)
	for _, sym := range symbols {
		cleaned := strings.ToUpper(strings.TrimSpace(sym))
		if cleaned != "" {
			s.activeSymbols[cleaned] = 1
		}
	}
	return nil
}

func basePathPrice(price int64) int64 {
	if price <= 0 {
		return 100
	}
	return price
}

func isSupportedProduct(product string) bool {
	return product == model.OrderProductDelivery || product == model.OrderProductIntraday || product == model.OrderProductFNO
}

func calculateCircuitLimits(refPricePaise int64, product string) (lowerCircuit int64, upperCircuit int64) {
	pct := int64(10)
	if product == model.OrderProductFNO {
		pct = 20
	}
	band := (refPricePaise * pct) / 100
	lowerCircuit = refPricePaise - band
	if lowerCircuit < 5 {
		lowerCircuit = 5
	}
	upperCircuit = refPricePaise + band
	return lowerCircuit, upperCircuit
}

// RunMatcher consumes quote notifications for the process lifetime. Limit
// prices are never overwritten: Execute compares the fresh quote with the
// stored PricePaise before settling.
func (s *OrderService) RunMatcher(ctx context.Context) {
	_ = s.RebuildActiveSymbolsFromDB()
	for {
		if ctx.Err() != nil {
			return
		}
		subscription := s.market.SubscribeQuotes(ctx)
		channel := subscription.Channel()
		for {
			select {
			case <-ctx.Done():
				_ = subscription.Close()
				return
			case message, open := <-channel:
				if !open {
					_ = subscription.Close()
					goto reconnect
				}
				var quote marketDTO.QuoteResponse
				if err := json.Unmarshal([]byte(message.Payload), &quote); err != nil || quote.Symbol == "" {
					continue
				}
				// A failed fill (e.g. insufficient funds or a concurrently cancelled
				// order) only affects that order; future quote updates remain usable.
				_ = s.MatchSymbol(quote.Symbol)
			}
		}

	reconnect:
		// Redis reconnects internally in the normal case; this handles a fully
		// closed subscription without leaving limit orders permanently idle.
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Second):
		}
	}
}

// MatchSymbol checks all active orders (OPEN, PENDING, TRIGGER_PENDING) against a fresh executable quote.
// It is intentionally idempotent: Execute locks and revalidates every order.
func (s *OrderService) MatchSymbol(symbol string) error {
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	if symbol == "" {
		return nil
	}
	if !s.HasActiveOrders(symbol) {
		return nil
	}
	quote, err := s.executableQuote(symbol)
	if err != nil {
		return nil // a zero or stale tick must not trigger settlement
	}
	orders, err := s.repo.ListActiveOrders(symbol)
	if err != nil {
		return err
	}
	if len(orders) == 0 {
		s.UnregisterActiveSymbol(symbol)
		return nil
	}
	for _, order := range orders {
		if order.Status == model.OrderStatusTriggerPending {
			isTriggered := false
			if order.Side == model.OrderSideBuy && quote.PricePaise >= order.TriggerPricePaise {
				isTriggered = true
			} else if order.Side == model.OrderSideSell && quote.PricePaise <= order.TriggerPricePaise {
				isTriggered = true
			}

			if isTriggered {
				if order.Type == model.OrderTypeSLM {
					// SL-M: Triggers immediately into market execution
					_ = s.repo.TriggerOrder(order.UUID, model.OrderStatusOpen)
					_ = s.Execute(order.UserUUID.String(), order.UUID.String())
				} else if order.Type == model.OrderTypeSL {
					// SL: Becomes an OPEN limit order
					_ = s.repo.TriggerOrder(order.UUID, model.OrderStatusOpen)
					order.Status = model.OrderStatusOpen
					if limitSatisfied(&order, quote.PricePaise) {
						_ = s.Execute(order.UserUUID.String(), order.UUID.String())
					}
				}
			}
		} else if order.Status == model.OrderStatusOpen || order.Status == model.OrderStatusPending {
			if limitSatisfied(&order, quote.PricePaise) {
				_ = s.Execute(order.UserUUID.String(), order.UUID.String())
			}
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

func (s *OrderService) ClearHistory(userID string) (int64, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return 0, fmt.Errorf("invalid user identity")
	}
	return s.repo.ClearHistory(userUUID)
}

func toResponse(order *model.Order) *dto.OrderResponse {
	return &dto.OrderResponse{
		UUID:               order.UUID.String(),
		Symbol:             order.Symbol,
		Side:               order.Side,
		Type:               order.Type,
		Product:            order.Product,
		Quantity:           order.Quantity,
		PricePaise:         order.PricePaise,
		TriggerPricePaise:  order.TriggerPricePaise,
		ExecutedPricePaise: order.ExecutedPricePaise,
		ReservedPaise:      order.ReservedPaise,
		Status:             order.Status,
		CreatedAt:          order.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:          order.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z07:00"),
	}
}
