package router

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	orderDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	portfolioDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/portfolio/dto"
	reportsDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/reports/dto"
	tradeDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/trade/dto"
)

func TestPhase10_PortfolioValuation_BalanceSheetEquality(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	userEmail := "phase10_accounting_user@example.com"
	defer env.deleteUser(userEmail)

	token := registerAndLoginUser(t, env, userEmail, "Password@123", "Phase 10 Auditor")

	// 1. Initial wallet state check: ₹10,00,000 (100,000,000 paise)
	initialWallet := fetchWallet(t, env, token)
	if initialWallet.CashBalancePaise != 100000000 {
		t.Fatalf("expected initial cash 100,000,000 paise, got %d", initialWallet.CashBalancePaise)
	}

	// 2. Initial ledger statement check: 1 entry (INITIAL_CREDIT)
	initialLedger := fetchLedgerStatement(t, env, token)
	if initialLedger.OpeningBalancePaise != 100000000 && initialLedger.OpeningBalancePaise != 0 {
		t.Errorf("unexpected opening balance: %d", initialLedger.OpeningBalancePaise)
	}
	if initialLedger.ClosingBalancePaise != 100000000 {
		t.Errorf("expected closing balance 100,000,000 paise, got %d", initialLedger.ClosingBalancePaise)
	}

	// 3. Set quote and execute BUY order: 20 shares of TCS @ ₹3,000 = 300,000 paise
	symbol := "TCS"
	buyPrice := int64(300000)
	env.setQuote(symbol, buyPrice)

	buyReq := orderDTO.CreateOrderRequest{
		Symbol:   symbol,
		Side:     model.OrderSideBuy,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductDelivery,
		Quantity: 20,
	}
	rec, res := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, buyReq)
	if rec.Code != http.StatusCreated {
		t.Fatalf("failed to create BUY order: code=%d res=%v", rec.Code, res)
	}

	// 4. Verify position created with exact cost basis
	positions := fetchPositions(t, env, token)
	if len(positions) != 1 {
		t.Fatalf("expected 1 position, got %d", len(positions))
	}
	pos := positions[0]
	if pos.Quantity != 20 {
		t.Errorf("expected quantity 20, got %d", pos.Quantity)
	}
	if pos.AveragePricePaise != buyPrice {
		t.Errorf("expected avg price %d, got %d", buyPrice, pos.AveragePricePaise)
	}
	expectedInvested := int64(20) * buyPrice
	if pos.InvestedValuePaise != expectedInvested {
		t.Errorf("expected invested value %d, got %d", expectedInvested, pos.InvestedValuePaise)
	}

	// 5. Update market quote to ₹3,200 (+₹200/share gain)
	newMarketPrice := int64(320000)
	env.setQuote(symbol, newMarketPrice)

	// 6. Fetch portfolio and verify balance sheet equality:
	// Cash + Invested + Unrealized P&L = Total Portfolio Value
	rec, res = sendRequest(env.router, http.MethodGet, "/api/v1/portfolio", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/portfolio failed: code=%d res=%v", rec.Code, res)
	}
	dataBytes, _ := json.Marshal(res["data"])
	var portfolio portfolioDTO.PortfolioResponse
	_ = json.Unmarshal(dataBytes, &portfolio)

	currentWallet := fetchWallet(t, env, token)

	expectedUnrealized := int64(20) * (newMarketPrice - buyPrice) // 20 * 20,000 = 400,000 paise (+₹4,000)
	expectedCurrentVal := int64(20) * newMarketPrice              // 20 * 320,000 = 6,400,000 paise (₹64,000)

	if portfolio.InvestedValuePaise != expectedInvested {
		t.Errorf("expected portfolio invested value %d, got %d", expectedInvested, portfolio.InvestedValuePaise)
	}
	if portfolio.CurrentValuePaise != expectedCurrentVal {
		t.Errorf("expected portfolio current value %d, got %d", expectedCurrentVal, portfolio.CurrentValuePaise)
	}
	if portfolio.UnrealizedPnlPaise != expectedUnrealized {
		t.Errorf("expected unrealized P&L %d, got %d", expectedUnrealized, portfolio.UnrealizedPnlPaise)
	}

	// Invariant 1: Position Invested + Unrealized = Current Value
	if portfolio.InvestedValuePaise+portfolio.UnrealizedPnlPaise != portfolio.CurrentValuePaise {
		t.Fatalf("BALANCE SHEET DRIFT: Invested (%d) + Unrealized (%d) != Current Value (%d)",
			portfolio.InvestedValuePaise, portfolio.UnrealizedPnlPaise, portfolio.CurrentValuePaise)
	}

	// Invariant 2: Total Portfolio Value = Cash + Invested + Unrealized P&L
	totalPortfolioValue := currentWallet.CashBalancePaise + portfolio.InvestedValuePaise + portfolio.UnrealizedPnlPaise
	expectedTotalValue := currentWallet.CashBalancePaise + portfolio.CurrentValuePaise
	if totalPortfolioValue != expectedTotalValue {
		t.Fatalf("TOTAL VALUATION DRIFT: Cash+Invested+Unrealized (%d) != Cash+Current (%d)",
			totalPortfolioValue, expectedTotalValue)
	}
}

