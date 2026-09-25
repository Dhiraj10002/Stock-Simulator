package router

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/cache"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	instrumentService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/service"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	marketHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/handler"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	orderDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	orderHandler "github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/handler"
	portfolioDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/portfolio/dto"
	reportsDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/reports/dto"
	walletDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/wallet/dto"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

type lifecycleTestEnv struct {
	router     http.Handler
	db         *gorm.DB
	redis      *redis.Client
	orderH     *orderHandler.OrderHandler
	cleanup    func()
	setQuote   func(symbol string, pricePaise int64)
	deleteUser func(userEmail string)
}

func getLifecycleTestDB(t *testing.T) *gorm.DB {
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5433/testdb?sslmode=disable"
	}
	if err := database.Connect(&config.Config{DatabaseURL: dbURL}); err != nil {
		t.Skipf("PostgreSQL not accessible at %s (%v); skipping lifecycle integration test", dbURL, err)
		return nil
	}
	db := database.GetDB()
	if db == nil {
		t.Skip("PostgreSQL database connection is nil; skipping lifecycle integration test")
		return nil
	}
	err := db.AutoMigrate(
		&model.User{},
		&model.Wallet{},
		&model.WalletTransaction{},
		&model.Position{},
		&model.Order{},
		&model.Trade{},
		&model.Instrument{},
		&model.RiskEvent{},
		&model.RefreshSession{},
		&model.WatchlistItem{},
		&model.SimulationReset{},
	)
	if err != nil {
		t.Fatalf("failed to run database automigrate: %v", err)
	}
	return db
}

