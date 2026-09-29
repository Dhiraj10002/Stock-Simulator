package service

import (
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/testutil"
	"github.com/google/uuid"
)

func TestReportsService_ContractNoteAndLedgerIntegration(t *testing.T) {
	db := testutil.RequireDisposableDB(t)

	// Create test user and wallet
	userUUID := uuid.New()
	user := model.User{
		UUID:  userUUID,
		Email: "reports_test@example.com",
		Name:  "Test Trader",
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	wallet := model.Wallet{
		UUID:             uuid.New(),
		UserUUID:         userUUID,
		CashBalancePaise: 10500000, // Rs 105,000.00
		BlockedPaise:     0,
	}
	if err := db.Create(&wallet).Error; err != nil {
		t.Fatalf("create wallet: %v", err)
	}

	ist := getISTLocation()
	tradeDay := time.Date(2026, 9, 29, 11, 0, 0, 0, ist)
	tradeDayStr := "2026-09-29"

	// 1. Initial deposit of 100,000.00 (10000000 paise)
	t0 := time.Date(2026, 9, 1, 9, 0, 0, 0, ist).UTC()
	tx0 := model.WalletTransaction{
		UUID:         uuid.New(),
		WalletUUID:   wallet.UUID,
		Type:         model.WalletTransactionInitialCredit,
		AmountPaise:  10000000,
		BalancePaise: 10000000,
		BlockedPaise: 0,
		Note:         "Initial deposit",
		CreatedAt:    t0,
	}
	if err := db.Create(&tx0).Error; err != nil {
		t.Fatalf("create tx0: %v", err)
	}

	// 2. Buy trade on tradeDay: BUY 10 RELIANCE at Rs 2,500 = Rs 25,000 (2500000 paise)
	t1 := tradeDay.Add(15 * time.Minute).UTC()
	tradeBuy := model.Trade{
		UUID:             uuid.New(),
		OrderUUID:        uuid.New(),
		UserUUID:         userUUID,
		Symbol:           "RELIANCE",
		Side:             "BUY",
		Product:          "DELIVERY",
		Quantity:         10,
		PricePaise:       250000,
		TotalPaise:       2500000,
		RealizedPnlPaise: 0,
		ExecutedAt:       t1,
	}
	if err := db.Create(&tradeBuy).Error; err != nil {
		t.Fatalf("create tradeBuy: %v", err)
	}
	txBuy := model.WalletTransaction{
		UUID:         uuid.New(),
		WalletUUID:   wallet.UUID,
		Type:         model.WalletTransactionDebit,
		AmountPaise:  2500000,
		BalancePaise: 7500000,
		BlockedPaise: 0,
		Note:         "Order execution [BUY]",
		CreatedAt:    t1,
	}
	if err := db.Create(&txBuy).Error; err != nil {
		t.Fatalf("create txBuy: %v", err)
	}

	// 3. Sell trade on tradeDay: SELL 10 RELIANCE at Rs 3,000 = Rs 30,000 (3000000 paise)
	t2 := tradeDay.Add(45 * time.Minute).UTC()
	tradeSell := model.Trade{
		UUID:             uuid.New(),
		OrderUUID:        uuid.New(),
		UserUUID:         userUUID,
		Symbol:           "RELIANCE",
		Side:             "SELL",
		Product:          "DELIVERY",
		Quantity:         10,
		PricePaise:       300000,
		TotalPaise:       3000000,
		RealizedPnlPaise: 500000,
		ExecutedAt:       t2,
	}
	if err := db.Create(&tradeSell).Error; err != nil {
		t.Fatalf("create tradeSell: %v", err)
	}
	txSell := model.WalletTransaction{
		UUID:         uuid.New(),
		WalletUUID:   wallet.UUID,
		Type:         model.WalletTransactionCredit,
		AmountPaise:  3000000,
		BalancePaise: 10500000,
		BlockedPaise: 0,
		Note:         "Order execution [SELL]",
		CreatedAt:    t2,
	}
	if err := db.Create(&txSell).Error; err != nil {
		t.Fatalf("create txSell: %v", err)
	}

	svc := New()

	// Verify Contract Note
	cn, err := svc.GetContractNote(userUUID.String(), tradeDayStr)
	if err != nil {
		t.Fatalf("GetContractNote failed: %v", err)
	}

	if cn.TradeDate != tradeDayStr {
		t.Errorf("expected trade date %s, got %s", tradeDayStr, cn.TradeDate)
	}
	if cn.ClientName != "Test Trader" {
		t.Errorf("expected client name 'Test Trader', got %s", cn.ClientName)
	}
	if len(cn.Items) != 2 {
		t.Fatalf("expected 2 trades in contract note, got %d", len(cn.Items))
	}
	if cn.TotalBuyTurnoverPaise != 2500000 {
		t.Errorf("expected buy turnover 2500000, got %d", cn.TotalBuyTurnoverPaise)
	}
	if cn.TotalSellTurnoverPaise != 3000000 {
		t.Errorf("expected sell turnover 3000000, got %d", cn.TotalSellTurnoverPaise)
	}
	expectedNetPayout := cn.TotalSellTurnoverPaise - cn.TotalBuyTurnoverPaise - cn.ChargesSummary.TotalTaxChargesPaise
	if cn.NetPayinPayoutPaise != expectedNetPayout {
		t.Errorf("net payin/payout mismatch: expected %d, got %d", expectedNetPayout, cn.NetPayinPayoutPaise)
	}

	// Verify Ledger Statement across entire month (2026-09-01 to 2026-09-30)
	ls, err := svc.GetLedgerStatement(userUUID.String(), "2026-09-01", "2026-09-30")
	if err != nil {
		t.Fatalf("GetLedgerStatement failed: %v", err)
	}

	if len(ls.Entries) != 3 {
		t.Fatalf("expected 3 entries in ledger statement, got %d", len(ls.Entries))
	}
	if ls.OpeningBalancePaise != 0 {
		t.Errorf("expected opening balance 0, got %d", ls.OpeningBalancePaise)
	}
	if ls.TotalCreditPaise != 13000000 { // 10,000,000 deposit + 3,000,000 sell
		t.Errorf("expected total credit 13000000, got %d", ls.TotalCreditPaise)
	}
	if ls.TotalDebitPaise != 2500000 { // 2,500,000 buy
		t.Errorf("expected total debit 2500000, got %d", ls.TotalDebitPaise)
	}
	expectedClosing := ls.OpeningBalancePaise + ls.TotalCreditPaise - ls.TotalDebitPaise
	if ls.ClosingBalancePaise != expectedClosing {
		t.Errorf("balance sheet invariant broken: %d != %d", ls.ClosingBalancePaise, expectedClosing)
	}
	if ls.ClosingBalancePaise != wallet.CashBalancePaise {
		t.Errorf("closing balance (%d) does not match wallet cash balance (%d)", ls.ClosingBalancePaise, wallet.CashBalancePaise)
	}
}
