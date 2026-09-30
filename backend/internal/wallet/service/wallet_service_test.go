package service

import (
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/testutil"
	"github.com/google/uuid"
)

func TestWalletService_Deposit(t *testing.T) {
	db := testutil.RequireDisposableDB(t)
	cfg := &config.Config{InitialVirtualBalancePaise: 100000000}
	svc := New(cfg)

	user := model.User{
		UUID:     uuid.New(),
		Name:     "Deposit Test User",
		Email:    uuid.NewString() + "@example.test",
		Password: "hashedpassword",
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}

	// 1. Rejects zero and negative deposit amounts
	if _, err := svc.Deposit(user.UUID.String(), 0); err == nil {
		t.Fatal("expected error on zero deposit")
	}
	if _, err := svc.Deposit(user.UUID.String(), -50000); err == nil {
		t.Fatal("expected error on negative deposit")
	}

	// 2. Rejects deposit amount exceeding max limit
	if _, err := svc.Deposit(user.UUID.String(), 2000000000); err == nil {
		t.Fatal("expected error on deposit exceeding max limit")
	}

	// 3. Valid deposit adds to available cash and persists wallet transaction
	depositAmount := int64(50000000) // ₹5 Lakhs (50,000,000 paise)
	res, err := svc.Deposit(user.UUID.String(), depositAmount)
	if err != nil {
		t.Fatalf("deposit failed: %v", err)
	}

	expectedCash := cfg.InitialVirtualBalancePaise + depositAmount
	if res.CashBalancePaise != expectedCash {
		t.Fatalf("expected cash balance %d, got %d", expectedCash, res.CashBalancePaise)
	}
	if res.AvailableBalancePaise != expectedCash {
		t.Fatalf("expected available balance %d, got %d", expectedCash, res.AvailableBalancePaise)
	}

	// Verify transaction entry
	txs, err := svc.Transactions(user.UUID.String())
	if err != nil {
		t.Fatalf("failed to retrieve transactions: %v", err)
	}
	if len(txs) == 0 {
		t.Fatal("expected at least 1 transaction")
	}
	lastTx := txs[0]
	if lastTx.Type != model.WalletTransactionCredit {
		t.Fatalf("expected transaction type %s, got %s", model.WalletTransactionCredit, lastTx.Type)
	}
	if lastTx.AmountPaise != depositAmount {
		t.Fatalf("expected transaction amount %d, got %d", depositAmount, lastTx.AmountPaise)
	}
}