func getLifecycleTestRedis(t *testing.T) *redis.Client {
	redisURL := os.Getenv("TEST_REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6380/0"
	}
	rClient, err := cache.NewRedisClient(redisURL, 2*time.Second)
	if err != nil {
		t.Skipf("Redis client creation failed for %s (%v); skipping lifecycle integration test", redisURL, err)
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := rClient.Ping(ctx).Err(); err != nil {
		// Try fallback to standard 6379 if 6380 ping fails
		fallbackURL := "redis://localhost:6379/0"
		if fbClient, fbErr := cache.NewRedisClient(fallbackURL, 2*time.Second); fbErr == nil {
			if fbPingErr := fbClient.Ping(ctx).Err(); fbPingErr == nil {
				return fbClient
			}
		}
		t.Skipf("Redis ping failed at %s (%v); skipping lifecycle integration test", redisURL, err)
		return nil
	}
	return rClient
}

func setupTradingLifecycleEnv(t *testing.T) *lifecycleTestEnv {
	db := getLifecycleTestDB(t)
	rClient := getLifecycleTestRedis(t)

	// Seed canonical instruments from default list if missing
	for _, inst := range instrumentService.DefaultCanonicalInstruments {
		var existing model.Instrument
		if err := db.Where("symbol = ?", inst.Symbol).First(&existing).Error; err != nil {
			instCopy := inst
			instCopy.ID = 0
			_ = db.Create(&instCopy).Error
		}
	}

	jwtSecret := "phase6_trading_lifecycle_jwt_secret_key"
	cfg := &config.Config{
		CORSAllowedOrigins:         "http://localhost:3000",
		JWTSecret:                  jwtSecret,
		MarketFeedMode:             "SYNTHETIC",
		AllowSeededQuotes:          true,
		InitialVirtualBalancePaise: 100000000, // ₹10,00,000.00
		MISLeverage:                5,
		FuturesMarginPercent:       20,
		OptionSellMarginPercent:    30,
		RedisURL:                   rClient.Options().Addr,
		RedisOperationTimeout:      2 * time.Second,
	}
	if !strings.HasPrefix(cfg.RedisURL, "redis://") {
		cfg.RedisURL = "redis://" + cfg.RedisURL
	}

	ctx, cancel := context.WithCancel(context.Background())

	// Create market handler
	mktHandler, err := marketHandler.New(cfg.RedisURL, cfg.RedisOperationTimeout)
	if err != nil {
		t.Fatalf("failed to create market handler: %v", err)
	}
	mktHandler.Service().SetFeedMode(marketDTO.FeedModeSynthetic)
	mktHandler.Service().SetAllowSeededQuotes(true)

	// Create order handler with simulated trading hours (Wednesday 11:00 AM IST)
	simulatedTradingTime := time.Date(2026, 9, 23, 11, 0, 0, 0, calendar.Location())
	oh := orderHandler.New(mktHandler.Service(), cfg)
	oh.Service().SetNowFunc(func() time.Time {
		return simulatedTradingTime
	})

	appRouter := Setup(ctx, cfg, WithOrderHandler(oh))

	setQuoteFn := func(symbol string, pricePaise int64) {
		clean := strings.ToUpper(strings.TrimSpace(symbol))
		qKey := "market:quote:" + clean
		nowStr := time.Now().UTC().Format(time.RFC3339)
		err := rClient.HSet(context.Background(), qKey, map[string]interface{}{
			"price_paise":    fmt.Sprintf("%d", pricePaise),
			"source":         "synthetic_simulation",
			"updated_at":     nowStr,
			"change_paise":   "0",
			"change_percent": "0.00",
		}).Err()
		if err != nil {
			t.Fatalf("failed to set redis quote for %s: %v", symbol, err)
		}
	}

	deleteUserFn := func(email string) {
		var u model.User
		if err := db.Unscoped().Where("email = ?", email).First(&u).Error; err == nil {
			db.Unscoped().Where("user_uuid = ?", u.UUID).Delete(&model.Trade{})
			db.Unscoped().Where("user_uuid = ?", u.UUID).Delete(&model.Order{})
			db.Unscoped().Where("user_uuid = ?", u.UUID).Delete(&model.Position{})
			var w model.Wallet
			if err := db.Unscoped().Where("user_uuid = ?", u.UUID).First(&w).Error; err == nil {
				db.Unscoped().Where("wallet_uuid = ?", w.UUID).Delete(&model.WalletTransaction{})
				db.Unscoped().Delete(&w)
			}
			db.Unscoped().Where("user_uuid = ?", u.UUID).Delete(&model.RefreshSession{})
			db.Unscoped().Delete(&u)
		}
	}

	cleanup := func() {
		cancel()
	}

	return &lifecycleTestEnv{
		router:     appRouter,
		db:         db,
		redis:      rClient,
		orderH:     oh,
		cleanup:    cleanup,
		setQuote:   setQuoteFn,
		deleteUser: deleteUserFn,
	}
}

// Request and Response HTTP Helpers

func sendRequest(router http.Handler, method, path, token string, body interface{}) (*httptest.ResponseRecorder, map[string]interface{}) {
	var bodyReader *bytes.Reader
	if body != nil {
		data, _ := json.Marshal(body)
		bodyReader = bytes.NewReader(data)
	} else {
		bodyReader = bytes.NewReader([]byte{})
	}

	req := httptest.NewRequest(method, path, bodyReader)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	var res map[string]interface{}
	_ = json.Unmarshal(rec.Body.Bytes(), &res)
	return rec, res
}

func getOrderID(ordData map[string]interface{}) string {
	if u, ok := ordData["uuid"].(string); ok && u != "" {
		return u
	}
	if id, ok := ordData["id"].(string); ok && id != "" {
		return id
	}
	return ""
}

func registerAndLoginUser(t *testing.T, env *lifecycleTestEnv, email, password, name string) string {
	env.deleteUser(email)

	// REGISTER
	regRec, regRes := sendRequest(env.router, http.MethodPost, "/api/v1/auth/register", "", dto.RegisterRequest{
		Email:    email,
		Password: password,
		Name:     name,
	})
	if regRec.Code != http.StatusCreated {
		t.Fatalf("REGISTER failed for %s: code=%d res=%v", email, regRec.Code, regRes)
	}

	// LOGIN
	loginRec, loginRes := sendRequest(env.router, http.MethodPost, "/api/v1/auth/login", "", dto.LoginRequest{
		Email:    email,
		Password: password,
	})
	if loginRec.Code != http.StatusOK {
		t.Fatalf("LOGIN failed for %s: code=%d res=%v", email, loginRec.Code, loginRes)
	}

	dataMap, ok := loginRes["data"].(map[string]interface{})
	if !ok {
		t.Fatalf("LOGIN response missing data object: %v", loginRes)
	}
	accessToken, ok := dataMap["access_token"].(string)
	if !ok || accessToken == "" {
		t.Fatalf("LOGIN response missing access_token: %v", dataMap)
	}

	return accessToken
}

func fetchWallet(t *testing.T, env *lifecycleTestEnv, token string) walletDTO.WalletResponse {
	rec, res := sendRequest(env.router, http.MethodGet, "/api/v1/wallet", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/wallet failed: code=%d res=%v", rec.Code, res)
	}
	dataBytes, _ := json.Marshal(res["data"])
	var w walletDTO.WalletResponse
	if err := json.Unmarshal(dataBytes, &w); err != nil {
		t.Fatalf("failed to unmarshal wallet data: %v", err)
	}
	return w
}

func fetchPositions(t *testing.T, env *lifecycleTestEnv, token string) []portfolioDTO.PositionResponse {
	rec, res := sendRequest(env.router, http.MethodGet, "/api/v1/portfolio/positions", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/portfolio/positions failed: code=%d res=%v", rec.Code, res)
	}
	dataBytes, _ := json.Marshal(res["data"])
	var positions []portfolioDTO.PositionResponse
	_ = json.Unmarshal(dataBytes, &positions)
	return positions
}

func fetchTrades(t *testing.T, env *lifecycleTestEnv, token string) []map[string]interface{} {
	rec, res := sendRequest(env.router, http.MethodGet, "/api/v1/trades", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/trades failed: code=%d res=%v", rec.Code, res)
	}
	dataList, _ := res["data"].([]interface{})
	var result []map[string]interface{}
	for _, item := range dataList {
		if m, ok := item.(map[string]interface{}); ok {
			result = append(result, m)
		}
	}
	return result
}

func fetchLedgerStatement(t *testing.T, env *lifecycleTestEnv, token string) reportsDTO.LedgerStatementResponse {
	rec, res := sendRequest(env.router, http.MethodGet, "/api/v1/reports/ledger-statement", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/reports/ledger-statement failed: code=%d res=%v", rec.Code, res)
	}
	dataBytes, _ := json.Marshal(res["data"])
	var stmt reportsDTO.LedgerStatementResponse
	_ = json.Unmarshal(dataBytes, &stmt)
	return stmt
}

// -----------------------------------------------------------------------------
// Test 1: Complete Trading Lifecycle — DELIVERY (CNC) BUY MARKET -> SELL LIMIT
// -----------------------------------------------------------------------------
func TestTradingLifecycle_Delivery_BuyMarket_SellLimit(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	userEmail := "lifecycle_delivery_1@example.com"
	defer env.deleteUser(userEmail)

	// 1. REGISTER & 2. LOGIN
	token := registerAndLoginUser(t, env, userEmail, "Password@123", "Delivery Trader One")

	// 3. WALLET (Initial Balance: ₹10,00,000 = 100,000,000 paise)
	wallet := fetchWallet(t, env, token)
	if wallet.CashBalancePaise != 100000000 || wallet.BlockedPaise != 0 {
		t.Fatalf("Stage 3 WALLET: expected 100000000 cash, 0 blocked, got cash=%d, blocked=%d",
			wallet.CashBalancePaise, wallet.BlockedPaise)
	}

	// 4. INSTRUMENT (Canonical lookup)
	recInst, resInst := sendRequest(env.router, http.MethodGet, "/api/v1/instruments/INFY", token, nil)
	if recInst.Code != http.StatusOK {
		t.Fatalf("Stage 4 INSTRUMENT: failed lookup for INFY: code=%d res=%v", recInst.Code, resInst)
	}
	instData := resInst["data"].(map[string]interface{})
	if instData["symbol"] != "INFY" || instData["instrument_type"] != "EQUITY" {
		t.Fatalf("Stage 4 INSTRUMENT: unexpected instrument data: %v", instData)
	}

	// 5. QUOTE (Set & inspect quote: ₹1,500.00 = 150,000 paise)
	env.setQuote("INFY", 150000)
	recQuote, resQuote := sendRequest(env.router, http.MethodGet, "/api/v1/market/quotes/INFY", token, nil)
	if recQuote.Code != http.StatusOK {
		t.Fatalf("Stage 5 QUOTE: failed to get quote for INFY: code=%d res=%v", recQuote.Code, resQuote)
	}

	// 6. ORDER & 7. EXECUTION (DELIVERY BUY MARKET: 10 shares of INFY)
	orderReq := orderDTO.CreateOrderRequest{
		Symbol:   "INFY",
		Side:     model.OrderSideBuy,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductDelivery,
		Quantity: 10,
	}
	recOrd, resOrd := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, orderReq)
	if recOrd.Code != http.StatusCreated {
		t.Fatalf("Stage 6 ORDER: failed to create order: code=%d res=%v", recOrd.Code, resOrd)
	}
	ordData := resOrd["data"].(map[string]interface{})
	if ordData["status"] != model.OrderStatusExecuted {
		t.Fatalf("Stage 7 EXECUTION: market order expected EXECUTED status, got: %v", ordData["status"])
	}

	// 8. TRADE (Verify trade generated)
	trades := fetchTrades(t, env, token)
	if len(trades) != 1 {
		t.Fatalf("Stage 8 TRADE: expected 1 trade, got %d", len(trades))
	}
	if trades[0]["side"] != model.OrderSideBuy || int64(trades[0]["quantity"].(float64)) != 10 {
		t.Fatalf("Stage 8 TRADE: unexpected trade data: %v", trades[0])
	}

	// 9. POSITION (Verify position created: 10 shares at 150,000 paise)
	positions := fetchPositions(t, env, token)
	if len(positions) != 1 || positions[0].Symbol != "INFY" || positions[0].Quantity != 10 {
		t.Fatalf("Stage 9 POSITION: unexpected positions: %v", positions)
	}

	// 10. P&L (Simulate price movement to ₹1,600.00 = 160,000 paise)
	env.setQuote("INFY", 160000)
	positionsAfter := fetchPositions(t, env, token)
	expectedUnrealizedPnl := int64(10 * (160000 - 150000)) // +100,000 paise (+₹1,000)
	if positionsAfter[0].UnrealizedPnlPaise != expectedUnrealizedPnl {
		t.Fatalf("Stage 10 P&L: expected unrealized P&L %d paise, got %d",
			expectedUnrealizedPnl, positionsAfter[0].UnrealizedPnlPaise)
	}

	// 11. WALLET LEDGER (Verify purchase debit recorded)
	ledger := fetchLedgerStatement(t, env, token)
	if len(ledger.Entries) == 0 {
		t.Fatalf("Stage 11 WALLET LEDGER: expected ledger entries, got none")
	}

	// 12. SQUARE OFF (DELIVERY SELL LIMIT: 10 shares of INFY at 160,000 paise)
	sellReq := orderDTO.CreateOrderRequest{
		Symbol:     "INFY",
		Side:       model.OrderSideSell,
		Type:       model.OrderTypeLimit,
		PricePaise: 160000,
		Product:    model.OrderProductDelivery,
		Quantity:   10,
	}
	recSell, resSell := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, sellReq)
	if recSell.Code != http.StatusCreated {
		t.Fatalf("Stage 12 SQUARE OFF: failed to place sell limit order: code=%d res=%v", recSell.Code, resSell)
	}
	sellOrdData := resSell["data"].(map[string]interface{})
	sellOrderID := getOrderID(sellOrdData)

	// If not immediately marketable, execute it against current quote
	if sellOrdData["status"] != model.OrderStatusExecuted {
		recExec, resExec := sendRequest(env.router, http.MethodPost, fmt.Sprintf("/api/v1/orders/%s/execute", sellOrderID), token, nil)
		if recExec.Code != http.StatusOK {
			t.Fatalf("Stage 12 SQUARE OFF: failed to execute sell order: code=%d res=%v", recExec.Code, resExec)
		}
	}

	// Verify position is now flat (quantity = 0)
	positionsFinal := fetchPositions(t, env, token)
	for _, p := range positionsFinal {
		if p.Symbol == "INFY" && p.Quantity != 0 {
			t.Fatalf("Stage 12 SQUARE OFF: expected flat position for INFY, got qty=%d", p.Quantity)
		}
	}

	// 13. FINAL BALANCE (Initial 100,000,000 + 100,000 profit = 100,100,000 paise)
	finalWallet := fetchWallet(t, env, token)
	expectedFinalCash := int64(100100000)
	if finalWallet.CashBalancePaise != expectedFinalCash || finalWallet.BlockedPaise != 0 {
		t.Fatalf("Stage 13 FINAL BALANCE: expected %d cash, 0 blocked, got cash=%d, blocked=%d",
			expectedFinalCash, finalWallet.CashBalancePaise, finalWallet.BlockedPaise)
	}
}

