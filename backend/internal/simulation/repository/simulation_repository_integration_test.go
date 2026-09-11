package repository

import (
	"os"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
)

func TestResetCurrentState(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is required for PostgreSQL integration tests")
	}
	if err := database.Connect(&config.Config{DatabaseURL: databaseURL}); err != nil {
		t.Fatalf("connect test database: %v", err)
	}

	db := database.GetDB()
	if err := db.AutoMigrate(&model.Wallet{}, &model.WalletTransaction{}, &model.Position{}, &model.Order{}, &model.Trade{}, &model.SimulationReset{}); err != nil {
		t.Fatalf("migrate test database: %v", err)
	}

	userUUID := uuid.New()
	walletUUID := uuid.New()
	pendingOrderUUID := uuid.New()
	executedOrderUUID := uuid.New()
	defer func() {
		db.Where("user_uuid = ?", userUUID).Delete(&model.SimulationReset{})
		db.Where("wallet_uuid = ?", walletUUID).Delete(&model.WalletTransaction{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Trade{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Position{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Order{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Wallet{})
	}()

	wallet := model.Wallet{UUID: walletUUID, UserUUID: userUUID, CashBalancePaise: 75000000, BlockedPaise: 15000000}
	pendingOrder := model.Order{UUID: pendingOrderUUID, UserUUID: userUUID, Symbol: "TCS", Side: model.OrderSideBuy, Type: model.OrderTypeLimit, Product: model.OrderProductDelivery, Quantity: 10, PricePaise: 1500000, ReservedPaise: 15000000, Status: model.OrderStatusOpen}
	executedOrder := model.Order{UUID: executedOrderUUID, UserUUID: userUUID, Symbol: "INFY", Side: model.OrderSideBuy, Type: model.OrderTypeMarket, Product: model.OrderProductDelivery, Quantity: 5, PricePaise: 1400000, Status: model.OrderStatusExecuted}
	position := model.Position{UUID: uuid.New(), UserUUID: userUUID, Symbol: "INFY", Quantity: 5, AveragePricePaise: 1400000, CurrentPricePaise: 1450000}
	trade := model.Trade{UUID: uuid.New(), OrderUUID: executedOrderUUID, UserUUID: userUUID, Symbol: "INFY", Side: model.OrderSideBuy, Quantity: 5, PricePaise: 1400000, TotalPaise: 7000000}
	history := model.WalletTransaction{UUID: uuid.New(), WalletUUID: walletUUID, Type: model.WalletTransactionDebit, AmountPaise: -7000000, BalancePaise: 75000000, BlockedPaise: 15000000, Note: "Existing history"}

	for _, record := range []any{&wallet, &pendingOrder, &executedOrder, &position, &trade, &history} {
		if err := db.Create(record).Error; err != nil {
			t.Fatalf("create test record: %v", err)
		}
	}

	const initialBalancePaise int64 = 100000000
	if err := New().ResetCurrentState(userUUID, initialBalancePaise); err != nil {
		t.Fatalf("reset current state: %v", err)
	}

	var gotWallet model.Wallet
	if err := db.Where("uuid = ?", walletUUID).First(&gotWallet).Error; err != nil {
		t.Fatalf("find wallet: %v", err)
	}
	if gotWallet.CashBalancePaise != initialBalancePaise || gotWallet.BlockedPaise != 0 {
		t.Fatalf("unexpected wallet balances: cash=%d blocked=%d", gotWallet.CashBalancePaise, gotWallet.BlockedPaise)
	}

	var gotPending, gotExecuted model.Order
	if err := db.Where("uuid = ?", pendingOrderUUID).First(&gotPending).Error; err != nil {
		t.Fatalf("find pending order: %v", err)
	}
	if err := db.Where("uuid = ?", executedOrderUUID).First(&gotExecuted).Error; err != nil {
		t.Fatalf("find executed order: %v", err)
	}
	if gotPending.Status != model.OrderStatusCancelled {
		t.Fatalf("expected open order to be cancelled, got %s", gotPending.Status)
	}
	if gotExecuted.Status != model.OrderStatusExecuted {
		t.Fatalf("expected executed order to be preserved, got %s", gotExecuted.Status)
	}

	var positions, trades, transactions int64
	db.Model(&model.Position{}).Where("user_uuid = ?", userUUID).Count(&positions)
	db.Model(&model.Trade{}).Where("user_uuid = ?", userUUID).Count(&trades)
	db.Model(&model.WalletTransaction{}).Where("wallet_uuid = ?", walletUUID).Count(&transactions)
	if positions != 0 {
		t.Fatalf("expected positions to be cleared, got %d", positions)
	}
	if trades != 1 {
		t.Fatalf("expected historical trades to be preserved, got %d", trades)
	}
	if transactions != 2 {
		t.Fatalf("expected historical and reset transactions, got %d", transactions)
	}

	var resetTransaction model.WalletTransaction
	if err := db.Where("wallet_uuid = ? AND type = ?", walletUUID, model.WalletTransactionReset).Last(&resetTransaction).Error; err != nil {
		t.Fatalf("find reset transaction: %v", err)
	}
	if resetTransaction.Note != "Simulation reset" || resetTransaction.BalancePaise != initialBalancePaise || resetTransaction.BlockedPaise != 0 {
		t.Fatalf("unexpected reset audit transaction: %+v", resetTransaction)
	}

	var reset model.SimulationReset
	if err := db.Where("user_uuid = ?", userUUID).First(&reset).Error; err != nil {
		t.Fatalf("find simulation reset: %v", err)
	}
	if reset.PreviousCashPaise != 75000000 || reset.PreviousBlockedPaise != 15000000 || reset.UnrealizedPnlPaise != 250000 || reset.CancelledOrderCount != 1 || reset.ClearedPositionCount != 1 {
		t.Fatalf("unexpected simulation reset snapshot: %+v", reset)
	}
}