func TestPhase10_ContractNote_StatutoryCharges(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	userEmail := "phase10_contractnote_user@example.com"
	defer env.deleteUser(userEmail)

	token := registerAndLoginUser(t, env, userEmail, "Password@123", "Contract Note Auditor")

	// Execute 1 Delivery trade: 100 shares of INFY @ ₹1,500 = 150,000 paise
	symbol := "INFY"
	pricePaise := int64(150000)
	env.setQuote(symbol, pricePaise)

	orderReq := orderDTO.CreateOrderRequest{
		Symbol:     symbol,
		Side:       model.OrderSideBuy,
		Type:       model.OrderTypeLimit,
		PricePaise: pricePaise,
		Product:    model.OrderProductDelivery,
		Quantity:   100,
	}
	rec, res := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, orderReq)
	if rec.Code != http.StatusCreated {
		t.Fatalf("failed to create order: code=%d res=%v", rec.Code, res)
	}

	// Fetch Contract Note
	todayStr := time.Now().Format("2006-01-02")
	rec, res = sendRequest(env.router, http.MethodGet, "/api/v1/reports/contract-note?date="+todayStr, token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/reports/contract-note failed: code=%d res=%v", rec.Code, res)
	}

	dataBytes, _ := json.Marshal(res["data"])
	var note reportsDTO.ContractNoteResponse
	_ = json.Unmarshal(dataBytes, &note)

	if note.Exchange != "NSE / NFO" {
		t.Errorf("expected exchange NSE / NFO, got %s", note.Exchange)
	}
	if len(note.Items) != 1 {
		t.Fatalf("expected 1 trade in contract note, got %d", len(note.Items))
	}

	item := note.Items[0]
	if item.Symbol != symbol {
		t.Errorf("expected symbol %s, got %s", symbol, item.Symbol)
	}
	if item.Quantity != 100 {
		t.Errorf("expected quantity 100, got %d", item.Quantity)
	}
	expectedTurnover := int64(100) * pricePaise // 15,000,000 paise (₹1,50,000)
	if item.GrossTotalPaise != expectedTurnover {
		t.Errorf("expected gross turnover %d, got %d", expectedTurnover, item.GrossTotalPaise)
	}

	// Verify statutory charges precision:
	// Delivery brokerage: 0
	if item.Charges.BrokeragePaise != 0 {
		t.Errorf("expected 0 delivery brokerage, got %d", item.Charges.BrokeragePaise)
	}
	// STT: 0.1% of 15,000,000 = 15,000 paise (₹150.00)
	if item.Charges.SttPaise != 15000 {
		t.Errorf("expected 15000 paise STT, got %d", item.Charges.SttPaise)
	}
	// Stamp duty: 0.015% of 15,000,000 = 2,250 paise (₹22.50)
	if item.Charges.StampDutyPaise != 2250 {
		t.Errorf("expected 2250 paise stamp duty, got %d", item.Charges.StampDutyPaise)
	}
	// Net obligation = GrossTotalPaise + TotalTaxChargesPaise
	if item.NetObligationPaise != item.GrossTotalPaise+item.Charges.TotalTaxChargesPaise {
		t.Errorf("obligation mismatch: %d != %d + %d",
			item.NetObligationPaise, item.GrossTotalPaise, item.Charges.TotalTaxChargesPaise)
	}
}