// -----------------------------------------------------------------------------
// Test 2: Complete Trading Lifecycle — DELIVERY (CNC) BUY LIMIT -> SELL MARKET
// -----------------------------------------------------------------------------
func TestTradingLifecycle_Delivery_BuyLimit_SellMarket(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	userEmail := "lifecycle_delivery_2@example.com"
	defer env.deleteUser(userEmail)

	// 1. REGISTER & 2. LOGIN
	token := registerAndLoginUser(t, env, userEmail, "Password@123", "Delivery Trader Two")

	// 3. WALLET
	initialWallet := fetchWallet(t, env, token)
	if initialWallet.CashBalancePaise != 100000000 {
		t.Fatalf("expected initial cash 100000000, got %d", initialWallet.CashBalancePaise)
	}

	// 4. INSTRUMENT & 5. QUOTE (INFY at ₹1,500.00 = 150,000 paise)
	env.setQuote("INFY", 150000)

	// 6. ORDER (BUY LIMIT 20 shares at 150,000 paise)
	buyLimitReq := orderDTO.CreateOrderRequest{
		Symbol:     "INFY",
		Side:       model.OrderSideBuy,
		Type:       model.OrderTypeLimit,
		PricePaise: 150000,
		Product:    model.OrderProductDelivery,
		Quantity:   20,
	}
	recOrd, resOrd := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, buyLimitReq)
	if recOrd.Code != http.StatusCreated {
		t.Fatalf("failed to create BUY LIMIT order: code=%d res=%v", recOrd.Code, resOrd)
	}
	ordData := resOrd["data"].(map[string]interface{})
	orderID := getOrderID(ordData)

	// 7. EXECUTION
	if ordData["status"] != model.OrderStatusExecuted {
		recExec, resExec := sendRequest(env.router, http.MethodPost, fmt.Sprintf("/api/v1/orders/%s/execute", orderID), token, nil)
		if recExec.Code != http.StatusOK {
			t.Fatalf("failed to execute BUY LIMIT order: code=%d res=%v", recExec.Code, resExec)
		}
	}

	// 8. TRADE & 9. POSITION
	positions := fetchPositions(t, env, token)
	if len(positions) == 0 || positions[0].Quantity != 20 {
		t.Fatalf("expected 20 shares in holding, got %v", positions)
	}

	// 10. P&L (Simulate price drop to ₹1,480.00 = 148,000 paise)
	env.setQuote("INFY", 148000)
	positionsLoss := fetchPositions(t, env, token)
	expectedLoss := int64(20 * (148000 - 150000)) // -40,000 paise
	if positionsLoss[0].UnrealizedPnlPaise != expectedLoss {
		t.Fatalf("expected unrealized P&L %d, got %d", expectedLoss, positionsLoss[0].UnrealizedPnlPaise)
	}

	// 11. WALLET LEDGER
	ledger := fetchLedgerStatement(t, env, token)
	if len(ledger.Entries) == 0 {
		t.Fatalf("expected ledger entries")
	}

	// 12. SQUARE OFF (SELL MARKET 20 shares at 148,000 paise)
	sellMarketReq := orderDTO.CreateOrderRequest{
		Symbol:   "INFY",
		Side:     model.OrderSideSell,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductDelivery,
		Quantity: 20,
	}
	recSell, resSell := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, sellMarketReq)
	if recSell.Code != http.StatusCreated {
		t.Fatalf("failed to place sell market order: code=%d res=%v", recSell.Code, resSell)
	}

	// 13. FINAL BALANCE (100,000,000 - 40,000 = 99,960,000 paise)
	finalWallet := fetchWallet(t, env, token)
	expectedFinalCash := int64(99960000)
	if finalWallet.CashBalancePaise != expectedFinalCash || finalWallet.BlockedPaise != 0 {
		t.Fatalf("expected %d cash, 0 blocked, got cash=%d, blocked=%d",
			expectedFinalCash, finalWallet.CashBalancePaise, finalWallet.BlockedPaise)
	}
}

