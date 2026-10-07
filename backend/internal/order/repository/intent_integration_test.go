package repository

import (
	"errors"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
	"sync"
	"testing"
)

func TestIntentConcurrentRetriesReserveOnceAndSurviveHiddenHistory(t *testing.T) {
	db := getTestDB(t)
	user, walletID := uuid.New(), uuid.New()
	wallet := model.Wallet{UUID: walletID, UserUUID: user, CashBalancePaise: 10000}
	if err := db.Create(&wallet).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Where("user_uuid = ?", user).Delete(&model.Order{})
		db.Where("wallet_uuid = ?", walletID).Delete(&model.WalletTransaction{})
		db.Delete(&wallet)
	})
	key := "same-intent"
	results := make([]model.Order, 12)
	errs := make([]error, 12)
	var wg sync.WaitGroup
	for i := range results {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i] = model.Order{UserUUID: user, Symbol: "TCS", Side: "BUY", Type: "LIMIT", Product: "DELIVERY", Quantity: 1, PricePaise: 8000, Status: "PENDING", IntentKey: &key, IntentHash: "hash"}
			errs[i] = New().CreateIntent(&results[i], 8000)
		}(i)
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatal(err)
		}
		if results[i].UUID != results[0].UUID {
			t.Fatal("retry created another order")
		}
	}
	if err := db.First(&wallet, wallet.ID).Error; err != nil {
		t.Fatal(err)
	}
	if wallet.BlockedPaise != 8000 {
		t.Fatalf("reserved %d", wallet.BlockedPaise)
	}
	var count int64
	db.Model(&model.WalletTransaction{}).Where("wallet_uuid = ?", walletID).Count(&count)
	if count != 1 {
		t.Fatalf("reservation ledger entries=%d", count)
	}
	db.Model(&model.Order{}).Where("uuid = ?", results[0].UUID).Update("hidden_from_history", true)
	found, err := New().FindIntent(user, key, "hash")
	if err != nil || found.UUID != results[0].UUID {
		t.Fatalf("durable hidden intent: %v", err)
	}
	if _, err := New().FindIntent(user, key, "different"); !errors.Is(err, ErrIntentConflict) {
		t.Fatalf("changed payload: %v", err)
	}
}

func TestIntentFailedReservationRollsBackAndKeyIsScopedToUser(t *testing.T) {
	db := getTestDB(t)
	key := "shared-key"
	for _, cash := range []int64{1000, 20000} {
		wallet := model.Wallet{UserUUID: uuid.New(), CashBalancePaise: cash}
		if err := db.Create(&wallet).Error; err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			db.Where("user_uuid = ?", wallet.UserUUID).Delete(&model.Order{})
			db.Where("wallet_uuid = ?", wallet.UUID).Delete(&model.WalletTransaction{})
			db.Delete(&wallet)
		})
		order := model.Order{UserUUID: wallet.UserUUID, Symbol: "TCS", Side: "BUY", Type: "LIMIT", Product: "DELIVERY", Quantity: 1, PricePaise: 8000, Status: "PENDING", IntentKey: &key, IntentHash: "hash"}
		err := New().CreateIntent(&order, 8000)
		if cash < 8000 {
			if err == nil {
				t.Fatal("unfunded intent accepted")
			}
			var count int64
			db.Model(&model.Order{}).Where("user_uuid = ?", wallet.UserUUID).Count(&count)
			if count != 0 {
				t.Fatal("failed transaction retained intent")
			}
		} else if err != nil {
			t.Fatal(err)
		}
	}
}
