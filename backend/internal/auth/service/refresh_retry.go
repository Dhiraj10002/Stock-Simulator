package service

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/token"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (s *AuthService) refreshCipher() (cipher.AEAD, error) {
	key := sha256.Sum256([]byte("refresh-retry-v1:" + s.cfg.JWTSecret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// Refresh rotates exactly once. Only the same token + random retry key may
// recover its encrypted response during the two-minute transport retry window.
// Other reuse retains the existing all-sessions revocation policy.
func (s *AuthService) Refresh(refreshToken string, retryKeys ...string) (*dto.LoginResponse, error) {
	claims, err := token.Parse(s.cfg.JWTSecret, refreshToken)
	if err != nil || claims.TokenType != "refresh" || claims.ID == "" {
		return nil, errors.New("invalid refresh token")
	}
	user, err := uuid.Parse(claims.UserID)
	if err != nil {
		return nil, err
	}
	key := ""
	if len(retryKeys) > 0 {
		key = strings.TrimSpace(retryKeys[0])
	}
	if len(key) > 128 {
		return nil, errors.New("invalid refresh retry key")
	}
	hash := hashToken(refreshToken)
	var result dto.LoginResponse
	rejected := false
	err = database.GetDB().Transaction(func(tx *gorm.DB) error {
		// Serialize rotations/replay revocation for this user across token generations.
		var owner model.User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("uuid = ?", user).First(&owner).Error; err != nil {
			return err
		}
		var session model.RefreshSession
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_uuid = ? AND token_hash = ?", user, hash).First(&session).Error; err != nil {
			return err
		}
		now := time.Now()
		if !session.ExpiresAt.After(now) {
			return errors.New("expired refresh session")
		}
		crypt, err := s.refreshCipher()
		if err != nil {
			return err
		}
		if session.RevokedAt != nil {
			if key != "" && session.RetryKeyHash == hashToken(key) && session.RetryUntil != nil && now.Before(*session.RetryUntil) && len(session.RetryCiphertext) > crypt.NonceSize() {
				payload := session.RetryCiphertext
				plain, err := crypt.Open(nil, payload[:crypt.NonceSize()], payload[crypt.NonceSize():], []byte(hash))
				if err != nil {
					return err
				}
				if err := json.Unmarshal(plain, &result); err != nil {
					return err
				}
				var active model.RefreshSession
				return tx.Where("user_uuid = ? AND token_hash = ? AND revoked_at IS NULL AND expires_at > ?", user, hashToken(result.RefreshToken), now).First(&active).Error
			}
			rejected = true
			return tx.Model(&model.RefreshSession{}).Where("user_uuid = ? AND revoked_at IS NULL", user).Update("revoked_at", now).Error
		}
		result.AccessToken, err = token.GenerateAccessToken(s.cfg.JWTSecret, claims.UserID)
		if err != nil {
			return err
		}
		result.RefreshToken, err = token.GenerateRefreshToken(s.cfg.JWTSecret, claims.UserID)
		if err != nil {
			return err
		}
		next, err := token.Parse(s.cfg.JWTSecret, result.RefreshToken)
		if err != nil {
			return err
		}
		replacement := model.RefreshSession{UserUUID: user, TokenHash: hashToken(result.RefreshToken), JTI: next.ID, ExpiresAt: next.ExpiresAt.Time}
		if err := tx.Create(&replacement).Error; err != nil {
			return err
		}
		session.RevokedAt = &now
		if key != "" {
			plain, err := json.Marshal(result)
			if err != nil {
				return err
			}
			nonce := make([]byte, crypt.NonceSize())
			if _, err := rand.Read(nonce); err != nil {
				return err
			}
			session.RetryCiphertext = crypt.Seal(nonce, nonce, plain, []byte(hash))
			session.RetryKeyHash = hashToken(key)
			until := now.Add(2 * time.Minute)
			session.RetryUntil = &until
		}
		return tx.Save(&session).Error
	})
	if err != nil {
		return nil, err
	}
	if rejected {
		return nil, errors.New("refresh token replay: sessions revoked")
	}
	return &result, nil
}