// -----------------------------------------------------------------------------
// Test 3: Complete Trading Lifecycle — MIS (Intraday) BUY MARKET -> SQUARE OFF
// -----------------------------------------------------------------------------
func TestTradingLifecycle_MIS_BuyMarket_SquareOffEndpoint(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	userEmail := "lifecycle_mis_buy@example.com"
	defer env.deleteUser(userEmail)

	// 1. REGISTER & 2. LOGIN
	token := registerAndLoginUser(t, env, userEmail, "Password@123", "MIS Trader Buy")

	// 3. WALLET (100,000,000 paise)
	initialWallet := fetchWallet(t, env, token)
	if initialWallet.CashBalancePaise != 100000000 {
		t.Fatalf("initial cash balance mismatch: %d", initialWallet.CashBalancePaise)
	}

	// 4. INSTRUMENT & 5. QUOTE (TCS at ₹3,500.00 = 350,000 paise)
	env.setQuote("TCS", 350000)

	// 6. ORDER & 7. EXECUTION (MIS BUY MARKET: 100 shares of TCS)
	// Turnover = 100 * 350,000 = 35,000,000 paise (₹3,50,000)
	// Leverage = 5x -> Margin required = 20% = 7,000,000 paise (₹70,000)
	orderReq := orderDTO.CreateOrderRequest{
		Symbol:   "TCS",
		Side:     model.OrderSideBuy,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductIntraday,
		Quantity: 100,
	}
	recOrd, resOrd := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, orderReq)
	if recOrd.Code != http.StatusCreated {
		t.Fatalf("Stage 6 ORDER: failed to create MIS order: code=%d res=%v", recOrd.Code, resOrd)
	}

	// 8. TRADE & 9. POSITION
	trades := fetchTrades(t, env, token)
	if len(trades) != 1 {
		t.Fatalf("Stage 8 TRADE: expected 1 trade, got %d", len(trades))
	}
	positions := fetchPositions(t, env, token)
	if len(positions) != 1 || positions[0].Quantity != 100 || positions[0].Product != model.OrderProductIntraday {
		t.Fatalf("Stage 9 POSITION: unexpected MIS position: %v", positions)
	}

	// Check that margin was blocked in wallet (7,000,000 paise blocked)
	walletMid := fetchWallet(t, env, token)
	if walletMid.BlockedPaise != 7000000 {
		t.Fatalf("expected 7000000 paise blocked for MIS position, got %d", walletMid.BlockedPaise)
	}

	// 10. P&L (Simulate rally to ₹3,550.00 = 355,000 paise)
	env.setQuote("TCS", 355000)
	positionsAfter := fetchPositions(t, env, token)
	expectedPnl := int64(100 * (355000 - 350000)) // +500,000 paise (+₹5,000)
	if positionsAfter[0].UnrealizedPnlPaise != expectedPnl {
		t.Fatalf("Stage 10 P&L: expected %d paise, got %d", expectedPnl, positionsAfter[0].UnrealizedPnlPaise)
	}

	// 11. WALLET LEDGER
	ledger := fetchLedgerStatement(t, env, token)
	if len(ledger.Entries) == 0 && initialWallet.CashBalancePaise == 0 {
		t.Fatalf("Stage 11 WALLET LEDGER: expected entries")
	}

	// 12. SQUARE OFF (Using the official automated /api/v1/orders/squareoff-mis endpoint!)
	recSq, resSq := sendRequest(env.router, http.MethodPost, "/api/v1/orders/squareoff-mis", token, nil)
	if recSq.Code != http.StatusOK {
		t.Fatalf("Stage 12 SQUARE OFF: squareoff-mis failed: code=%d res=%v", recSq.Code, resSq)
	}

	// Position must now be flat (quantity = 0)
	positionsFinal := fetchPositions(t, env, token)
	for _, p := range positionsFinal {
		if p.Symbol == "TCS" && p.Quantity != 0 {
			t.Fatalf("Stage 12 SQUARE OFF: position still open: %v", p)
		}
	}

	// 13. FINAL BALANCE (All blocked margin released; cash balance = 100,000,000 + 500,000 = 100,500,000 paise)
	finalWallet := fetchWallet(t, env, token)
	expectedFinalCash := int64(100500000)
	if finalWallet.CashBalancePaise != expectedFinalCash || finalWallet.BlockedPaise != 0 {
		t.Fatalf("Stage 13 FINAL BALANCE: expected cash=%d, blocked=0, got cash=%d, blocked=%d",
			expectedFinalCash, finalWallet.CashBalancePaise, finalWallet.BlockedPaise)
	}
}

// -----------------------------------------------------------------------------
// Test 4: Complete Trading Lifecycle — MIS (Intraday) SHORT SELL LIMIT -> BUY TO COVER
// -----------------------------------------------------------------------------
func TestTradingLifecycle_MIS_ShortSellLimit_BuyToCover(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	userEmail := "lifecycle_mis_short@example.com"
	defer env.deleteUser(userEmail)

	// 1. REGISTER & 2. LOGIN
	token := registerAndLoginUser(t, env, userEmail, "Password@123", "MIS Short Trader")

	// 3. WALLET (100,000,000 paise)
	walletInit := fetchWallet(t, env, token)
	if walletInit.CashBalancePaise != 100000000 {
		t.Fatalf("wallet init cash mismatch: %d", walletInit.CashBalancePaise)
	}

	// 4. INSTRUMENT & 5. QUOTE (RELIANCE at ₹2,500.00 = 250,000 paise)
	env.setQuote("RELIANCE", 250000)

	// 6. ORDER (MIS SHORT SELL LIMIT: 50 shares at 250,000 paise)
	// Turnover = 50 * 250,000 = 12,500,000 paise (₹1,25,000)
	// Margin required (20%) = 2,500,000 paise (₹25,000)
	shortOrderReq := orderDTO.CreateOrderRequest{
		Symbol:     "RELIANCE",
		Side:       model.OrderSideSell,
		Type:       model.OrderTypeLimit,
		PricePaise: 250000,
		Product:    model.OrderProductIntraday,
		Quantity:   50,
	}
	recOrd, resOrd := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, shortOrderReq)
	if recOrd.Code != http.StatusCreated {
		t.Fatalf("Stage 6 ORDER: failed to create MIS short order: code=%d res=%v", recOrd.Code, resOrd)
	}
	ordData := resOrd["data"].(map[string]interface{})
	orderID := getOrderID(ordData)

	// 7. EXECUTION
	if ordData["status"] != model.OrderStatusExecuted {
		recExec, resExec := sendRequest(env.router, http.MethodPost, fmt.Sprintf("/api/v1/orders/%s/execute", orderID), token, nil)
		if recExec.Code != http.StatusOK {
			t.Fatalf("Stage 7 EXECUTION: failed to execute short order: code=%d res=%v", recExec.Code, resExec)
		}
	}

	// 8. TRADE & 9. POSITION (Short position: Quantity = -50)
	positions := fetchPositions(t, env, token)
	if len(positions) != 1 || positions[0].Quantity != -50 {
		t.Fatalf("Stage 9 POSITION: expected short position qty=-50, got %v", positions)
	}

	// Verify margin blocked = 2,500,000 paise
	walletMid := fetchWallet(t, env, token)
	if walletMid.BlockedPaise != 2500000 {
		t.Fatalf("expected 2500000 paise blocked for short position, got %d", walletMid.BlockedPaise)
	}

	// 10. P&L (Simulate price drop to ₹2,450.00 = 245,000 paise)
	// Short position gains when price drops: (250,000 - 245,000) * 50 = +250,000 paise (+₹2,500 profit)
	env.setQuote("RELIANCE", 245000)
	positionsAfter := fetchPositions(t, env, token)
	expectedPnl := int64(50 * (250000 - 245000)) // +250,000 paise
	if positionsAfter[0].UnrealizedPnlPaise != expectedPnl {
		t.Fatalf("Stage 10 P&L: expected short gain %d paise, got %d", expectedPnl, positionsAfter[0].UnrealizedPnlPaise)
	}

	// 11. WALLET LEDGER
	_ = fetchLedgerStatement(t, env, token)

	// 12. SQUARE OFF (BUY TO COVER: 50 shares of RELIANCE at market)
	coverOrderReq := orderDTO.CreateOrderRequest{
		Symbol:   "RELIANCE",
		Side:     model.OrderSideBuy,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductIntraday,
		Quantity: 50,
	}
	recCover, resCover := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, coverOrderReq)
	if recCover.Code != http.StatusCreated {
		t.Fatalf("Stage 12 SQUARE OFF: failed to create buy to cover order: code=%d res=%v", recCover.Code, resCover)
	}

	// Position must now be flat
	positionsFinal := fetchPositions(t, env, token)
	for _, p := range positionsFinal {
		if p.Symbol == "RELIANCE" && p.Quantity != 0 {
			t.Fatalf("Stage 12 SQUARE OFF: position still open: %v", p)
		}
	}

	// 13. FINAL BALANCE (All blocked margin released; cash balance = 100,000,000 + 250,000 = 100,250,000 paise)
	finalWallet := fetchWallet(t, env, token)
	expectedFinalCash := int64(100250000)
	if finalWallet.CashBalancePaise != expectedFinalCash || finalWallet.BlockedPaise != 0 {
		t.Fatalf("Stage 13 FINAL BALANCE: expected cash=%d, blocked=0, got cash=%d, blocked=%d",
			expectedFinalCash, finalWallet.CashBalancePaise, finalWallet.BlockedPaise)
	}
}

