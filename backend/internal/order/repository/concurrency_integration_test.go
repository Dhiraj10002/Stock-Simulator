package repository

import (
	"sync"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
)

func TestConcurrency_DoubleSpendingPrevention(t *testing.T) {
	db := getTestDB(t)

	userUUID := uuid.New()
	walletUUID := uuid.New()
	defer func() {
		db.Where("user_uuid = ?", userUUID).Delete(&model.Order{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Position{})
		db.Where("wallet_uuid = ?", walletUUID).Delete(&model.WalletTransaction{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Wallet{})
	}()

	// User has exactly 10,000 paise cash and 0 blocked
	wallet := model.Wallet{UUID: walletUUID, UserUUID: userUUID, CashBalancePaise: 10000, BlockedPaise: 0}
	if err := db.Create(&wallet).Error; err != nil {
		t.Fatalf("failed to create wallet: %v", err)
	}

	repo := New()

	// Two concurrent goroutines try to reserve 8,000 paise each
	var wg sync.WaitGroup
	results := make([]error, 2)

	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			order := &model.Order{
				UUID:       uuid.New(),
				UserUUID:   userUUID,
				Symbol:     "RELIANCE",
				Side:       model.OrderSideBuy,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductDelivery,
				Quantity:   1,
				PricePaise: 8000,
				Status:     model.OrderStatusPending,
			}
			results[idx] = repo.CreateWithReservation(order, 8000)
		}(i)
	}
	wg.Wait()

	successCount := 0
	failureCount := 0
	for _, res := range results {
		if res == nil {
			successCount++
		} else {
			failureCount++
		}
	}

	if successCount != 1 || failureCount != 1 {
		t.Fatalf("expected exactly 1 success and 1 failure for concurrent reservation, got %d successes and %d failures", successCount, failureCount)
	}

	// Verify final wallet state: Cash=10,000, Blocked=8,000, Available=2,000
	var finalWallet model.Wallet
	if err := db.Where("user_uuid = ?", userUUID).First(&finalWallet).Error; err != nil {
		t.Fatalf("failed to load wallet: %v", err)
	}
	if finalWallet.BlockedPaise != 8000 {
		t.Fatalf("expected blocked paise 8000, got %d", finalWallet.BlockedPaise)
	}
	if finalWallet.AvailableBalancePaise() != 2000 {
		t.Fatalf("expected available balance 2000, got %d", finalWallet.AvailableBalancePaise())
	}
}

func TestConcurrency_DoubleSellingPrevention(t *testing.T) {
	db := getTestDB(t)

	userUUID := uuid.New()
	walletUUID := uuid.New()
	defer func() {
		db.Where("user_uuid = ?", userUUID).Delete(&model.Order{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Position{})
		db.Where("wallet_uuid = ?", walletUUID).Delete(&model.WalletTransaction{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Wallet{})
	}()

	wallet := model.Wallet{UUID: walletUUID, UserUUID: userUUID, CashBalancePaise: 1000000}
	position := model.Position{
		UUID:              uuid.New(),
		UserUUID:          userUUID,
		Symbol:            "TCS",
		Product:           model.OrderProductDelivery,
		Quantity:          100, // holds 100 shares
		AveragePricePaise: 350000,
		CostBasisPaise:    35000000,
	}

	if err := db.Create(&wallet).Error; err != nil {
		t.Fatalf("create wallet: %v", err)
	}
	if err := db.Create(&position).Error; err != nil {
		t.Fatalf("create position: %v", err)
	}

	repo := New()

	// Two concurrent goroutines try to sell 80 shares each
	var wg sync.WaitGroup
	results := make([]error, 2)

	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			order := &model.Order{
				UUID:       uuid.New(),
				UserUUID:   userUUID,
				Symbol:     "TCS",
				Side:       model.OrderSideSell,
				Type:       model.OrderTypeLimit,
				Product:    model.OrderProductDelivery,
				Quantity:   80,
				PricePaise: 360000,
				Status:     model.OrderStatusPending,
			}
			results[idx] = repo.CreateDeliverySell(order)
		}(i)
	}
	wg.Wait()

	successCount := 0
	failureCount := 0
	for _, res := range results {
		if res == nil {
			successCount++
		} else {
			failureCount++
		}
	}

	if successCount != 1 || failureCount != 1 {
		t.Fatalf("expected exactly 1 success and 1 failure for concurrent sell, got %d successes and %d failures", successCount, failureCount)
	}
}

func TestConcurrency_ConcurrentCancelSafety(t *testing.T) {
	db := getTestDB(t)

	userUUID := uuid.New()
	walletUUID := uuid.New()
	orderUUID := uuid.New()
	defer func() {
		db.Where("user_uuid = ?", userUUID).Delete(&model.Order{})
		db.Where("wallet_uuid = ?", walletUUID).Delete(&model.WalletTransaction{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Wallet{})
	}()

	// Wallet with 50,000 cash and 10,000 blocked
	wallet := model.Wallet{UUID: walletUUID, UserUUID: userUUID, CashBalancePaise: 50000, BlockedPaise: 10000}
	order := model.Order{
		UUID:          orderUUID,
		UserUUID:      userUUID,
		Symbol:        "INFY",
		Side:          model.OrderSideBuy,
		Type:          model.OrderTypeLimit,
		Product:       model.OrderProductDelivery,
		Quantity:      1,
		PricePaise:    10000,
		ReservedPaise: 10000,
		Status:        model.OrderStatusOpen,
	}

	if err := db.Create(&wallet).Error; err != nil {
		t.Fatalf("create wallet: %v", err)
	}
	if err := db.Create(&order).Error; err != nil {
		t.Fatalf("create order: %v", err)
	}

	repo := New()

	// Two concurrent cancellations for the same order
	var wg sync.WaitGroup
	results := make([]error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			results[idx] = repo.Cancel(userUUID, orderUUID)
		}(i)
	}
	wg.Wait()

	successCount := 0
	failureCount := 0
	for _, err := range results {
		if err == nil {
			successCount++
		} else {
			failureCount++
		}
	}

	if successCount != 1 || failureCount != 1 {
		t.Fatalf("expected exactly 1 cancellation to succeed, got %d success, %d failure", successCount, failureCount)
	}

	// Verify wallet blocked paise was released exactly once (10,000 -> 0)
	var finalWallet model.Wallet
	if err := db.Where("user_uuid = ?", userUUID).First(&finalWallet).Error; err != nil {
		t.Fatalf("find wallet: %v", err)
	}
	if finalWallet.BlockedPaise != 0 {
		t.Fatalf("expected blocked paise 0, got %d", finalWallet.BlockedPaise)
	}
}
