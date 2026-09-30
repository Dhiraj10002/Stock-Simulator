package service

import (
	"bytes"
	"sync"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/token"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/testutil"
	"github.com/google/uuid"
)

func TestRegression_RefreshConcurrentLostResponseAndReplay(t *testing.T) {
	db := testutil.RequireDisposableDB(t)
	cfg := &config.Config{JWTSecret: "test-only-refresh-secret-0123456789abcdef"}
	user := model.User{UUID: uuid.New(), Name: "Refresh test", Email: uuid.NewString() + "@example.test", Password: "unused"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	old, err := token.GenerateRefreshToken(cfg.JWTSecret, user.UUID.String())
	if err != nil {
		t.Fatal(err)
	}
	claims, _ := token.Parse(cfg.JWTSecret, old)
	session := model.RefreshSession{UserUUID: user.UUID, TokenHash: hashToken(old), JTI: claims.ID, ExpiresAt: time.Now().Add(time.Hour)}
	if err := db.Create(&session).Error; err != nil {
		t.Fatal(err)
	}
	results := make([]*dto.LoginResponse, 8)
	errs := make([]error, 8)
	var wg sync.WaitGroup
	for i := range results {
		wg.Add(1)
		go func(i int) { defer wg.Done(); results[i], errs[i] = New(cfg).Refresh(old, "same-attempt") }(i)
	}
	wg.Wait()
	for i, r := range results {
		if errs[i] != nil || r == nil {
			t.Fatalf("refresh %d: %v", i, errs[i])
		}
		if *r != *results[0] {
			t.Fatal("rotation produced multiple responses")
		}
	}
	// Recreate the service to recover a response lost by the transport.
	retried, err := New(cfg).Refresh(old, "same-attempt")
	if err != nil || *retried != *results[0] {
		t.Fatalf("lost-response recovery failed: %v", err)
	}
	db.First(&session, session.ID)
	if bytes.Contains(session.RetryCiphertext, []byte(retried.RefreshToken)) {
		t.Fatal("plaintext token persisted")
	}
	var active int64
	db.Model(&model.RefreshSession{}).Where("user_uuid = ? AND revoked_at IS NULL", user.UUID).Count(&active)
	if active != 1 {
		t.Fatalf("active refresh sessions=%d", active)
	}
	if _, err := New(cfg).Refresh(old, "different-attempt"); err == nil {
		t.Fatal("genuine replay accepted")
	}
	db.Model(&model.RefreshSession{}).Where("user_uuid = ? AND revoked_at IS NULL", user.UUID).Count(&active)
	if active != 0 {
		t.Fatal("replay did not revoke sessions")
	}
	if _, err := New(cfg).Refresh(old, "same-attempt"); err == nil {
		t.Fatal("recovered a revoked replacement")
	}
}