// -----------------------------------------------------------------------------
// Test 5: Complete Trading Lifecycle — F&O (Futures) BUY LIMIT -> SELL MARKET
// -----------------------------------------------------------------------------
func TestTradingLifecycle_FNO_Future_BuyLimit_SellMarket(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	userEmail := "lifecycle_fno_fut_buy@example.com"
	defer env.deleteUser(userEmail)

	// 1. REGISTER & 2. LOGIN
	token := registerAndLoginUser(t, env, userEmail, "Password@123", "Future Trader")

	// 3. WALLET (100,000,000 paise)
	initialWallet := fetchWallet(t, env, token)
	if initialWallet.CashBalancePaise != 100000000 {
		t.Fatalf("wallet init cash mismatch: %d", initialWallet.CashBalancePaise)
	}

	// 4. INSTRUMENT & 5. QUOTE (NIFTY SEP FUT at ₹25,000.00 = 2,500,000 paise)
	futureSymbol := "NIFTY24SEPFUT"
	env.setQuote(futureSymbol, 2500000)

	// 6. ORDER (F&O BUY LIMIT 25 units [1 lot] at 2,500,000 paise)
	// Contract value = 25 * 2,500,000 = 62,500,000 paise (₹6,25,000)
	// Futures Margin required (20%) = 12,500,000 paise (₹1,25,000). Zero initial premium outflow.
	orderReq := orderDTO.CreateOrderRequest{
		Symbol:     futureSymbol,
		Side:       model.OrderSideBuy,
		Type:       model.OrderTypeLimit,
		PricePaise: 2500000,
		Product:    model.OrderProductFNO,
		Quantity:   25,
	}
	recOrd, resOrd := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, orderReq)
	if recOrd.Code != http.StatusCreated {
		t.Fatalf("Stage 6 ORDER: failed to place future order: code=%d res=%v", recOrd.Code, resOrd)
	}
	ordData := resOrd["data"].(map[string]interface{})
	orderID := getOrderID(ordData)

	// 7. EXECUTION
	if ordData["status"] != model.OrderStatusExecuted {
		recExec, resExec := sendRequest(env.router, http.MethodPost, fmt.Sprintf("/api/v1/orders/%s/execute", orderID), token, nil)
		if recExec.Code != http.StatusOK {
			t.Fatalf("Stage 7 EXECUTION: failed to execute future order: code=%d res=%v", recExec.Code, resExec)
		}
	}

	// 8. TRADE & 9. POSITION
	trades := fetchTrades(t, env, token)
	if len(trades) != 1 {
		t.Fatalf("Stage 8 TRADE: expected 1 trade, got %d", len(trades))
	}
	positions := fetchPositions(t, env, token)
	if len(positions) != 1 || positions[0].Quantity != 25 || positions[0].Product != model.OrderProductFNO {
		t.Fatalf("Stage 9 POSITION: unexpected future position: %v", positions)
	}

	// Check margin blocked = 12,500,000 paise
	walletMid := fetchWallet(t, env, token)
	if walletMid.BlockedPaise != 12500000 {
		t.Fatalf("expected 12500000 paise blocked for futures, got %d", walletMid.BlockedPaise)
	}

	// 10. P&L (Simulate rally to ₹25,200.00 = 2,520,000 paise)
	env.setQuote(futureSymbol, 2520000)
	positionsAfter := fetchPositions(t, env, token)
	expectedPnl := int64(25 * (2520000 - 2500000)) // +500,000 paise (+₹5,000)
	if positionsAfter[0].UnrealizedPnlPaise != expectedPnl {
		t.Fatalf("Stage 10 P&L: expected %d paise, got %d", expectedPnl, positionsAfter[0].UnrealizedPnlPaise)
	}

	// 11. WALLET LEDGER
	_ = fetchLedgerStatement(t, env, token)

	// 12. SQUARE OFF (F&O SELL MARKET 25 units)
	sellReq := orderDTO.CreateOrderRequest{
		Symbol:   futureSymbol,
		Side:     model.OrderSideSell,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductFNO,
		Quantity: 25,
	}
	recSell, resSell := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, sellReq)
	if recSell.Code != http.StatusCreated {
		t.Fatalf("Stage 12 SQUARE OFF: failed to place sell future order: code=%d res=%v", recSell.Code, resSell)
	}

	// Position must now be flat
	positionsFinal := fetchPositions(t, env, token)
	for _, p := range positionsFinal {
		if p.Symbol == futureSymbol && p.Quantity != 0 {
			t.Fatalf("Stage 12 SQUARE OFF: position still open: %v", p)
		}
	}

	// 13. FINAL BALANCE (All margin unblocked; cash = 100,000,000 + 500,000 = 100,500,000 paise)
	finalWallet := fetchWallet(t, env, token)
	expectedFinalCash := int64(100500000)
	if finalWallet.CashBalancePaise != expectedFinalCash || finalWallet.BlockedPaise != 0 {
		t.Fatalf("Stage 13 FINAL BALANCE: expected cash=%d, blocked=0, got cash=%d, blocked=%d",
			expectedFinalCash, finalWallet.CashBalancePaise, finalWallet.BlockedPaise)
	}
}

