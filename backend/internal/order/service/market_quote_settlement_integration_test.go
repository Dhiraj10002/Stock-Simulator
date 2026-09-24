package service

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/cache"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

func getTestRedis(t *testing.T) (*marketService.Service, *redis.Client) {
	redisURL := os.Getenv("TEST_REDIS_URL")
	if redisURL == "" {
		redisURL = os.Getenv("REDIS_URL")
	}
	if redisURL == "" {
		redisURL = "redis://localhost:6379/0"
	}
	rClient, err := cache.NewRedisClient(redisURL, 2*time.Second)
	if err != nil {
		t.Skipf("Redis client creation failed for %s: %v", redisURL, err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := rClient.Ping(ctx).Err(); err != nil {
		t.Skipf("Redis ping failed at %s: %v", redisURL, err)
	}

	marketSvc, err := marketService.New(redisURL, 2*time.Second)
	if err != nil {
		t.Fatalf("failed to create market service: %v", err)
	}
	marketSvc.SetWorkerURL("disabled") // isolate from external HTTP worker during quote assertions
	return marketSvc, rClient
}

func ensureTestInstrument(t *testing.T, db *gorm.DB, symbol string) {
	var inst model.Instrument
	if err := db.Where("symbol = ?", symbol).First(&inst).Error; err != nil {
		err = db.Create(&model.Instrument{
			Token:           "TEST_" + symbol,
			Symbol:          symbol,
			Name:            symbol + " LTD",
			ExchangeSegment: "NSE",
			InstrumentType:  "EQUITY",
			LotSize:         1,
			TickSize:        "0.05",
		}).Error
		if err != nil {
			t.Fatalf("failed to seed test instrument %s: %v", symbol, err)
		}
	}
}

func setRedisQuote(ctx context.Context, client *redis.Client, symbol string, pricePaise int64, source string, updatedAt string) error {
	quoteKey := "market:quote:" + symbol
	return client.HSet(ctx, quoteKey, map[string]interface{}{
		"price_paise":    fmt.Sprintf("%d", pricePaise),
		"source":         source,
		"updated_at":     updatedAt,
		"change_paise":   "0",
		"change_percent": "0.00",
	}).Err()
}

func deleteRedisQuote(ctx context.Context, client *redis.Client, symbol string) {
	_ = client.Del(ctx, "market:quote:"+symbol).Err()
}

// TestIntegration_RedisToOrderSettlement_AuthoritativeLiveQuote proves that a valid
// quote in Redis is read by market.Service and successfully settles an order in PostgreSQL,
// mutating the wallet balance, updating the user position, and creating a trade.
func TestIntegration_RedisToOrderSettlement_AuthoritativeLiveQuote(t *testing.T) {
	db := getTestDB(t)
	marketSvc, rClient := getTestRedis(t)

	ctx := context.Background()
	symbol := "RELIANCE"
	ensureTestInstrument(t, db, symbol)

	marketSvc.SetInstrumentFinder(func(s string) (bool, error) {
		return s == symbol, nil
	})
	marketSvc.SetFeedMode(marketDTO.FeedModeLive)

	// Set authoritative live quote in Redis
	now := time.Now().UTC()
	nowStr := now.Format(time.RFC3339)
	quotePricePaise := int64(250000) // ₹2500.00
	if err := setRedisQuote(ctx, rClient, symbol, quotePricePaise, "angelone_live", nowStr); err != nil {
		t.Fatalf("failed to set redis quote: %v", err)
	}
	defer deleteRedisQuote(ctx, rClient, symbol)

	userUUID := uuid.New()
	walletUUID := uuid.New()
	orderUUID := uuid.New()

	defer func() {
		db.Where("user_uuid = ?", userUUID).Delete(&model.Trade{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Order{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Position{})
		db.Where("wallet_uuid = ?", walletUUID).Delete(&model.WalletTransaction{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Wallet{})
	}()

	// Initial balance: 1,000,000 paise (₹10,000)
	initialBalance := int64(1000000)
	orderQty := int64(2)
	limitPrice := int64(255000) // limit satisfies 250000
	reservedAmount := orderQty * limitPrice

	wallet := model.Wallet{
		UUID:             walletUUID,
		UserUUID:         userUUID,
		CashBalancePaise: initialBalance,
		BlockedPaise:     reservedAmount,
	}
	if err := db.Create(&wallet).Error; err != nil {
		t.Fatalf("create wallet: %v", err)
	}

	order := model.Order{
		UUID:          orderUUID,
		UserUUID:      userUUID,
		Symbol:        symbol,
		Side:          model.OrderSideBuy,
		Type:          model.OrderTypeLimit,
		Product:       model.OrderProductDelivery,
		Quantity:      orderQty,
		PricePaise:    limitPrice,
		Status:        model.OrderStatusPending,
		ReservedPaise: reservedAmount,
	}
	if err := db.Create(&order).Error; err != nil {
		t.Fatalf("create order: %v", err)
	}

	cfg := &config.Config{
		MISLeverage:             5,
		FuturesMarginPercent:    20,
		OptionSellMarginPercent: 20,
	}
	orderSvc := New(marketSvc, cfg)
	orderSvc.SetNowFunc(func() time.Time { return now })

	// Execute order against market quote in Redis
	err := orderSvc.Execute(userUUID.String(), orderUUID.String())
	if err != nil {
		t.Fatalf("expected order execution to succeed, got error: %v", err)
	}

	// 1. Verify wallet balance was debited by exact execution amount (2 * 250000 = 500000)
	expectedTotalCost := orderQty * quotePricePaise
	var updatedWallet model.Wallet
	if err := db.Where("user_uuid = ?", userUUID).First(&updatedWallet).Error; err != nil {
		t.Fatalf("failed to reload wallet: %v", err)
	}
	if updatedWallet.CashBalancePaise != initialBalance-expectedTotalCost {
		t.Fatalf("expected wallet cash balance %d, got %d", initialBalance-expectedTotalCost, updatedWallet.CashBalancePaise)
	}
	if updatedWallet.BlockedPaise != 0 {
		t.Fatalf("expected blocked paise 0, got %d", updatedWallet.BlockedPaise)
	}

	// 2. Verify position was created with exact quantity and price
	var position model.Position
	if err := db.Where("user_uuid = ? AND symbol = ?", userUUID, symbol).First(&position).Error; err != nil {
		t.Fatalf("failed to find position: %v", err)
	}
	if position.Quantity != orderQty {
		t.Fatalf("expected position quantity %d, got %d", orderQty, position.Quantity)
	}
	if position.AveragePricePaise != quotePricePaise {
		t.Fatalf("expected position avg price %d, got %d", quotePricePaise, position.AveragePricePaise)
	}

	// 3. Verify trade was recorded
	var trade model.Trade
	if err := db.Where("user_uuid = ? AND order_uuid = ?", userUUID, orderUUID).First(&trade).Error; err != nil {
		t.Fatalf("failed to find trade: %v", err)
	}
	if trade.PricePaise != quotePricePaise || trade.Quantity != orderQty {
		t.Fatalf("unexpected trade values: price=%d, qty=%d", trade.PricePaise, trade.Quantity)
	}

	// 4. Verify order status is EXECUTED
	var updatedOrder model.Order
	if err := db.Where("uuid = ?", orderUUID).First(&updatedOrder).Error; err != nil {
		t.Fatalf("failed to reload order: %v", err)
	}
	if updatedOrder.Status != model.OrderStatusExecuted {
		t.Fatalf("expected order status %s, got %s", model.OrderStatusExecuted, updatedOrder.Status)
	}
}

// TestIntegration_RedisToOrderSettlement_MissingQuoteZeroMutation proves that when
// the Redis quote is missing, order execution fails immediately and zero mutations occur.
func TestIntegration_RedisToOrderSettlement_MissingQuoteZeroMutation(t *testing.T) {
	db := getTestDB(t)
	marketSvc, rClient := getTestRedis(t)

	ctx := context.Background()
	symbol := "TATAMOTORS"
	ensureTestInstrument(t, db, symbol)
	deleteRedisQuote(ctx, rClient, symbol)

	marketSvc.SetInstrumentFinder(func(s string) (bool, error) {
		return s == symbol, nil
	})
	marketSvc.SetFeedMode(marketDTO.FeedModeLive)

	userUUID := uuid.New()
	walletUUID := uuid.New()
	orderUUID := uuid.New()

	defer func() {
		db.Where("user_uuid = ?", userUUID).Delete(&model.Trade{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Order{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Position{})
		db.Where("wallet_uuid = ?", walletUUID).Delete(&model.WalletTransaction{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Wallet{})
	}()

	initialBalance := int64(1000000)
	wallet := model.Wallet{
		UUID:             walletUUID,
		UserUUID:         userUUID,
		CashBalancePaise: initialBalance,
		BlockedPaise:     0,
	}
	if err := db.Create(&wallet).Error; err != nil {
		t.Fatalf("create wallet: %v", err)
	}

	order := model.Order{
		UUID:          orderUUID,
		UserUUID:      userUUID,
		Symbol:        symbol,
		Side:          model.OrderSideBuy,
		Type:          model.OrderTypeMarket,
		Product:       model.OrderProductDelivery,
		Quantity:      10,
		Status:        model.OrderStatusPending,
		ReservedPaise: 0,
	}
	if err := db.Create(&order).Error; err != nil {
		t.Fatalf("create order: %v", err)
	}

	cfg := &config.Config{MISLeverage: 5}
	orderSvc := New(marketSvc, cfg)

	err := orderSvc.Execute(userUUID.String(), orderUUID.String())
	if err == nil {
		t.Fatal("expected error executing order with missing quote, got nil")
	}
	if !errors.Is(err, marketService.ErrQuoteNotFound) {
		t.Fatalf("expected ErrQuoteNotFound, got: %v", err)
	}

	// Zero Mutation Assertions
	var checkWallet model.Wallet
	_ = db.Where("user_uuid = ?", userUUID).First(&checkWallet)
	if checkWallet.CashBalancePaise != initialBalance || checkWallet.BlockedPaise != 0 {
		t.Fatalf("SAFETY VIOLATION: wallet mutated! cash=%d, blocked=%d", checkWallet.CashBalancePaise, checkWallet.BlockedPaise)
	}

	var posCount int64
	db.Model(&model.Position{}).Where("user_uuid = ?", userUUID).Count(&posCount)
	if posCount != 0 {
		t.Fatalf("SAFETY VIOLATION: position created despite missing quote! count=%d", posCount)
	}

	var tradeCount int64
	db.Model(&model.Trade{}).Where("user_uuid = ?", userUUID).Count(&tradeCount)
	if tradeCount != 0 {
		t.Fatalf("SAFETY VIOLATION: trade created despite missing quote! count=%d", tradeCount)
	}

	var checkOrder model.Order
	_ = db.Where("uuid = ?", orderUUID).First(&checkOrder)
	if checkOrder.Status != model.OrderStatusPending {
		t.Fatalf("expected order status to remain PENDING, got %s", checkOrder.Status)
	}
}

// TestIntegration_RedisToOrderSettlement_StaleQuoteZeroMutation proves that when
// the Redis quote timestamp exceeds 2 minutes, order execution is aborted with zero mutations.
func TestIntegration_RedisToOrderSettlement_StaleQuoteZeroMutation(t *testing.T) {
	db := getTestDB(t)
	marketSvc, rClient := getTestRedis(t)

	ctx := context.Background()
	symbol := "INFY"
	ensureTestInstrument(t, db, symbol)

	marketSvc.SetInstrumentFinder(func(s string) (bool, error) {
		return s == symbol, nil
	})
	marketSvc.SetFeedMode(marketDTO.FeedModeLive)

	// Quote timestamped 5 minutes in the past
	staleTime := time.Now().Add(-5 * time.Minute).UTC().Format(time.RFC3339)
	if err := setRedisQuote(ctx, rClient, symbol, 150000, "angelone_live", staleTime); err != nil {
		t.Fatalf("failed to set redis quote: %v", err)
	}
	defer deleteRedisQuote(ctx, rClient, symbol)

	userUUID := uuid.New()
	walletUUID := uuid.New()
	orderUUID := uuid.New()

	defer func() {
		db.Where("user_uuid = ?", userUUID).Delete(&model.Trade{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Order{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Position{})
		db.Where("wallet_uuid = ?", walletUUID).Delete(&model.WalletTransaction{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Wallet{})
	}()

	initialBalance := int64(1000000)
	wallet := model.Wallet{
		UUID:             walletUUID,
		UserUUID:         userUUID,
		CashBalancePaise: initialBalance,
	}
	if err := db.Create(&wallet).Error; err != nil {
		t.Fatalf("create wallet: %v", err)
	}

	order := model.Order{
		UUID:     orderUUID,
		UserUUID: userUUID,
		Symbol:   symbol,
		Side:     model.OrderSideBuy,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductDelivery,
		Quantity: 5,
		Status:   model.OrderStatusPending,
	}
	if err := db.Create(&order).Error; err != nil {
		t.Fatalf("create order: %v", err)
	}

	cfg := &config.Config{MISLeverage: 5}
	orderSvc := New(marketSvc, cfg)

	err := orderSvc.Execute(userUUID.String(), orderUUID.String())
	if err == nil {
		t.Fatal("expected error executing order with stale quote, got nil")
	}
	if !errors.Is(err, marketService.ErrQuoteStale) {
		t.Fatalf("expected ErrQuoteStale, got: %v", err)
	}

	// Zero Mutation Assertions
	var checkWallet model.Wallet
	_ = db.Where("user_uuid = ?", userUUID).First(&checkWallet)
	if checkWallet.CashBalancePaise != initialBalance {
		t.Fatalf("SAFETY VIOLATION: wallet mutated! cash=%d", checkWallet.CashBalancePaise)
	}

	var posCount int64
	db.Model(&model.Position{}).Where("user_uuid = ?", userUUID).Count(&posCount)
	if posCount != 0 {
		t.Fatalf("SAFETY VIOLATION: position created on stale quote! count=%d", posCount)
	}

	var tradeCount int64
	db.Model(&model.Trade{}).Where("user_uuid = ?", userUUID).Count(&tradeCount)
	if tradeCount != 0 {
		t.Fatalf("SAFETY VIOLATION: trade created on stale quote! count=%d", tradeCount)
	}
}

// TestIntegration_RedisToOrderSettlement_IneligibleSourceZeroMutation proves that when
// quote source in Redis is not eligible for current FeedMode, execution halts with zero mutations.
func TestIntegration_RedisToOrderSettlement_IneligibleSourceZeroMutation(t *testing.T) {
	db := getTestDB(t)
	marketSvc, rClient := getTestRedis(t)

	ctx := context.Background()
	symbol := "SBIN"
	ensureTestInstrument(t, db, symbol)

	marketSvc.SetInstrumentFinder(func(s string) (bool, error) {
		return s == symbol, nil
	})
	marketSvc.SetFeedMode(marketDTO.FeedModeLive) // LIVE mode requires angelone_live

	// Synthetic quote in Redis during LIVE feed mode
	nowStr := time.Now().UTC().Format(time.RFC3339)
	if err := setRedisQuote(ctx, rClient, symbol, 80000, "synthetic_gbm", nowStr); err != nil {
		t.Fatalf("failed to set redis quote: %v", err)
	}
	defer deleteRedisQuote(ctx, rClient, symbol)

	userUUID := uuid.New()
	walletUUID := uuid.New()
	orderUUID := uuid.New()

	defer func() {
		db.Where("user_uuid = ?", userUUID).Delete(&model.Trade{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Order{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Position{})
		db.Where("wallet_uuid = ?", walletUUID).Delete(&model.WalletTransaction{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Wallet{})
	}()

	initialBalance := int64(1000000)
	wallet := model.Wallet{
		UUID:             walletUUID,
		UserUUID:         userUUID,
		CashBalancePaise: initialBalance,
	}
	if err := db.Create(&wallet).Error; err != nil {
		t.Fatalf("create wallet: %v", err)
	}

	order := model.Order{
		UUID:     orderUUID,
		UserUUID: userUUID,
		Symbol:   symbol,
		Side:     model.OrderSideBuy,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductDelivery,
		Quantity: 10,
		Status:   model.OrderStatusPending,
	}
	if err := db.Create(&order).Error; err != nil {
		t.Fatalf("create order: %v", err)
	}

	orderSvc := New(marketSvc, &config.Config{MISLeverage: 5})

	err := orderSvc.Execute(userUUID.String(), orderUUID.String())
	if err == nil {
		t.Fatal("expected error executing order with ineligible quote source, got nil")
	}
	if !errors.Is(err, marketService.ErrQuoteIneligible) {
		t.Fatalf("expected ErrQuoteIneligible, got: %v", err)
	}

	// Zero Mutation Assertions
	var checkWallet model.Wallet
	_ = db.Where("user_uuid = ?", userUUID).First(&checkWallet)
	if checkWallet.CashBalancePaise != initialBalance {
		t.Fatalf("SAFETY VIOLATION: wallet mutated! cash=%d", checkWallet.CashBalancePaise)
	}
	var posCount int64
	db.Model(&model.Position{}).Where("user_uuid = ?", userUUID).Count(&posCount)
	if posCount != 0 {
		t.Fatalf("SAFETY VIOLATION: position created on ineligible quote! count=%d", posCount)
	}
}

// TestIntegration_RedisToOrderSettlement_FeedUnavailableZeroMutation proves that when
// FeedMode is UNAVAILABLE, settlement halts with zero mutations.
func TestIntegration_RedisToOrderSettlement_FeedUnavailableZeroMutation(t *testing.T) {
	db := getTestDB(t)
	marketSvc, rClient := getTestRedis(t)

	ctx := context.Background()
	symbol := "HDFCBANK"
	ensureTestInstrument(t, db, symbol)

	marketSvc.SetInstrumentFinder(func(s string) (bool, error) {
		return s == symbol, nil
	})
	marketSvc.SetFeedMode(marketDTO.FeedModeUnavailable)

	nowStr := time.Now().UTC().Format(time.RFC3339)
	if err := setRedisQuote(ctx, rClient, symbol, 150000, "angelone_live", nowStr); err != nil {
		t.Fatalf("failed to set redis quote: %v", err)
	}
	defer deleteRedisQuote(ctx, rClient, symbol)

	userUUID := uuid.New()
	walletUUID := uuid.New()
	orderUUID := uuid.New()

	defer func() {
		db.Where("user_uuid = ?", userUUID).Delete(&model.Trade{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Order{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Position{})
		db.Where("wallet_uuid = ?", walletUUID).Delete(&model.WalletTransaction{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Wallet{})
	}()

	initialBalance := int64(1000000)
	wallet := model.Wallet{
		UUID:             walletUUID,
		UserUUID:         userUUID,
		CashBalancePaise: initialBalance,
	}
	if err := db.Create(&wallet).Error; err != nil {
		t.Fatalf("create wallet: %v", err)
	}

	order := model.Order{
		UUID:     orderUUID,
		UserUUID: userUUID,
		Symbol:   symbol,
		Side:     model.OrderSideBuy,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductDelivery,
		Quantity: 10,
		Status:   model.OrderStatusPending,
	}
	if err := db.Create(&order).Error; err != nil {
		t.Fatalf("create order: %v", err)
	}

	orderSvc := New(marketSvc, &config.Config{MISLeverage: 5})

	err := orderSvc.Execute(userUUID.String(), orderUUID.String())
	if err == nil {
		t.Fatal("expected error executing order when feed is unavailable, got nil")
	}
	if !errors.Is(err, marketService.ErrQuoteUnavailable) {
		t.Fatalf("expected ErrQuoteUnavailable, got: %v", err)
	}

	// Zero Mutation Assertions
	var checkWallet model.Wallet
	_ = db.Where("user_uuid = ?", userUUID).First(&checkWallet)
	if checkWallet.CashBalancePaise != initialBalance {
		t.Fatalf("SAFETY VIOLATION: wallet mutated! cash=%d", checkWallet.CashBalancePaise)
	}
	var posCount int64
	db.Model(&model.Position{}).Where("user_uuid = ?", userUUID).Count(&posCount)
	if posCount != 0 {
		t.Fatalf("SAFETY VIOLATION: position created when feed unavailable! count=%d", posCount)
	}
}

// TestIntegration_MarketOrderCreation_QuoteSafetyValidation verifies that attempting
// to place a Market order without an executable quote fails at creation time with 0 orders persisted.
func TestIntegration_MarketOrderCreation_QuoteSafetyValidation(t *testing.T) {
	db := getTestDB(t)
	marketSvc, rClient := getTestRedis(t)

	ctx := context.Background()
	symbol := "TCS"
	ensureTestInstrument(t, db, symbol)

	marketSvc.SetInstrumentFinder(func(s string) (bool, error) {
		return s == symbol, nil
	})
	marketSvc.SetFeedMode(marketDTO.FeedModeLive)

	userUUID := uuid.New()
	walletUUID := uuid.New()

	defer func() {
		db.Where("user_uuid = ?", userUUID).Delete(&model.Order{})
		db.Where("wallet_uuid = ?", walletUUID).Delete(&model.WalletTransaction{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Wallet{})
		deleteRedisQuote(ctx, rClient, symbol)
	}()

	wallet := model.Wallet{
		UUID:             walletUUID,
		UserUUID:         userUUID,
		CashBalancePaise: 5000000,
	}
	if err := db.Create(&wallet).Error; err != nil {
		t.Fatalf("create wallet: %v", err)
	}

	orderSvc := New(marketSvc, &config.Config{MISLeverage: 5})
	loc, _ := time.LoadLocation("Asia/Kolkata")
	orderSvc.SetNowFunc(func() time.Time {
		return time.Date(2026, 9, 16, 11, 0, 0, 0, loc)
	})

	marketReq := dto.CreateOrderRequest{
		Symbol:   symbol,
		Side:     model.OrderSideBuy,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductDelivery,
		Quantity: 5,
	}

	// Case 1: Missing Quote in Redis
	deleteRedisQuote(ctx, rClient, symbol)
	_, err := orderSvc.Create(userUUID.String(), marketReq)
	if err == nil {
		t.Fatal("expected error creating market order with missing quote, got nil")
	}
	if !errors.Is(err, marketService.ErrQuoteNotFound) {
		t.Fatalf("expected ErrQuoteNotFound, got: %v", err)
	}
	var count1 int64
	db.Model(&model.Order{}).Where("user_uuid = ?", userUUID).Count(&count1)
	if count1 != 0 {
		t.Fatalf("SAFETY VIOLATION: order row created in DB despite missing quote! count=%d", count1)
	}

	// Case 2: Stale Quote in Redis
	staleTime := time.Now().Add(-5 * time.Minute).UTC().Format(time.RFC3339)
	_ = setRedisQuote(ctx, rClient, symbol, 300000, "angelone_live", staleTime)
	_, err = orderSvc.Create(userUUID.String(), marketReq)
	if err == nil {
		t.Fatal("expected error creating market order with stale quote, got nil")
	}
	if !errors.Is(err, marketService.ErrQuoteStale) {
		t.Fatalf("expected ErrQuoteStale, got: %v", err)
	}
	var count2 int64
	db.Model(&model.Order{}).Where("user_uuid = ?", userUUID).Count(&count2)
	if count2 != 0 {
		t.Fatalf("SAFETY VIOLATION: order row created in DB despite stale quote! count=%d", count2)
	}

	// Case 3: Ineligible Source in Redis
	nowStr := time.Now().UTC().Format(time.RFC3339)
	_ = setRedisQuote(ctx, rClient, symbol, 300000, "synthetic_gbm", nowStr)
	_, err = orderSvc.Create(userUUID.String(), marketReq)
	if err == nil {
		t.Fatal("expected error creating market order with ineligible quote source, got nil")
	}
	if !errors.Is(err, marketService.ErrQuoteIneligible) {
		t.Fatalf("expected ErrQuoteIneligible, got: %v", err)
	}
	var count3 int64
	db.Model(&model.Order{}).Where("user_uuid = ?", userUUID).Count(&count3)
	if count3 != 0 {
		t.Fatalf("SAFETY VIOLATION: order row created in DB despite ineligible source! count=%d", count3)
	}

	// Case 4: Valid Authoritative Quote in Redis -> Creation succeeds and auto-executes
	_ = setRedisQuote(ctx, rClient, symbol, 300000, "angelone_live", nowStr)
	createdOrder, err := orderSvc.Create(userUUID.String(), marketReq)
	if err != nil {
		t.Fatalf("expected market order creation to succeed with valid quote, got error: %v", err)
	}
	if createdOrder == nil || createdOrder.Status != model.OrderStatusExecuted {
		t.Fatalf("unexpected created order: %+v", createdOrder)
	}

	var count4 int64
	db.Model(&model.Order{}).Where("user_uuid = ?", userUUID).Count(&count4)
	if count4 != 1 {
		t.Fatalf("expected exactly 1 order row in DB, got %d", count4)
	}
}

// TestIntegration_RedisToOrderSettlement_SyntheticModeGBM verifies that in FeedModeSynthetic,
// synthetic_gbm quotes from Redis settle orders correctly, while angelone_live quotes are rejected.
func TestIntegration_RedisToOrderSettlement_SyntheticModeGBM(t *testing.T) {
	db := getTestDB(t)
	marketSvc, rClient := getTestRedis(t)

	ctx := context.Background()
	symbol := "NIFTY_SYNTH"
	ensureTestInstrument(t, db, symbol)

	marketSvc.SetInstrumentFinder(func(s string) (bool, error) {
		return s == symbol, nil
	})
	marketSvc.SetFeedMode(marketDTO.FeedModeSynthetic)

	userUUID := uuid.New()
	walletUUID := uuid.New()
	orderUUID := uuid.New()

	defer func() {
		db.Where("user_uuid = ?", userUUID).Delete(&model.Trade{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Order{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Position{})
		db.Where("wallet_uuid = ?", walletUUID).Delete(&model.WalletTransaction{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Wallet{})
		deleteRedisQuote(ctx, rClient, symbol)
	}()

	initialBalance := int64(2000000) // ₹20,000
	wallet := model.Wallet{
		UUID:             walletUUID,
		UserUUID:         userUUID,
		CashBalancePaise: initialBalance,
		BlockedPaise:     500000,
	}
	if err := db.Create(&wallet).Error; err != nil {
		t.Fatalf("create wallet: %v", err)
	}

	order := model.Order{
		UUID:          orderUUID,
		UserUUID:      userUUID,
		Symbol:        symbol,
		Side:          model.OrderSideBuy,
		Type:          model.OrderTypeLimit,
		Product:       model.OrderProductDelivery,
		Quantity:      2,
		PricePaise:    250000,
		Status:        model.OrderStatusPending,
		ReservedPaise: 500000,
	}
	if err := db.Create(&order).Error; err != nil {
		t.Fatalf("create order: %v", err)
	}

	cfg := &config.Config{MISLeverage: 5}
	orderSvc := New(marketSvc, cfg)
	now := time.Now().UTC()
	orderSvc.SetNowFunc(func() time.Time { return now })

	// Case 1: In SYNTHETIC mode, live quote is rejected as ineligible
	_ = setRedisQuote(ctx, rClient, symbol, 240000, "angelone_live", now.Format(time.RFC3339))
	err := orderSvc.Execute(userUUID.String(), orderUUID.String())
	if err == nil {
		t.Fatal("expected error executing synthetic order with angelone_live quote, got nil")
	}
	if !errors.Is(err, marketService.ErrQuoteIneligible) {
		t.Fatalf("expected ErrQuoteIneligible, got: %v", err)
	}
	var checkWallet model.Wallet
	_ = db.Where("user_uuid = ?", userUUID).First(&checkWallet)
	if checkWallet.CashBalancePaise != initialBalance {
		t.Fatalf("wallet mutated on ineligible quote! balance=%d", checkWallet.CashBalancePaise)
	}

	// Case 2: In SYNTHETIC mode, synthetic_gbm quote executes and settles
	_ = setRedisQuote(ctx, rClient, symbol, 240000, "synthetic_gbm", now.Format(time.RFC3339))
	err = orderSvc.Execute(userUUID.String(), orderUUID.String())
	if err != nil {
		t.Fatalf("expected synthetic_gbm order execution to succeed, got error: %v", err)
	}

	// Verify settlement
	_ = db.Where("user_uuid = ?", userUUID).First(&checkWallet)
	expectedCost := int64(2 * 240000) // 480,000 paise
	if checkWallet.CashBalancePaise != initialBalance-expectedCost {
		t.Fatalf("expected wallet balance %d, got %d", initialBalance-expectedCost, checkWallet.CashBalancePaise)
	}

	var position model.Position
	if err := db.Where("user_uuid = ? AND symbol = ?", userUUID, symbol).First(&position).Error; err != nil {
		t.Fatalf("failed to find position: %v", err)
	}
	if position.Quantity != 2 || position.AveragePricePaise != 240000 {
		t.Fatalf("unexpected position: %+v", position)
	}

	var trade model.Trade
	if err := db.Where("user_uuid = ? AND order_uuid = ?", userUUID, orderUUID).First(&trade).Error; err != nil {
		t.Fatalf("failed to find trade: %v", err)
	}
	if trade.PricePaise != 240000 || trade.Quantity != 2 {
		t.Fatalf("unexpected trade: %+v", trade)
	}
}
