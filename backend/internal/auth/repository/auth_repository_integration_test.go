package repository

import (
	"os"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
)

func TestRotateRefreshSessionRollsBackWhenReplacementCannotBeStored(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is required for PostgreSQL integration tests")
	}
	if err := database.Connect(&config.Config{DatabaseURL: databaseURL}); err != nil {
		t.Fatalf("connect test database: %v", err)
	}
	db := database.GetDB()
	if err := db.AutoMigrate(&model.RefreshSession{}); err != nil {
		t.Fatalf("migrate refresh sessions: %v", err)
	}

	userUUID := uuid.New()
	original := model.RefreshSession{
		UUID:      uuid.New(),
		UserUUID:  userUUID,
		TokenHash: "original-token-hash",
		ExpiresAt: time.Now().Add(time.Hour),
	}
	defer db.Where("user_uuid = ?", userUUID).Delete(&model.RefreshSession{})
	if err := db.Create(&original).Error; err != nil {
		t.Fatalf("create original session: %v", err)
	}

	// The duplicate hash violates the unique constraint. If revocation and
	// insertion were separate transactions, this would strand the user.
	replacement := &model.RefreshSession{
		UUID:      uuid.New(),
		UserUUID:  userUUID,
		TokenHash: original.TokenHash,
		ExpiresAt: time.Now().Add(time.Hour),
	}
	if err := New().RotateRefreshSession(userUUID, original.TokenHash, replacement); err == nil {
		t.Fatal("expected duplicate replacement hash to fail")
	}

	var stillActive model.RefreshSession
	if err := db.Where("uuid = ? AND revoked_at IS NULL", original.UUID).First(&stillActive).Error; err != nil {
		t.Fatalf("original session should remain active after rollback: %v", err)
	}

	validReplacement := &model.RefreshSession{
		UUID:      uuid.New(),
		UserUUID:  userUUID,
		TokenHash: "replacement-token-hash",
		ExpiresAt: time.Now().Add(time.Hour),
	}
	if err := New().RotateRefreshSession(userUUID, original.TokenHash, validReplacement); err != nil {
		t.Fatalf("rotate refresh session: %v", err)
	}
	if err := db.Where("uuid = ? AND revoked_at IS NOT NULL", original.UUID).First(&model.RefreshSession{}).Error; err != nil {
		t.Fatalf("original session should be revoked after successful rotation: %v", err)
	}
	if err := db.Where("uuid = ? AND revoked_at IS NULL", validReplacement.UUID).First(&model.RefreshSession{}).Error; err != nil {
		t.Fatalf("replacement session should be active: %v", err)
	}
}