// -----------------------------------------------------------------------------
// Test 6: Complete Trading Lifecycle — F&O (Futures) SHORT SELL MARKET -> BUY TO COVER
// -----------------------------------------------------------------------------
func TestTradingLifecycle_FNO_Future_ShortSellMarket_BuyToCover(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	userEmail := "lifecycle_fno_fut_short@example.com"
	defer env.deleteUser(userEmail)

	// 1. REGISTER & 2. LOGIN
	token := registerAndLoginUser(t, env, userEmail, "Password@123", "Future Short Trader")

	// 3. WALLET (100,000,000 paise)
	initialWallet := fetchWallet(t, env, token)
	if initialWallet.CashBalancePaise != 100000000 {
		t.Fatalf("wallet init cash mismatch: %d", initialWallet.CashBalancePaise)
	}

	// 4. INSTRUMENT & 5. QUOTE (NIFTY SEP FUT at ₹25,000.00 = 2,500,000 paise)
	futureSymbol := "NIFTY24SEPFUT"
	env.setQuote(futureSymbol, 2500000)

	// 6. ORDER & 7. EXECUTION (F&O SELL MARKET 25 units [1 lot])
	// Margin blocked (20%) = 12,500,000 paise
	orderReq := orderDTO.CreateOrderRequest{
		Symbol:   futureSymbol,
		Side:     model.OrderSideSell,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductFNO,
		Quantity: 25,
	}
	recOrd, resOrd := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, orderReq)
	if recOrd.Code != http.StatusCreated {
		t.Fatalf("Stage 6 ORDER: failed to place short future order: code=%d res=%v", recOrd.Code, resOrd)
	}

	// 8. TRADE & 9. POSITION (Quantity = -25)
	positions := fetchPositions(t, env, token)
	if len(positions) != 1 || positions[0].Quantity != -25 {
		t.Fatalf("Stage 9 POSITION: expected short future position qty=-25, got %v", positions)
	}

	// 10. P&L (Simulate drop to ₹24,800.00 = 2,480,000 paise)
	// Short gain: (2,500,000 - 2,480,000) * 25 = +500,000 paise (+₹5,000)
	env.setQuote(futureSymbol, 2480000)
	positionsAfter := fetchPositions(t, env, token)
	expectedPnl := int64(25 * (2500000 - 2480000))
	if positionsAfter[0].UnrealizedPnlPaise != expectedPnl {
		t.Fatalf("Stage 10 P&L: expected %d paise, got %d", expectedPnl, positionsAfter[0].UnrealizedPnlPaise)
	}

	// 11. WALLET LEDGER
	_ = fetchLedgerStatement(t, env, token)

	// 12. SQUARE OFF (BUY TO COVER 25 units at market)
	buyCoverReq := orderDTO.CreateOrderRequest{
		Symbol:   futureSymbol,
		Side:     model.OrderSideBuy,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductFNO,
		Quantity: 25,
	}
	recCover, resCover := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, buyCoverReq)
	if recCover.Code != http.StatusCreated {
		t.Fatalf("Stage 12 SQUARE OFF: failed to cover future: code=%d res=%v", recCover.Code, resCover)
	}

	// Position flat
	positionsFinal := fetchPositions(t, env, token)
	for _, p := range positionsFinal {
		if p.Symbol == futureSymbol && p.Quantity != 0 {
			t.Fatalf("Stage 12 SQUARE OFF: position still open: %v", p)
		}
	}

	// 13. FINAL BALANCE (Cash = 100,500,000 paise, blocked = 0)
	finalWallet := fetchWallet(t, env, token)
	expectedFinalCash := int64(100500000)
	if finalWallet.CashBalancePaise != expectedFinalCash || finalWallet.BlockedPaise != 0 {
		t.Fatalf("Stage 13 FINAL BALANCE: expected cash=%d, blocked=0, got cash=%d, blocked=%d",
			expectedFinalCash, finalWallet.CashBalancePaise, finalWallet.BlockedPaise)
	}
}

// -----------------------------------------------------------------------------
// Test 7: Complete Trading Lifecycle — F&O (Options) CE BUY (Long Call) -> SELL SQUARE OFF
// -----------------------------------------------------------------------------
func TestTradingLifecycle_FNO_Option_CE_BuyMarket_SellSquareOff(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	userEmail := "lifecycle_fno_ce_buy@example.com"
	defer env.deleteUser(userEmail)

	// 1. REGISTER & 2. LOGIN
	token := registerAndLoginUser(t, env, userEmail, "Password@123", "CE Buy Trader")

	// 3. WALLET (100,000,000 paise)
	initialWallet := fetchWallet(t, env, token)
	if initialWallet.CashBalancePaise != 100000000 {
		t.Fatalf("wallet init cash mismatch: %d", initialWallet.CashBalancePaise)
	}

	// 4. INSTRUMENT & 5. QUOTE (NIFTY 25000 CE at ₹200.00 = 20,000 paise premium)
	ceSymbol := "NIFTY 25000 CE"
	env.setQuote(ceSymbol, 20000)

	// 6. ORDER & 7. EXECUTION (F&O CE BUY MARKET: 25 units [1 lot])
	// Long Option: Margin blocked = 0!
	// Full Premium debited = 25 * 20,000 = 500,000 paise (₹5,000)
	orderReq := orderDTO.CreateOrderRequest{
		Symbol:   ceSymbol,
		Side:     model.OrderSideBuy,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductFNO,
		Quantity: 25,
	}
	recOrd, resOrd := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, orderReq)
	if recOrd.Code != http.StatusCreated {
		t.Fatalf("Stage 6 ORDER: failed to buy CE: code=%d res=%v", recOrd.Code, resOrd)
	}

	// 8. TRADE & 9. POSITION
	trades := fetchTrades(t, env, token)
	if len(trades) != 1 {
		t.Fatalf("Stage 8 TRADE: expected 1 trade, got %d", len(trades))
	}
	positions := fetchPositions(t, env, token)
	if len(positions) != 1 || positions[0].Quantity != 25 {
		t.Fatalf("Stage 9 POSITION: unexpected position: %v", positions)
	}

	// Verify wallet: Cash was debited by 500,000 paise; Blocked = 0!
	walletMid := fetchWallet(t, env, token)
	if walletMid.CashBalancePaise != 99500000 || walletMid.BlockedPaise != 0 {
		t.Fatalf("expected cash=99500000, blocked=0 for long option, got cash=%d, blocked=%d",
			walletMid.CashBalancePaise, walletMid.BlockedPaise)
	}

	// 10. P&L (Simulate premium increase to ₹350.00 = 35,000 paise)
	env.setQuote(ceSymbol, 35000)
	positionsAfter := fetchPositions(t, env, token)
	expectedPnl := int64(25 * (35000 - 20000)) // +375,000 paise (+₹3,750)
	if positionsAfter[0].UnrealizedPnlPaise != expectedPnl {
		t.Fatalf("Stage 10 P&L: expected %d paise, got %d", expectedPnl, positionsAfter[0].UnrealizedPnlPaise)
	}

	// 11. WALLET LEDGER
	_ = fetchLedgerStatement(t, env, token)

	// 12. SQUARE OFF (F&O CE SELL MARKET 25 units at 35,000 paise)
	// Premium proceeds credited = 25 * 35,000 = 875,000 paise
	sellReq := orderDTO.CreateOrderRequest{
		Symbol:   ceSymbol,
		Side:     model.OrderSideSell,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductFNO,
		Quantity: 25,
	}
	recSell, resSell := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, sellReq)
	if recSell.Code != http.StatusCreated {
		t.Fatalf("Stage 12 SQUARE OFF: failed to sell CE: code=%d res=%v", recSell.Code, resSell)
	}

	// Position flat
	positionsFinal := fetchPositions(t, env, token)
	for _, p := range positionsFinal {
		if p.Symbol == ceSymbol && p.Quantity != 0 {
			t.Fatalf("Stage 12 SQUARE OFF: position still open: %v", p)
		}
	}

	// 13. FINAL BALANCE
	// Initial cash: 100,000,000 - 500,000 (buy premium) + 875,000 (sell proceeds) = 100,375,000 paise (+₹3,750 net profit)
	finalWallet := fetchWallet(t, env, token)
	expectedFinalCash := int64(100375000)
	if finalWallet.CashBalancePaise != expectedFinalCash || finalWallet.BlockedPaise != 0 {
		t.Fatalf("Stage 13 FINAL BALANCE: expected cash=%d, blocked=0, got cash=%d, blocked=%d",
			expectedFinalCash, finalWallet.CashBalancePaise, finalWallet.BlockedPaise)
	}
}

