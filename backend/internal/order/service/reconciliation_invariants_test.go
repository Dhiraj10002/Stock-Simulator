package service

import (
	"strings"
	"sync"
	"testing"

	marketDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	orderDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// verifyLedgerInvariants checks:
// 1. Initial cash + sum of all credits - sum of all debits == current CashBalancePaise.
// 2. All executed orders have a corresponding Trade record with identical execution price, quantity, and total.
// 3. Blocked paise is never negative and never exceeds cash balance.
func verifyLedgerInvariants(t *testing.T, db *gorm.DB, userUUID uuid.UUID, initialCash int64) {
	t.Helper()

	var wallet model.Wallet
	if err := db.Where("user_uuid = ?", userUUID).First(&wallet).Error; err != nil {
		t.Fatalf("verifyLedger: wallet not found: %v", err)
	}

	if wallet.BlockedPaise < 0 {
		t.Fatalf("INVARIANT VIOLATION: BlockedPaise is negative (%d)", wallet.BlockedPaise)
	}
	if wallet.BlockedPaise > wallet.CashBalancePaise {
		t.Fatalf("INVARIANT VIOLATION: BlockedPaise (%d) exceeds CashBalancePaise (%d)", wallet.BlockedPaise, wallet.CashBalancePaise)
	}

	var txs []model.WalletTransaction
	if err := db.Where("wallet_uuid = ?", wallet.UUID).Order("created_at ASC, id ASC").Find(&txs).Error; err != nil {
		t.Fatalf("verifyLedger: find transactions: %v", err)
	}

	computedCash := initialCash
	for _, tx := range txs {
		amt := tx.AmountPaise
		if amt < 0 {
			amt = -amt
		}
		switch tx.Type {
		case model.WalletTransactionCredit:
			computedCash += amt
		case model.WalletTransactionDebit:
			computedCash -= amt
		case model.WalletTransactionReserve, model.WalletTransactionRelease:
			// Balance locks do not move actual cash
		}
	}

	if computedCash != wallet.CashBalancePaise {
		t.Fatalf("LEDGER MISMATCH: computed cash from ledger (%d) != wallet cash (%d)", computedCash, wallet.CashBalancePaise)
	}

	// Verify all executed orders have a matching Trade
	var orders []model.Order
	if err := db.Where("user_uuid = ? AND status = ?", userUUID, model.OrderStatusExecuted).Find(&orders).Error; err != nil {
		t.Fatalf("verifyLedger: find orders: %v", err)
	}

	for _, o := range orders {
		var tr model.Trade
		if err := db.Where("order_uuid = ?", o.UUID).First(&tr).Error; err != nil {
			t.Fatalf("ORDER-TRADE MISMATCH: executed order %s has no trade: %v", o.UUID, err)
		}
		if tr.Quantity != o.Quantity || tr.PricePaise != o.ExecutedPricePaise || tr.TotalPaise != o.Quantity*o.ExecutedPricePaise {
			t.Fatalf("ORDER-TRADE INCONSISTENCY: order(qty=%d, price=%d) vs trade(qty=%d, price=%d, total=%d)",
				o.Quantity, o.ExecutedPricePaise, tr.Quantity, tr.PricePaise, tr.TotalPaise)
		}
	}
}

func ensureInstrumentExists(t *testing.T, db *gorm.DB, symbol, instType string) {
	t.Helper()
	var inst model.Instrument
	if err := db.Where("symbol = ?", symbol).First(&inst).Error; err != nil {
		inst = model.Instrument{
			Token:           uuid.NewString()[:16],
			Symbol:          symbol,
			ExchangeSegment: "NSE",
			InstrumentType:  instType,
			LotSize:         1,
			Active:          true,
		}
		if err := db.Create(&inst).Error; err != nil {
			t.Fatalf("create instrument: %v", err)
		}
	}
}

// 1. Long Delivery Round Trip: Buy, Sell, Ledger Continuity, Zero Position, Exact P&L
func TestReconciliation_LongDeliveryRoundTrip(t *testing.T) {
	db := accountingDB(t)
	w := accountingWallet(t, db)
	s := accountingService()
	symbol := "TCS"
	ensureInstrumentExists(t, db, symbol, "EQUITY")

	initialCash := w.CashBalancePaise

	// Buy 100 shares at Rs 3500.00 quote
	buyTrade := accountingFill(t, db, s, w, symbol, model.OrderProductDelivery, model.OrderSideBuy, 100, 350000)

	var pos model.Position
	if err := db.Where("user_uuid = ? AND symbol = ? AND product = ?", w.UserUUID, symbol, model.OrderProductDelivery).First(&pos).Error; err != nil {
		t.Fatalf("position not found: %v", err)
	}
	if pos.Quantity != 100 || pos.AveragePricePaise != buyTrade.PricePaise || pos.CostBasisPaise != buyTrade.TotalPaise {
		t.Fatalf("unexpected position after buy: %+v vs trade %+v", pos, buyTrade)
	}

	verifyLedgerInvariants(t, db, w.UserUUID, initialCash)

	// Sell 100 shares at Rs 3600.00 quote
	sellTrade := accountingFill(t, db, s, w, symbol, model.OrderProductDelivery, model.OrderSideSell, 100, 360000)

	if err := db.Where("user_uuid = ? AND symbol = ? AND product = ?", w.UserUUID, symbol, model.OrderProductDelivery).First(&pos).Error; err != nil {
		t.Fatalf("position query error: %v", err)
	}
	expectedPnL := sellTrade.TotalPaise - buyTrade.TotalPaise
	if pos.Quantity != 0 || pos.CostBasisPaise != 0 || pos.RealizedPnlPaise != expectedPnL {
		t.Fatalf("unexpected position after round trip: %+v, expected PnL=%d", pos, expectedPnL)
	}

	var finalWallet model.Wallet
	if err := db.First(&finalWallet, w.ID).Error; err != nil {
		t.Fatalf("wallet query: %v", err)
	}
	expectedCash := initialCash + expectedPnL
	if finalWallet.CashBalancePaise != expectedCash || finalWallet.BlockedPaise != 0 {
		t.Fatalf("wallet mismatch: expected cash %d, got %d, blocked %d", expectedCash, finalWallet.CashBalancePaise, finalWallet.BlockedPaise)
	}

	verifyLedgerInvariants(t, db, w.UserUUID, initialCash)
}

// 2. Short Intraday Round Trip: Sell short, Buy to cover, Margin release, Ledger Continuity
func TestReconciliation_ShortIntradayRoundTrip(t *testing.T) {
	db := accountingDB(t)
	w := accountingWallet(t, db)
	s := accountingService()
	symbol := "INFY"
	ensureInstrumentExists(t, db, symbol, "EQUITY")

	initialCash := w.CashBalancePaise

	// Sell short 50 shares MIS at Rs 1500.00 quote
	shortTrade := accountingFill(t, db, s, w, symbol, model.OrderProductIntraday, model.OrderSideSell, 50, 150000)

	var pos model.Position
	if err := db.Where("user_uuid = ? AND symbol = ? AND product = ?", w.UserUUID, symbol, model.OrderProductIntraday).First(&pos).Error; err != nil {
		t.Fatalf("position not found: %v", err)
	}
	if pos.Quantity != -50 || pos.AveragePricePaise != shortTrade.PricePaise {
		t.Fatalf("unexpected short position: %+v vs trade %+v", pos, shortTrade)
	}
	// MIS leverage is 5 -> 20% margin blocked = (50 * shortTrade.PricePaise) / 5
	expectedMargin := shortTrade.TotalPaise / 5
	if pos.MarginBlockedPaise != expectedMargin {
		t.Fatalf("margin blocked expected %d, got %d", expectedMargin, pos.MarginBlockedPaise)
	}

	var midWallet model.Wallet
	if err := db.First(&midWallet, w.ID).Error; err != nil {
		t.Fatalf("wallet query: %v", err)
	}
	if midWallet.BlockedPaise != expectedMargin || midWallet.CashBalancePaise != initialCash {
		t.Fatalf("wallet during short: blocked=%d (exp %d), cash=%d (exp %d)", midWallet.BlockedPaise, expectedMargin, midWallet.CashBalancePaise, initialCash)
	}

	verifyLedgerInvariants(t, db, w.UserUUID, initialCash)

	// Buy to cover 50 shares MIS at Rs 1450.00 quote
	coverTrade := accountingFill(t, db, s, w, symbol, model.OrderProductIntraday, model.OrderSideBuy, 50, 145000)

	if err := db.Where("user_uuid = ? AND symbol = ? AND product = ?", w.UserUUID, symbol, model.OrderProductIntraday).First(&pos).Error; err != nil {
		t.Fatalf("position query error: %v", err)
	}
	expectedPnL := shortTrade.TotalPaise - coverTrade.TotalPaise
	if pos.Quantity != 0 || pos.MarginBlockedPaise != 0 || pos.RealizedPnlPaise != expectedPnL {
		t.Fatalf("unexpected position after cover: %+v, expected PnL=%d", pos, expectedPnL)
	}

	var finalWallet model.Wallet
	if err := db.First(&finalWallet, w.ID).Error; err != nil {
		t.Fatalf("wallet query: %v", err)
	}
	expectedCash := initialCash + expectedPnL
	if finalWallet.CashBalancePaise != expectedCash || finalWallet.BlockedPaise != 0 {
		t.Fatalf("final wallet mismatch: cash=%d (exp %d), blocked=%d", finalWallet.CashBalancePaise, expectedCash, finalWallet.BlockedPaise)
	}

	verifyLedgerInvariants(t, db, w.UserUUID, initialCash)
}

// 3. Partial Close with Fractional / Proportional Cost Basis Precision
func TestReconciliation_PartialCloseWithResidualPrecision(t *testing.T) {
	db := accountingDB(t)
	w := accountingWallet(t, db)
	s := accountingService()
	symbol := "HDFCBANK"
	ensureInstrumentExists(t, db, symbol, "EQUITY")

	initialCash := w.CashBalancePaise

	// Buy 100 shares at Rs 163.33 quote
	buyTrade := accountingFill(t, db, s, w, symbol, model.OrderProductDelivery, model.OrderSideBuy, 100, 16333)

	// Partial sale 1: 33 shares at Rs 170.00 quote
	sellTrade1 := accountingFill(t, db, s, w, symbol, model.OrderProductDelivery, model.OrderSideSell, 33, 17000)

	var pos model.Position
	if err := db.Where("user_uuid = ? AND symbol = ? AND product = ?", w.UserUUID, symbol, model.OrderProductDelivery).First(&pos).Error; err != nil {
		t.Fatalf("position query: %v", err)
	}
	if pos.Quantity != 67 {
		t.Fatalf("expected quantity 67, got %d", pos.Quantity)
	}

	verifyLedgerInvariants(t, db, w.UserUUID, initialCash)

	// Partial sale 2: remaining 67 shares at Rs 180.00 quote
	sellTrade2 := accountingFill(t, db, s, w, symbol, model.OrderProductDelivery, model.OrderSideSell, 67, 18000)

	if err := db.Where("user_uuid = ? AND symbol = ? AND product = ?", w.UserUUID, symbol, model.OrderProductDelivery).First(&pos).Error; err != nil {
		t.Fatalf("position query: %v", err)
	}
	if pos.Quantity != 0 || pos.CostBasisPaise != 0 || pos.AveragePricePaise != 0 {
		t.Fatalf("final position not completely cleared: %+v", pos)
	}

	// Net cash gain = sellTrade1.TotalPaise + sellTrade2.TotalPaise - buyTrade.TotalPaise
	netGain := sellTrade1.TotalPaise + sellTrade2.TotalPaise - buyTrade.TotalPaise
	expectedCash := initialCash + netGain
	var finalWallet model.Wallet
	if err := db.First(&finalWallet, w.ID).Error; err != nil {
		t.Fatalf("wallet query: %v", err)
	}
	if finalWallet.CashBalancePaise != expectedCash || finalWallet.BlockedPaise != 0 {
		t.Fatalf("residual mismatch: expected cash %d, got %d, blocked %d", expectedCash, finalWallet.CashBalancePaise, finalWallet.BlockedPaise)
	}

	verifyLedgerInvariants(t, db, w.UserUUID, initialCash)
}

// 4. Position Reversal Across Zero: +50 Long -> Sell 70 -> Net -20 Short
func TestReconciliation_PositionReversalAcrossZero(t *testing.T) {
	db := accountingDB(t)
	w := accountingWallet(t, db)
	s := accountingService()
	symbol := "SBIN"
	ensureInstrumentExists(t, db, symbol, "EQUITY")

	initialCash := w.CashBalancePaise

	// Step 1: Open +50 long MIS at Rs 800.00 quote
	t1 := accountingFill(t, db, s, w, symbol, model.OrderProductIntraday, model.OrderSideBuy, 50, 80000)

	var pos model.Position
	if err := db.Where("user_uuid = ? AND symbol = ? AND product = ?", w.UserUUID, symbol, model.OrderProductIntraday).First(&pos).Error; err != nil {
		t.Fatalf("pos query: %v", err)
	}
	if pos.Quantity != 50 || pos.AveragePricePaise != t1.PricePaise {
		t.Fatalf("expected +50 pos: %+v", pos)
	}

	// Step 2: Sell 70 shares at Rs 850.00 quote
	// Closes 50 shares long (realizing (t2.PricePaise - t1.PricePaise)*50 profit)
	// and flips net position to -20 shares short opened at t2.PricePaise
	t2 := accountingFill(t, db, s, w, symbol, model.OrderProductIntraday, model.OrderSideSell, 70, 85000)

	if err := db.Where("user_uuid = ? AND symbol = ? AND product = ?", w.UserUUID, symbol, model.OrderProductIntraday).First(&pos).Error; err != nil {
		t.Fatalf("pos query: %v", err)
	}
	if pos.Quantity != -20 {
		t.Fatalf("expected reversed position -20, got %d", pos.Quantity)
	}
	if pos.AveragePricePaise != t2.PricePaise {
		t.Fatalf("expected new average price %d for remaining short, got %d", t2.PricePaise, pos.AveragePricePaise)
	}
	expectedPnl1 := int64(50) * (t2.PricePaise - t1.PricePaise)
	if pos.RealizedPnlPaise != expectedPnl1 {
		t.Fatalf("expected realized PnL %d, got %d", expectedPnl1, pos.RealizedPnlPaise)
	}

	// Expected margin blocked for 20 shares short at t2.PricePaise (with leverage 5):
	expectedMargin := (int64(20) * t2.PricePaise) / 5
	if pos.MarginBlockedPaise != expectedMargin {
		t.Fatalf("expected margin %d, got %d", expectedMargin, pos.MarginBlockedPaise)
	}

	var midWallet model.Wallet
	if err := db.First(&midWallet, w.ID).Error; err != nil {
		t.Fatalf("wallet query: %v", err)
	}
	if midWallet.CashBalancePaise != initialCash+expectedPnl1 || midWallet.BlockedPaise != expectedMargin {
		t.Fatalf("wallet mismatch after reversal: cash=%d, blocked=%d", midWallet.CashBalancePaise, midWallet.BlockedPaise)
	}

	verifyLedgerInvariants(t, db, w.UserUUID, initialCash)

	// Step 3: Buy 20 shares to close the short position at Rs 820.00 quote
	t3 := accountingFill(t, db, s, w, symbol, model.OrderProductIntraday, model.OrderSideBuy, 20, 82000)

	if err := db.Where("user_uuid = ? AND symbol = ? AND product = ?", w.UserUUID, symbol, model.OrderProductIntraday).First(&pos).Error; err != nil {
		t.Fatalf("pos query: %v", err)
	}
	if pos.Quantity != 0 || pos.MarginBlockedPaise != 0 {
		t.Fatalf("position not 0 after covering: %+v", pos)
	}
	expectedPnl2 := int64(20) * (t2.PricePaise - t3.PricePaise)
	totalPnL := expectedPnl1 + expectedPnl2
	if pos.RealizedPnlPaise != totalPnL {
		t.Fatalf("total realized PnL mismatch: expected %d, got %d", totalPnL, pos.RealizedPnlPaise)
	}

	var finalWallet model.Wallet
	if err := db.First(&finalWallet, w.ID).Error; err != nil {
		t.Fatalf("wallet query: %v", err)
	}
	if finalWallet.CashBalancePaise != initialCash+totalPnL || finalWallet.BlockedPaise != 0 {
		t.Fatalf("final wallet mismatch: cash=%d, blocked=%d", finalWallet.CashBalancePaise, finalWallet.BlockedPaise)
	}

	verifyLedgerInvariants(t, db, w.UserUUID, initialCash)
}

// 5. Duplicate Exit Request and Reduce-Only Serialization
func TestReconciliation_DuplicateExitAndReduceOnly(t *testing.T) {
	db := accountingDB(t)
	w := accountingWallet(t, db)
	s := accountingService()
	symbol := "ITC"
	ensureInstrumentExists(t, db, symbol, "EQUITY")

	initialCash := w.CashBalancePaise
	price := int64(45000)

	// Open +20 shares long MIS
	accountingFill(t, db, s, w, symbol, model.OrderProductIntraday, model.OrderSideBuy, 20, price)

	var pos model.Position
	if err := db.Where("user_uuid = ? AND symbol = ? AND product = ?", w.UserUUID, symbol, model.OrderProductIntraday).First(&pos).Error; err != nil {
		t.Fatalf("pos query: %v", err)
	}

	s.SetExecutableQuoteFunc(func(sym string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{Symbol: sym, PricePaise: price}, nil
	})

	// Submit two square-off requests concurrently
	var wg sync.WaitGroup
	type res struct {
		resp *orderDTO.OrderResponse
		err  error
	}
	results := make([]res, 2)
	barrier := make(chan struct{})

	for i := 0; i < 2; i++ {
		wg.Add(1)
		idx := i
		go func() {
			defer wg.Done()
			<-barrier
			resp, err := s.SquareOffPosition(w.UserUUID, pos.UUID)
			results[idx] = res{resp: resp, err: err}
		}()
	}
	close(barrier)
	wg.Wait()

	// Verify position is now exactly 0 and never flipped negative
	if err := db.First(&pos, pos.ID).Error; err != nil {
		t.Fatalf("pos query: %v", err)
	}
	if pos.Quantity != 0 {
		t.Fatalf("expected position quantity to be 0 after square-off, got %d", pos.Quantity)
	}
	if pos.MarginBlockedPaise != 0 {
		t.Fatalf("expected margin to be released to 0, got %d", pos.MarginBlockedPaise)
	}

	verifyLedgerInvariants(t, db, w.UserUUID, initialCash)
}

// 6. Reserved Funds Released Exactly Once on Cancellation & Settlement
func TestReconciliation_ReservedFundsReleasedExactlyOnce(t *testing.T) {
	db := accountingDB(t)
	w := accountingWallet(t, db)
	s := accountingService()
	symbol := "KOTAKBANK"
	ensureInstrumentExists(t, db, symbol, "EQUITY")

	initialCash := w.CashBalancePaise

	// Create BUY limit order at Rs 1800.00 for 10 shares
	// Notional: 10 * 180000 = 1,800,000 paise reserved
	limitPrice := int64(180000)
	req := orderDTO.CreateOrderRequest{
		Symbol:     symbol,
		Product:    model.OrderProductDelivery,
		Side:       model.OrderSideBuy,
		Type:       model.OrderTypeLimit,
		Quantity:   10,
		PricePaise: limitPrice,
	}

	resp, err := s.Create(w.UserUUID.String(), req)
	if err != nil {
		t.Fatalf("order create failed: %v", err)
	}

	var midWallet model.Wallet
	if err := db.First(&midWallet, w.ID).Error; err != nil {
		t.Fatalf("wallet query: %v", err)
	}
	expectedReservation := int64(1800000)
	if midWallet.BlockedPaise != expectedReservation {
		t.Fatalf("expected blocked %d, got %d", expectedReservation, midWallet.BlockedPaise)
	}

	// Cancel order -> Blocked balance must be released back to 0
	if err := s.Cancel(w.UserUUID.String(), resp.UUID); err != nil {
		t.Fatalf("order cancel failed: %v", err)
	}

	var afterCancelWallet model.Wallet
	if err := db.First(&afterCancelWallet, w.ID).Error; err != nil {
		t.Fatalf("wallet query: %v", err)
	}
	if afterCancelWallet.BlockedPaise != 0 || afterCancelWallet.CashBalancePaise != initialCash {
		t.Fatalf("wallet after cancel: blocked=%d, cash=%d", afterCancelWallet.BlockedPaise, afterCancelWallet.CashBalancePaise)
	}

	// Attempt second cancel: must fail and NOT alter wallet balances
	secondCancelErr := s.Cancel(w.UserUUID.String(), resp.UUID)
	if secondCancelErr == nil {
		t.Fatalf("expected second cancel to return error, got nil")
	}

	var finalWallet model.Wallet
	if err := db.First(&finalWallet, w.ID).Error; err != nil {
		t.Fatalf("wallet query: %v", err)
	}
	if finalWallet.BlockedPaise != 0 || finalWallet.CashBalancePaise != initialCash {
		t.Fatalf("double cancel altered wallet balances: blocked=%d, cash=%d", finalWallet.BlockedPaise, finalWallet.CashBalancePaise)
	}

	verifyLedgerInvariants(t, db, w.UserUUID, initialCash)
}

// 7. Failed Execution Preserves Invariants: Limit Unmet Order Does Not Mutate Balances
func TestReconciliation_FailedExecutionPreservesInvariants(t *testing.T) {
	db := accountingDB(t)
	w := accountingWallet(t, db)
	s := accountingService()
	symbol := "BHARTIARTL"
	ensureInstrumentExists(t, db, symbol, "EQUITY")

	initialCash := w.CashBalancePaise

	// Quote is at Rs 1200.00 (120000 paise)
	quotePrice := int64(120000)
	s.SetExecutableQuoteFunc(func(sym string) (*marketDTO.QuoteResponse, error) {
		return &marketDTO.QuoteResponse{Symbol: sym, PricePaise: quotePrice}, nil
	})

	// Order limit is at Rs 1100.00 (BUY limit requires execution price <= 110000, but quote is 120000)
	order := model.Order{
		UserUUID:      w.UserUUID,
		Symbol:        symbol,
		Product:       model.OrderProductDelivery,
		Side:          model.OrderSideBuy,
		Type:          model.OrderTypeLimit,
		Quantity:      10,
		PricePaise:    110000,
		Status:        model.OrderStatusOpen,
		ReservedPaise: 1100000,
	}
	if err := db.Create(&order).Error; err != nil {
		t.Fatal(err)
	}
	w.BlockedPaise = 1100000
	if err := db.Save(&w).Error; err != nil {
		t.Fatal(err)
	}

	// Attempt execute: must fail with limit not satisfied
	err := s.Execute(w.UserUUID.String(), order.UUID.String())
	if err == nil {
		t.Fatalf("expected execute to fail because market price does not satisfy limit, got nil")
	}
	if !strings.Contains(err.Error(), "market price does not satisfy limit") {
		t.Fatalf("expected 'market price does not satisfy limit', got: %v", err)
	}

	// Invariant verification:
	// 1. Order status must remain OPEN
	var o model.Order
	if err := db.First(&o, order.ID).Error; err != nil {
		t.Fatal(err)
	}
	if o.Status != model.OrderStatusOpen {
		t.Fatalf("expected order status to remain OPEN, got %s", o.Status)
	}

	// 2. No Trade record was created
	var tradeCount int64
	if err := db.Model(&model.Trade{}).Where("order_uuid = ?", order.UUID).Count(&tradeCount).Error; err != nil {
		t.Fatal(err)
	}
	if tradeCount != 0 {
		t.Fatalf("expected 0 trades for failed execution, found %d", tradeCount)
	}

	// 3. No WalletTransaction was created
	var txCount int64
	if err := db.Model(&model.WalletTransaction{}).Where("wallet_uuid = ?", w.UUID).Count(&txCount).Error; err != nil {
		t.Fatal(err)
	}
	if txCount != 0 {
		t.Fatalf("expected 0 wallet transactions, found %d", txCount)
	}

	// 4. Wallet cash and blocked remain untouched
	var finalWallet model.Wallet
	if err := db.First(&finalWallet, w.ID).Error; err != nil {
		t.Fatal(err)
	}
	if finalWallet.CashBalancePaise != initialCash || finalWallet.BlockedPaise != 1100000 {
		t.Fatalf("wallet corrupted on failed execution: cash=%d, blocked=%d", finalWallet.CashBalancePaise, finalWallet.BlockedPaise)
	}

	verifyLedgerInvariants(t, db, w.UserUUID, initialCash)
}