func TestPhase10_PartialUnwinding_CostBasisPreservation(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	userEmail := "phase10_unwinding_user@example.com"
	defer env.deleteUser(userEmail)

	token := registerAndLoginUser(t, env, userEmail, "Password@123", "Unwinding Auditor")

	symbol := "TCS"
	buyPrice := int64(300000) // ₹3,000
	env.setQuote(symbol, buyPrice)

	// Buy 20 shares @ ₹3,000
	buyReq := orderDTO.CreateOrderRequest{
		Symbol:   symbol,
		Side:     model.OrderSideBuy,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductDelivery,
		Quantity: 20,
	}
	rec, res := sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, buyReq)
	if rec.Code != http.StatusCreated {
		t.Fatalf("failed to create BUY order: code=%d res=%v", rec.Code, res)
	}

	// Move price to ₹3,500 and partially sell 10 shares LIMIT at ₹3,500
	sellPrice := int64(350000)
	env.setQuote(symbol, sellPrice)

	sellReq := orderDTO.CreateOrderRequest{
		Symbol:     symbol,
		Side:       model.OrderSideSell,
		Type:       model.OrderTypeLimit,
		Product:    model.OrderProductDelivery,
		Quantity:   10,
		PricePaise: sellPrice,
	}
	rec, res = sendRequest(env.router, http.MethodPost, "/api/v1/orders", token, sellReq)
	if rec.Code != http.StatusCreated {
		t.Fatalf("failed to create SELL order: code=%d res=%v", rec.Code, res)
	}

	// Check position after partial unwinding
	positions := fetchPositions(t, env, token)
	if len(positions) != 1 {
		t.Fatalf("expected 1 position, got %d", len(positions))
	}
	pos := positions[0]
	if pos.Quantity != 10 {
		t.Errorf("expected remaining quantity 10, got %d", pos.Quantity)
	}
	// Cost basis preservation: remaining 10 units MUST keep the original average price of ₹3,000
	if pos.AveragePricePaise != buyPrice {
		t.Fatalf("COST BASIS DRIFT: expected average price %d, got %d", buyPrice, pos.AveragePricePaise)
	}
	expectedRemainingInvested := int64(10) * buyPrice
	if pos.InvestedValuePaise != expectedRemainingInvested {
		t.Fatalf("COST BASIS DRIFT: expected invested value %d, got %d", expectedRemainingInvested, pos.InvestedValuePaise)
	}
	// Realized P&L from sold 10 units: 10 * (3,500 - 3,000) = 500,000 paise (+₹5,000)
	expectedRealized := int64(10) * (sellPrice - buyPrice)
	if pos.RealizedPnlPaise != expectedRealized {
		t.Errorf("expected realized P&L %d, got %d", expectedRealized, pos.RealizedPnlPaise)
	}

	// Verify ledger statement holds double-entry integrity
	ledger := fetchLedgerStatement(t, env, token)
	if ledger.OpeningBalancePaise+ledger.TotalCreditPaise-ledger.TotalDebitPaise != ledger.ClosingBalancePaise {
		t.Fatalf("DOUBLE-ENTRY LEDGER DESYNC: Opening (%d) + Credits (%d) - Debits (%d) != Closing (%d)",
			ledger.OpeningBalancePaise, ledger.TotalCreditPaise, ledger.TotalDebitPaise, ledger.ClosingBalancePaise)
	}
	wallet := fetchWallet(t, env, token)
	if ledger.ClosingBalancePaise != wallet.CashBalancePaise {
		t.Fatalf("LEDGER VS WALLET CASH DESYNC: Ledger closing (%d) != Wallet cash (%d)",
			ledger.ClosingBalancePaise, wallet.CashBalancePaise)
	}
}