// -----------------------------------------------------------------------------
// Test 8: Complete Trading Lifecycle — F&O (Options) CE SELL (Short Writing) -> BUY TO COVER
// -----------------------------------------------------------------------------
func TestTradingLifecycle_FNO_Option_CE_ShortWriting_BuyToCover(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	userEmail := "lifecycle_fno_ce_short@example.com"
	defer env.deleteUser(userEmail)

	// 1. REGISTER & 2. LOGIN
	token := registerAndLoginUser(t, env, userEmail, "Password@123", "CE Short Trader")

	// 3. WALLET (100,000,000 paise)
	initialWallet := fetchWallet(t, env, token)
	if initialWallet.CashBalancePaise != 100000000 {
		t.Fatalf("wallet init cash mismatch: %d", initialWallet.CashBalancePaise)
	}

	// 4. INSTRUMENT & 5. QUOTE (NIFTY 25000 CE at ₹200.00 = 20,000 paise premium)
	ceSymbol := "NIFTY 25000 CE"
	env.setQuote(ceSymbol, 20000)

	// 6. ORDER & 7. EXECUTION (F&O CE SELL MARKET 25 units [1 lot])
	// Short Option: Margin is blocked (~30% of 25 * 25,000 strike = 18,750,000 paise)
	// Full premium is CREDITED immediately = 25 * 20,000 = +500,000 paise
	orderReq := orderDTO.CreateOrderRequest{
		Symbol:   ceSymbol,
		Side:     model.OrderSideSell,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductFNO,
		Quantity: 25,
	}
	recOrd, resOrd := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, orderReq)
	if recOrd.Code != http.StatusCreated {
		t.Fatalf("Stage 6 ORDER: failed to short write CE: code=%d res=%v", recOrd.Code, resOrd)
	}

	// 8. TRADE & 9. POSITION (Quantity = -25)
	positions := fetchPositions(t, env, token)
	if len(positions) != 1 || positions[0].Quantity != -25 {
		t.Fatalf("Stage 9 POSITION: expected short option qty=-25, got %v", positions)
	}

	// Verify wallet: Cash balance credited by 500,000 paise, Margin blocked = 150,000 paise (30% of 25 * 20000)
	walletMid := fetchWallet(t, env, token)
	expectedCashMid := int64(100500000)
	if walletMid.CashBalancePaise != expectedCashMid || walletMid.BlockedPaise != 150000 {
		t.Fatalf("expected cash=%d, blocked=150000, got cash=%d, blocked=%d",
			expectedCashMid, walletMid.CashBalancePaise, walletMid.BlockedPaise)
	}

	// 10. P&L (Simulate option premium decay to ₹50.00 = 5,000 paise)
	// Short option gain: (20,000 - 5,000) * 25 = +375,000 paise (+₹3,750)
	env.setQuote(ceSymbol, 5000)
	positionsAfter := fetchPositions(t, env, token)
	expectedPnl := int64(25 * (20000 - 5000))
	if positionsAfter[0].UnrealizedPnlPaise != expectedPnl {
		t.Fatalf("Stage 10 P&L: expected decay gain %d paise, got %d", expectedPnl, positionsAfter[0].UnrealizedPnlPaise)
	}

	// 11. WALLET LEDGER
	_ = fetchLedgerStatement(t, env, token)

	// 12. SQUARE OFF (BUY TO COVER 25 units at market: premium cost = 25 * 5,000 = 125,000 paise)
	coverReq := orderDTO.CreateOrderRequest{
		Symbol:   ceSymbol,
		Side:     model.OrderSideBuy,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductFNO,
		Quantity: 25,
	}
	recCover, resCover := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, coverReq)
	if recCover.Code != http.StatusCreated {
		t.Fatalf("Stage 12 SQUARE OFF: failed to cover short CE: code=%d res=%v", recCover.Code, resCover)
	}

	// Position flat
	positionsFinal := fetchPositions(t, env, token)
	for _, p := range positionsFinal {
		if p.Symbol == ceSymbol && p.Quantity != 0 {
			t.Fatalf("Stage 12 SQUARE OFF: position still open: %v", p)
		}
	}

	// 13. FINAL BALANCE (All margin unblocked; cash = 100,500,000 - 125,000 = 100,375,000 paise)
	finalWallet := fetchWallet(t, env, token)
	expectedFinalCash := int64(100375000)
	if finalWallet.CashBalancePaise != expectedFinalCash || finalWallet.BlockedPaise != 0 {
		t.Fatalf("Stage 13 FINAL BALANCE: expected cash=%d, blocked=0, got cash=%d, blocked=%d",
			expectedFinalCash, finalWallet.CashBalancePaise, finalWallet.BlockedPaise)
	}
}

