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

// CreateWithInitialWallet keeps account provisioning all-or-nothing. A user
// cannot be committed if the associated wallet or its opening ledger entry
// cannot be created.
func (r *AuthRepository) CreateWithInitialWallet(user *model.User, initialBalancePaise int64) error {
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(user).Error; err != nil {
			return err
		}
		wallet := &model.Wallet{UserUUID: user.UUID, CashBalancePaise: initialBalancePaise}
		if err := tx.Create(wallet).Error; err != nil {
			return err
		}
		return tx.Create(&model.WalletTransaction{
			WalletUUID:   wallet.UUID,
			Type:         model.WalletTransactionInitialCredit,
			AmountPaise:  initialBalancePaise,
			BalancePaise: initialBalancePaise,
			BlockedPaise: 0,
			Note:         "Initial virtual capital",
		}).Error
	})
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

func (r *AuthRepository) FindByTokenHash(tokenHash string) (*model.RefreshSession, error) {
	var session model.RefreshSession
	err := database.GetDB().Where("token_hash = ?", tokenHash).First(&session).Error
	return &session, err
}

func (r *AuthRepository) RevokeAllUserSessions(userUUID uuid.UUID) error {
	now := time.Now()
	return database.GetDB().Model(&model.RefreshSession{}).
		Where("user_uuid = ? AND revoked_at IS NULL", userUUID).
		Update("revoked_at", &now).Error
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

// RotateRefreshSession revokes the token being presented and persists its
// replacement in one transaction. The conditional update permits exactly one
// concurrent request to rotate a given active session.
func (r *AuthRepository) RotateRefreshSession(userUUID uuid.UUID, tokenHash string, replacement *model.RefreshSession) error {
	if replacement.UserUUID != userUUID {
		return errors.New("refresh session user mismatch")
	}
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		result := tx.Model(&model.RefreshSession{}).
			Where("user_uuid = ? AND token_hash = ? AND revoked_at IS NULL AND expires_at > ?", userUUID, tokenHash, now).
			Update("revoked_at", &now)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.Join(gorm.ErrRecordNotFound, errors.New("refresh session is not active"))
		}
		return tx.Create(replacement).Error
	})
}
