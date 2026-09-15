package repository

import (
	"os"
	"strings"
	"sync"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

var (
	testDBOnce sync.Once
	testDB     *gorm.DB
)

func getTestDB(t *testing.T) *gorm.DB {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is required for PostgreSQL integration tests")
	}
	testDBOnce.Do(func() {
		if err := database.Connect(&config.Config{DatabaseURL: databaseURL}); err != nil {
			t.Fatalf("connect test database: %v", err)
		}
		db := database.GetDB()
		if err := db.AutoMigrate(&model.Wallet{}, &model.WalletTransaction{}, &model.Position{}, &model.Order{}, &model.Trade{}); err != nil {
			t.Fatalf("migrate test database: %v", err)
		}
		testDB = db
	})
	if testDB == nil {
		t.Fatal("test database not initialized")
	}
	return testDB
}

func TestOrderRepository_DeliverySellReservation(t *testing.T) {
	db := getTestDB(t)

	userUUID := uuid.New()
	walletUUID := uuid.New()
	defer func() {
		db.Where("user_uuid = ?", userUUID).Delete(&model.Order{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Position{})
		db.Where("wallet_uuid = ?", walletUUID).Delete(&model.WalletTransaction{})
		db.Where("user_uuid = ?", userUUID).Delete(&model.Wallet{})
	}()

	// Provision test wallet and position: 100 shares of RELIANCE
	wallet := model.Wallet{UUID: walletUUID, UserUUID: userUUID, CashBalancePaise: 10000000}
	position := model.Position{
		UUID:              uuid.New(),
		UserUUID:          userUUID,
		Symbol:            "RELIANCE",
		Product:           model.OrderProductDelivery,
		Quantity:          100,
		AveragePricePaise: 250000,
		CostBasisPaise:    25000000,
		CurrentPricePaise: 250000,
	}

	for _, rec := range []any{&wallet, &position} {
		if err := db.Create(rec).Error; err != nil {
			t.Fatalf("failed to create test record: %v", err)
		}
	}

	repo := New()

	// 1. Attempt to sell a stock the user does not own (TCS)
	unownedOrder := &model.Order{
		UUID:       uuid.New(),
		UserUUID:   userUUID,
		Symbol:     "TCS",
		Side:       model.OrderSideSell,
		Type:       model.OrderTypeLimit,
		Product:    model.OrderProductDelivery,
		Quantity:   10,
		PricePaise: 350000,
		Status:     model.OrderStatusPending,
	}
	err := repo.CreateDeliverySell(unownedOrder)
	if err == nil || !strings.Contains(err.Error(), "without holding shares") {
		t.Fatalf("expected rejection for selling unowned stock, got: %v", err)
	}

	// 2. Sell 40 shares of RELIANCE -> Should succeed (Available: 100 - 0 = 100)
	order1 := &model.Order{
		UUID:       uuid.New(),
		UserUUID:   userUUID,
		Symbol:     "RELIANCE",
		Side:       model.OrderSideSell,
		Type:       model.OrderTypeLimit,
		Product:    model.OrderProductDelivery,
		Quantity:   40,
		PricePaise: 260000,
		Status:     model.OrderStatusPending,
	}
	if err := repo.CreateDeliverySell(order1); err != nil {
		t.Fatalf("order1 (40 shares) should succeed: %v", err)
	}

	// 3. Sell 50 shares of RELIANCE -> Should succeed (Available: 100 - 40 = 60)
	order2 := &model.Order{
		UUID:       uuid.New(),
		UserUUID:   userUUID,
		Symbol:     "RELIANCE",
		Side:       model.OrderSideSell,
		Type:       model.OrderTypeLimit,
		Product:    model.OrderProductDelivery,
		Quantity:   50,
		PricePaise: 265000,
		Status:     model.OrderStatusOpen,
	}
	if err := repo.CreateDeliverySell(order2); err != nil {
		t.Fatalf("order2 (50 shares) should succeed: %v", err)
	}

	// 4. Sell 20 shares of RELIANCE -> Should FAIL (Available: 100 - (40 + 50) = 10)
	order3 := &model.Order{
		UUID:       uuid.New(),
		UserUUID:   userUUID,
		Symbol:     "RELIANCE",
		Side:       model.OrderSideSell,
		Type:       model.OrderTypeLimit,
		Product:    model.OrderProductDelivery,
		Quantity:   20,
		PricePaise: 270000,
		Status:     model.OrderStatusPending,
	}
	err = repo.CreateDeliverySell(order3)
	if err == nil || !strings.Contains(err.Error(), "insufficient available shares") {
		t.Fatalf("order3 (20 shares) should fail due to insufficient available shares, got: %v", err)
	}

	// 5. Cancel order1 (40 shares) -> Available should become 100 - 50 = 50
	if err := repo.Cancel(userUUID, order1.UUID); err != nil {
		t.Fatalf("cancel order1 failed: %v", err)
	}

	// 6. Now retry selling 20 shares -> Should succeed (Available: 50)
	order4 := &model.Order{
		UUID:       uuid.New(),
		UserUUID:   userUUID,
		Symbol:     "RELIANCE",
		Side:       model.OrderSideSell,
		Type:       model.OrderTypeLimit,
		Product:    model.OrderProductDelivery,
		Quantity:   20,
		PricePaise: 270000,
		Status:     model.OrderStatusPending,
	}
	if err := repo.CreateDeliverySell(order4); err != nil {
		t.Fatalf("order4 (20 shares) should succeed after cancel of order1: %v", err)
	}
}
