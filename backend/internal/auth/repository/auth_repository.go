package repository

import (
	"errors"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AuthRepository struct{}

func New() *AuthRepository {
	return &AuthRepository{}
}

func (r *AuthRepository) Create(user *model.User) error {
	return database.GetDB().Create(user).Error
}

func (r *AuthRepository) FindByEmail(email string) (*model.User, error) {

	var user model.User

	err := database.GetDB().
		Where("email = ?", email).
		First(&user).Error

	return &user, err
}

func (r *AuthRepository) FindByUUID(userUUID uuid.UUID) (*model.User, error) {
	var user model.User

	err := database.GetDB().Where("uuid = ?", userUUID).First(&user).Error
	return &user, err
}

func (r *AuthRepository) CreateRefreshSession(session *model.RefreshSession) error {
	return database.GetDB().Create(session).Error
}

func (r *AuthRepository) FindActiveRefreshSession(tokenHash string) (*model.RefreshSession, error) {
	var session model.RefreshSession
	err := database.GetDB().Where("token_hash = ? AND revoked_at IS NULL AND expires_at > ?", tokenHash, time.Now()).First(&session).Error
	return &session, err
}

func (r *AuthRepository) RevokeRefreshSession(tokenHash string) error {
	now := time.Now()
	result := database.GetDB().Model(&model.RefreshSession{}).
		Where("token_hash = ? AND revoked_at IS NULL", tokenHash).
		Update("revoked_at", &now)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return errors.Join(gorm.ErrRecordNotFound, errors.New("refresh session is not active"))
	}
	return nil
}