// -----------------------------------------------------------------------------
// Test 9: Complete Trading Lifecycle — F&O (Options) PE BUY (Long Put) -> SELL SQUARE OFF
// -----------------------------------------------------------------------------
func TestTradingLifecycle_FNO_Option_PE_BuyLimit_SellSquareOff(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	userEmail := "lifecycle_fno_pe_buy@example.com"
	defer env.deleteUser(userEmail)

	// 1. REGISTER & 2. LOGIN
	token := registerAndLoginUser(t, env, userEmail, "Password@123", "PE Buy Trader")

	// 3. WALLET (100,000,000 paise)
	initialWallet := fetchWallet(t, env, token)
	if initialWallet.CashBalancePaise != 100000000 {
		t.Fatalf("wallet init cash mismatch: %d", initialWallet.CashBalancePaise)
	}

	// 4. INSTRUMENT & 5. QUOTE (NIFTY 25000 PE at ₹150.00 = 15,000 paise premium)
	peSymbol := "NIFTY 25000 PE"
	env.setQuote(peSymbol, 15000)

	// 6. ORDER (F&O PE BUY LIMIT: 25 units [1 lot] at 15,000 paise)
	// Full premium debited = 25 * 15,000 = 375,000 paise (₹3,750). Margin blocked = 0!
	orderReq := orderDTO.CreateOrderRequest{
		Symbol:     peSymbol,
		Side:       model.OrderSideBuy,
		Type:       model.OrderTypeLimit,
		PricePaise: 15000,
		Product:    model.OrderProductFNO,
		Quantity:   25,
	}
	recOrd, resOrd := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, orderReq)
	if recOrd.Code != http.StatusCreated {
		t.Fatalf("Stage 6 ORDER: failed to buy PE: code=%d res=%v", recOrd.Code, resOrd)
	}
	ordData := resOrd["data"].(map[string]interface{})
	orderID := getOrderID(ordData)

	// 7. EXECUTION
	if ordData["status"] != model.OrderStatusExecuted {
		recExec, resExec := sendRequest(env.router, http.MethodPost, fmt.Sprintf("/api/v1/orders/%s/execute", orderID), token, nil)
		if recExec.Code != http.StatusOK {
			t.Fatalf("Stage 7 EXECUTION: failed to execute PE order: code=%d res=%v", recExec.Code, resExec)
		}
	}

	// 8. TRADE & 9. POSITION
	trades := fetchTrades(t, env, token)
	if len(trades) != 1 {
		t.Fatalf("Stage 8 TRADE: expected 1 trade, got %d", len(trades))
	}
	positions := fetchPositions(t, env, token)
	if len(positions) != 1 || positions[0].Quantity != 25 {
		t.Fatalf("Stage 9 POSITION: unexpected position: %v", positions)
	}

	// Wallet cash debited by 375,000 paise; blocked = 0
	walletMid := fetchWallet(t, env, token)
	if walletMid.CashBalancePaise != 99625000 || walletMid.BlockedPaise != 0 {
		t.Fatalf("expected cash=99625000, blocked=0, got cash=%d, blocked=%d",
			walletMid.CashBalancePaise, walletMid.BlockedPaise)
	}

	// 10. P&L (Simulate market drop so Put rallies to ₹250.00 = 25,000 paise)
	env.setQuote(peSymbol, 25000)
	positionsAfter := fetchPositions(t, env, token)
	expectedPnl := int64(25 * (25000 - 15000)) // +250,000 paise (+₹2,500)
	if positionsAfter[0].UnrealizedPnlPaise != expectedPnl {
		t.Fatalf("Stage 10 P&L: expected put gain %d paise, got %d", expectedPnl, positionsAfter[0].UnrealizedPnlPaise)
	}

	// 11. WALLET LEDGER
	_ = fetchLedgerStatement(t, env, token)

	// 12. SQUARE OFF (F&O PE SELL MARKET 25 units at 25,000 paise: proceeds = 625,000 paise)
	sellReq := orderDTO.CreateOrderRequest{
		Symbol:   peSymbol,
		Side:     model.OrderSideSell,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductFNO,
		Quantity: 25,
	}
	recSell, resSell := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, sellReq)
	if recSell.Code != http.StatusCreated {
		t.Fatalf("Stage 12 SQUARE OFF: failed to sell PE: code=%d res=%v", recSell.Code, resSell)
	}

	// Position flat
	positionsFinal := fetchPositions(t, env, token)
	for _, p := range positionsFinal {
		if p.Symbol == peSymbol && p.Quantity != 0 {
			t.Fatalf("Stage 12 SQUARE OFF: position still open: %v", p)
		}
	}

	// 13. FINAL BALANCE (Cash = 100,000,000 - 375,000 + 625,000 = 100,250,000 paise)
	finalWallet := fetchWallet(t, env, token)
	expectedFinalCash := int64(100250000)
	if finalWallet.CashBalancePaise != expectedFinalCash || finalWallet.BlockedPaise != 0 {
		t.Fatalf("Stage 13 FINAL BALANCE: expected cash=%d, blocked=0, got cash=%d, blocked=%d",
			expectedFinalCash, finalWallet.CashBalancePaise, finalWallet.BlockedPaise)
	}
}

// -----------------------------------------------------------------------------
// Test 10: Complete Trading Lifecycle — F&O (Options) PE SELL (Short Put Writing) -> BUY TO COVER
// -----------------------------------------------------------------------------
func TestTradingLifecycle_FNO_Option_PE_ShortWriting_BuyToCover(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	userEmail := "lifecycle_fno_pe_short@example.com"
	defer env.deleteUser(userEmail)

	// 1. REGISTER & 2. LOGIN
	token := registerAndLoginUser(t, env, userEmail, "Password@123", "PE Short Trader")

	// 3. WALLET (100,000,000 paise)
	initialWallet := fetchWallet(t, env, token)
	if initialWallet.CashBalancePaise != 100000000 {
		t.Fatalf("wallet init cash mismatch: %d", initialWallet.CashBalancePaise)
	}

	// 4. INSTRUMENT & 5. QUOTE (NIFTY 25000 PE at ₹150.00 = 15,000 paise premium)
	peSymbol := "NIFTY 25000 PE"
	env.setQuote(peSymbol, 15000)

	// 6. ORDER & 7. EXECUTION (F&O PE SELL MARKET 25 units [1 lot])
	// Short Put: Margin blocked = 30% of (25 * 15,000 = 375,000) = 112,500 paise
	// Full premium is CREDITED immediately = 25 * 15,000 = +375,000 paise
	orderReq := orderDTO.CreateOrderRequest{
		Symbol:   peSymbol,
		Side:     model.OrderSideSell,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductFNO,
		Quantity: 25,
	}
	recOrd, resOrd := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, orderReq)
	if recOrd.Code != http.StatusCreated {
		t.Fatalf("Stage 6 ORDER: failed to short write PE: code=%d res=%v", recOrd.Code, resOrd)
	}

	// 8. TRADE & 9. POSITION (Quantity = -25)
	positions := fetchPositions(t, env, token)
	if len(positions) != 1 || positions[0].Quantity != -25 {
		t.Fatalf("Stage 9 POSITION: expected short put qty=-25, got %v", positions)
	}

	// Verify wallet: Cash credited by 375,000 -> 100,375,000 paise, Margin blocked = 112,500 paise
	walletMid := fetchWallet(t, env, token)
	expectedCashMid := int64(100375000)
	if walletMid.CashBalancePaise != expectedCashMid || walletMid.BlockedPaise != 112500 {
		t.Fatalf("expected cash=%d, blocked=112500, got cash=%d, blocked=%d",
			expectedCashMid, walletMid.CashBalancePaise, walletMid.BlockedPaise)
	}

	// 10. P&L (Simulate market rally so Put decays to ₹50.00 = 5,000 paise)
	// Short put gain: (15,000 - 5,000) * 25 = +250,000 paise (+₹2,500)
	env.setQuote(peSymbol, 5000)
	positionsAfter := fetchPositions(t, env, token)
	expectedPnl := int64(25 * (15000 - 5000))
	if positionsAfter[0].UnrealizedPnlPaise != expectedPnl {
		t.Fatalf("Stage 10 P&L: expected put decay gain %d paise, got %d", expectedPnl, positionsAfter[0].UnrealizedPnlPaise)
	}

	// 11. WALLET LEDGER
	_ = fetchLedgerStatement(t, env, token)

	// 12. SQUARE OFF (BUY TO COVER 25 units at market: cost = 25 * 5,000 = 125,000 paise)
	coverReq := orderDTO.CreateOrderRequest{
		Symbol:   peSymbol,
		Side:     model.OrderSideBuy,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductFNO,
		Quantity: 25,
	}
	recCover, resCover := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, coverReq)
	if recCover.Code != http.StatusCreated {
		t.Fatalf("Stage 12 SQUARE OFF: failed to cover short PE: code=%d res=%v", recCover.Code, resCover)
	}

	// Position flat
	positionsFinal := fetchPositions(t, env, token)
	for _, p := range positionsFinal {
		if p.Symbol == peSymbol && p.Quantity != 0 {
			t.Fatalf("Stage 12 SQUARE OFF: position still open: %v", p)
		}
	}

	// 13. FINAL BALANCE (All margin unblocked; cash = 100,375,000 - 125,000 = 100,250,000 paise)
	finalWallet := fetchWallet(t, env, token)
	expectedFinalCash := int64(100250000)
	if finalWallet.CashBalancePaise != expectedFinalCash || finalWallet.BlockedPaise != 0 {
		t.Fatalf("Stage 13 FINAL BALANCE: expected cash=%d, blocked=0, got cash=%d, blocked=%d",
			expectedFinalCash, finalWallet.CashBalancePaise, finalWallet.BlockedPaise)
	}
}
