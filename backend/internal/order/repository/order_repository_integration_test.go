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

func TestOrderRepository_FindInstrument_CanonicalAndAliases(t *testing.T) {
	db := getTestDB(t)
	repo := New()

	// Seed canonical instruments
	instruments := []model.Instrument{
		{
			Token:           "2705",
			Symbol:          "PRAJIND-EQ",
			Name:            "PRAJIND",
			ExchangeSegment: "NSE",
			LotSize:         1,
			TickSize:        "5.000000",
		},
		{
			Token:           "5097",
			Symbol:          "ETERNAL-EQ",
			Name:            "ETERNAL",
			ExchangeSegment: "NSE",
			LotSize:         1,
			TickSize:        "5.000000",
		},
		{
			Token:           "3456",
			Symbol:          "TMPV-EQ",
			Name:            "TMPV",
			ExchangeSegment: "NSE",
			LotSize:         1,
			TickSize:        "5.000000",
		},
		{
			Token:            "NFO_OPT_NIFTY_25000",
			Symbol:           "NIFTY24OCT25000CE",
			Name:             "NIFTY",
			UnderlyingSymbol: "NIFTY",
			Expiry:           "2026-10-29",
			Strike:           "25000.000000",
			OptionType:       "CE",
			LotSize:          25,
			InstrumentType:   "OPTIDX",
			ExchangeSegment:  "NFO",
			TickSize:         "5.000000",
		},
	}

	symbolsToPurge := []string{"PRAJIND", "ETERNAL", "ZOMATO", "TMPV", "TATAMOTORS", "NIFTY24OCT25000CE"}
	purge := func() {
		for _, sym := range symbolsToPurge {
			_ = db.Where("symbol = ? OR symbol = ? OR name = ?", sym, sym+"-EQ", sym).Delete(&model.Instrument{})
		}
		for _, inst := range instruments {
			_ = db.Where("token = ?", inst.Token).Delete(&model.Instrument{})
		}
	}
	purge()
	defer purge()

	for _, inst := range instruments {
		if err := db.Create(&inst).Error; err != nil {
			t.Fatalf("seed instrument %s: %v", inst.Symbol, err)
		}
	}

	// 1. PRAJIND (exact, and without -EQ suffix)
	praj, err := repo.FindInstrument("PRAJIND")
	if err != nil || praj == nil || praj.Token != "2705" {
		t.Fatalf("expected token 2705 for PRAJIND, got %v (err: %v)", praj, err)
	}
	prajEQ, err := repo.FindInstrument("PRAJIND-EQ")
	if err != nil || prajEQ == nil || prajEQ.Token != "2705" {
		t.Fatalf("expected token 2705 for PRAJIND-EQ, got %v (err: %v)", prajEQ, err)
	}

	// 2. Canonical ETERNAL and Alias ZOMATO
	eternal, err := repo.FindInstrument("ETERNAL")
	if err != nil || eternal == nil || eternal.Token != "5097" {
		t.Fatalf("expected token 5097 for ETERNAL, got %v (err: %v)", eternal, err)
	}
	zomato, err := repo.FindInstrument("ZOMATO")
	if err != nil || zomato == nil || zomato.Token != "5097" {
		t.Fatalf("expected token 5097 for alias ZOMATO, got %v (err: %v)", zomato, err)
	}

	// 3. Canonical TMPV and Alias TATAMOTORS
	tmpv, err := repo.FindInstrument("TMPV")
	if err != nil || tmpv == nil || tmpv.Token != "3456" {
		t.Fatalf("expected token 3456 for TMPV, got %v (err: %v)", tmpv, err)
	}
	tata, err := repo.FindInstrument("TATAMOTORS")
	if err != nil || tata == nil || tata.Token != "3456" {
		t.Fatalf("expected token 3456 for alias TATAMOTORS, got %v (err: %v)", tata, err)
	}

	// 4. F&O contract
	fno, err := repo.FindInstrument("NIFTY24OCT25000CE")
	if err != nil || fno == nil || fno.Token != "NFO_OPT_NIFTY_25000" {
		t.Fatalf("expected F&O instrument, got %v (err: %v)", fno, err)
	}

	// 5. Unknown symbol must be rejected with error
	unknown, err := repo.FindInstrument("UNKNOWN_NONEXISTENT_CO")
	if err == nil || unknown != nil {
		t.Fatalf("expected error for unknown symbol, got instrument: %+v", unknown)
	}
}