func TestPhase10_TradeJournaling_SecurityIsolation(t *testing.T) {
	env := setupTradingLifecycleEnv(t)
	defer env.cleanup()

	userEmailA := "phase10_journal_a@example.com"
	userEmailB := "phase10_journal_b@example.com"
	defer env.deleteUser(userEmailA)
	defer env.deleteUser(userEmailB)

	tokenA := registerAndLoginUser(t, env, userEmailA, "Password@123", "Trader Alpha")
	tokenB := registerAndLoginUser(t, env, userEmailB, "Password@123", "Trader Beta")

	// User A executes a trade
	symbol := "INFY"
	env.setQuote(symbol, 150000)
	orderReq := orderDTO.CreateOrderRequest{
		Symbol:   symbol,
		Side:     model.OrderSideBuy,
		Type:     model.OrderTypeMarket,
		Product:  model.OrderProductDelivery,
		Quantity: 5,
	}
	rec, res := sendRequest(env.router, http.MethodPost, "/api/v1/orders", tokenA, orderReq)
	if rec.Code != http.StatusCreated {
		t.Fatalf("failed to create order for User A: code=%d res=%v", rec.Code, res)
	}

	tradesA := fetchTrades(t, env, tokenA)
	if len(tradesA) == 0 {
		t.Fatalf("expected at least 1 trade for User A")
	}
	tradeUUID, ok := tradesA[0]["uuid"].(string)
	if !ok || tradeUUID == "" {
		t.Fatalf("missing trade UUID in trade response")
	}

	// User A updates their journal
	tag := "#GapUpReversal"
	notes := "Bought on support bounce with confirmation candle"
	patchReq := tradeDTO.UpdateJournalRequest{
		Tag:   tag,
		Notes: notes,
	}
	rec, res = sendRequest(env.router, http.MethodPatch, fmt.Sprintf("/api/v1/trades/%s/journal", tradeUUID), tokenA, patchReq)
	if rec.Code != http.StatusOK {
		t.Fatalf("PATCH journal failed: code=%d res=%v", rec.Code, res)
	}

	// Verify journal persisted for User A
	tradesAfter := fetchTrades(t, env, tokenA)
	if tradesAfter[0]["tag"] != tag || tradesAfter[0]["notes"] != notes {
		t.Errorf("journal update did not persist: tag=%v notes=%v", tradesAfter[0]["tag"], tradesAfter[0]["notes"])
	}

	// Security Isolation: User B attempts to overwrite User A's trade journal
	attackReq := tradeDTO.UpdateJournalRequest{
		Tag:   "#MaliciousTag",
		Notes: "Unauthorized intrusion attempt",
	}
	recAttack, resAttack := sendRequest(env.router, http.MethodPatch, fmt.Sprintf("/api/v1/trades/%s/journal", tradeUUID), tokenB, attackReq)
	if recAttack.Code != http.StatusNotFound {
		t.Fatalf("SECURITY FAILURE: User B was able to modify or did not receive 404 for User A's trade: code=%d res=%v",
			recAttack.Code, resAttack)
	}

	// Verify User A's journal remains uncorrupted
	tradesCheck := fetchTrades(t, env, tokenA)
	if tradesCheck[0]["tag"] != tag || tradesCheck[0]["notes"] != notes {
		t.Fatalf("CORRUPTION DETECTED: User A's trade journal was modified by User B!")
	}

	// Malformed UUID test: returns 400 Bad Request
	recBad, _ := sendRequest(env.router, http.MethodPatch, "/api/v1/trades/not-a-valid-uuid/journal", tokenA, patchReq)
	if recBad.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for malformed UUID, got %d", recBad.Code)
	}
}
