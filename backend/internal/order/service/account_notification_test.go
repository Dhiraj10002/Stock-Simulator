package service

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/accountchanges"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	orderRepository "github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/repository"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

func TestAccountHintOnlyAfterCommittedReservation(t *testing.T) {
	url := os.Getenv("TEST_REDIS_URL")
	if url == "" {
		t.Skip("TEST_REDIS_URL required")
	}
	options, err := redis.ParseURL(url)
	if err != nil {
		t.Fatal(err)
	}
	client := redis.NewClient(options)
	ctx, cancel := context.WithCancel(context.Background())
	defer client.Close()
	defer cancel()
	accountchanges.Configure(ctx, client)
	db := accountingDB(t)
	wallet := accountingWallet(t, db)
	key := "account:revision:" + wallet.UserUUID.String()
	barrierUser := uuid.NewString()
	defer client.Del(context.Background(), key, "account:revision:"+barrierUser)
	order := model.Order{UserUUID: wallet.UserUUID, Symbol: "HINT-EQ", Product: model.OrderProductDelivery, Side: model.OrderSideBuy, Type: model.OrderTypeLimit, Quantity: 1, PricePaise: 9000, Status: model.OrderStatusOpen}
	const failure = "account_hint_rollback"
	if err := db.Callback().Create().Before("gorm:create").Register(failure, func(tx *gorm.DB) {
		if tx.Statement.Table == "orders" {
			tx.AddError(errors.New("injected create failure"))
		}
	}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Callback().Create().Remove(failure) })
	repo := orderRepository.New()
	if err := repo.CreateIntent(&order, 9000); err == nil {
		t.Fatal("injected order failure did not roll back")
	}
	// A queued barrier proves the publisher processed all earlier accepted hints.
	accountchanges.Notify(barrierUser)
	waitRevision := func(key string) {
		t.Helper()
		deadline := time.Now().Add(5 * time.Second)
		for {
			if _, err := client.Get(ctx, key).Result(); err == nil {
				return
			}
			if time.Now().After(deadline) {
				t.Fatal("notification revision did not arrive")
			}
			time.Sleep(10 * time.Millisecond)
		}
	}
	waitRevision("account:revision:" + barrierUser)
	if _, err := client.Get(ctx, key).Result(); err != redis.Nil {
		t.Fatal("rolled-back reservation emitted an account change")
	}
	var persisted model.Wallet
	if err := db.Where("uuid = ?", wallet.UUID).First(&persisted).Error; err != nil || persisted.BlockedPaise != 0 {
		t.Fatalf("failed order leaked reserved funds: %v", err)
	}
	db.Callback().Create().Remove(failure)
	order.UUID = uuid.Nil
	if err := repo.CreateIntent(&order, 9000); err != nil {
		t.Fatal(err)
	}
	waitRevision(key)
	if err := db.Where("uuid = ?", wallet.UUID).First(&persisted).Error; err != nil || persisted.BlockedPaise != 9000 {
		t.Fatalf("hint preceded committed reservation: %v", err)
	}
}
