package service

import (
	"fmt"
	"net"
	"os"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

func getTradeTestDB(t *testing.T) *gorm.DB {
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@127.0.0.1:5433/testdb?sslmode=disable"
	}
	conn, err := net.DialTimeout("tcp", "127.0.0.1:5433", 50*time.Millisecond)
	if err != nil {
		t.Skipf("PostgreSQL not accessible at 127.0.0.1:5433 (%v); skipping trade service test", err)
		return nil
	}
	_ = conn.Close()

	if err := database.Connect(&config.Config{DatabaseURL: dbURL}); err != nil {
		t.Skipf("PostgreSQL connect failed: %v", err)
		return nil
	}
	db := database.GetDB()
	_ = db.AutoMigrate(&model.User{}, &model.Trade{})
	return db
}

func TestTradeService_UpdateJournal_And_List(t *testing.T) {
	db := getTradeTestDB(t)
	if db == nil {
		return
	}

	userA := model.User{
		Email:        fmt.Sprintf("trader_a_%d@example.com", time.Now().UnixNano()),
		Password: "dummyhash",
		Name:         "Trader Alpha",
	}
	if err := db.Create(&userA).Error; err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}
	defer db.Delete(&userA)

	userB := model.User{
		Email:        fmt.Sprintf("trader_b_%d@example.com", time.Now().UnixNano()),
		Password: "dummyhash",
		Name:         "Trader Beta",
	}
	if err := db.Create(&userB).Error; err != nil {
		t.Fatalf("failed to create test user B: %v", err)
	}
	defer db.Delete(&userB)

	trade := model.Trade{
		OrderUUID:  uuid.New(),
		UserUUID:   userA.UUID,
		Symbol:     "RELIANCE",
		Side:       "BUY",
		Quantity:   10,
		PricePaise: 250000,
		TotalPaise: 2500000,
		Product:    "DELIVERY",
		ExecutedAt: time.Now(),
	}
	if err := db.Create(&trade).Error; err != nil {
		t.Fatalf("failed to create test trade: %v", err)
	}
	defer db.Delete(&trade)

	svc := New()

	// 1. List for User A should return the trade
	trades, err := svc.List(userA.UUID.String())
	if err != nil {
		t.Fatalf("unexpected error listing trades: %v", err)
	}
	if len(trades) == 0 {
		t.Fatalf("expected at least 1 trade, got 0")
	}
	if trades[0].Tag != "" || trades[0].Notes != "" {
		t.Errorf("expected empty initial journal, got tag=%s notes=%s", trades[0].Tag, trades[0].Notes)
	}

	// 2. User A updates journal tags and notes
	expectedTag := "#Breakout20"
	expectedNotes := "Bought test consolidation breakout above resistance"
	if err := svc.UpdateJournal(userA.UUID.String(), trade.UUID.String(), expectedTag, expectedNotes); err != nil {
		t.Fatalf("failed to update journal: %v", err)
	}

	// Verify journal persisted
	tradesAfter, err := svc.List(userA.UUID.String())
	if err != nil {
		t.Fatalf("unexpected error listing trades after update: %v", err)
	}
	var found bool
	for _, tRes := range tradesAfter {
		if tRes.UUID == trade.UUID.String() {
			found = true
			if tRes.Tag != expectedTag {
				t.Errorf("expected tag %s, got %s", expectedTag, tRes.Tag)
			}
			if tRes.Notes != expectedNotes {
				t.Errorf("expected notes %s, got %s", expectedNotes, tRes.Notes)
			}
		}
	}
	if !found {
		t.Errorf("updated trade not found in user trades list")
	}

	// 3. User B tries to update User A's trade journal -> Must be rejected with ErrTradeNotFound
	err = svc.UpdateJournal(userB.UUID.String(), trade.UUID.String(), "#MaliciousTag", "Hacked")
	if err == nil {
		t.Fatalf("expected ErrTradeNotFound when User B updates User A's trade, got nil error")
	}
	if err != ErrTradeNotFound {
		t.Errorf("expected ErrTradeNotFound, got: %v", err)
	}

	// 4. Update non-existent trade UUID -> Must be rejected with ErrTradeNotFound
	fakeUUID := uuid.NewString()
	err = svc.UpdateJournal(userA.UUID.String(), fakeUUID, "#Tag", "Note")
	if err == nil {
		t.Fatalf("expected ErrTradeNotFound for non-existent trade, got nil error")
	}

	// 5. Invalid user identity UUID
	err = svc.UpdateJournal("invalid-user-uuid", trade.UUID.String(), "#Tag", "Note")
	if err == nil {
		t.Fatalf("expected error for invalid user UUID, got nil")
	}

	// 6. Invalid trade UUID
	err = svc.UpdateJournal(userA.UUID.String(), "not-a-uuid", "#Tag", "Note")
	if err == nil {
		t.Fatalf("expected error for invalid trade UUID, got nil")
	}
}
