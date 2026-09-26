package service

import (
	"errors"
	"fmt"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/repository"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/token"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/logger"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

type AuthService struct {
	repo *repository.AuthRepository
	cfg  *config.Config
}

func New(cfg *config.Config) *AuthService {
	return &AuthService{repo: repository.New(), cfg: cfg}
}

func (s *AuthService) CurrentUser(userID string) (*dto.CurrentUserResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user identity")
	}

	user, err := s.repo.FindByUUID(userUUID)
	if err != nil {
		return nil, err
	}

	return &dto.CurrentUserResponse{
		ID:    user.ID,
		UUID:  user.UUID.String(),
		Name:  user.Name,
		Email: user.Email,
	}, nil
}

func (s *AuthService) Refresh(refreshToken string) (*dto.LoginResponse, error) {
	claims, err := token.Parse(s.cfg.JWTSecret, refreshToken)
	if err != nil ||
		claims.TokenType != "refresh" ||
		claims.UserID == "" ||
		claims.ID == "" {
		return nil, errors.New("invalid refresh token")
	}

	userUUID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return nil, errors.New("invalid refresh token")
	}

	presentTokenHash := hashToken(refreshToken)

	// Security: Token Reuse Detection
	// Check if this token was already revoked. If an adversary attempts to reuse
	// an old/compromised refresh token, revoke ALL active sessions for that user immediately.
	existingSession, err := s.repo.FindByTokenHash(presentTokenHash)
	if err == nil && existingSession != nil && existingSession.RevokedAt != nil {
		_ = s.repo.RevokeAllUserSessions(userUUID)
		logger.Warn("Security Alert: Revoked refresh token presented (potential token theft/replay). Revoked all active sessions for user.",
			zap.String("user_uuid", userUUID.String()),
			zap.String("compromised_jti", claims.ID),
		)
		return nil, errors.New("invalid refresh token: session revoked")
	}

	accessToken, err := token.GenerateAccessToken(
		s.cfg.JWTSecret,
		claims.UserID,
	)
	if err != nil {
		return nil, err
	}

	newRefreshToken, err := token.GenerateRefreshToken(
		s.cfg.JWTSecret,
		claims.UserID,
	)
	if err != nil {
		return nil, err
	}

	newClaims, err := token.Parse(s.cfg.JWTSecret, newRefreshToken)
	if err != nil {
		return nil, err
	}

	newSession := &model.RefreshSession{
		UserUUID:  userUUID,
		TokenHash: hashToken(newRefreshToken),
		JTI:       newClaims.ID,
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
	}

	if err := s.repo.RotateRefreshSession(
		userUUID,
		presentTokenHash,
		newSession,
	); err != nil {
		return nil, errors.New("invalid refresh token")
	}

	return &dto.LoginResponse{
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
	}, nil
}

func (s *AuthService) Logout(refreshToken string) error {
	claims, err := token.Parse(s.cfg.JWTSecret, refreshToken)
	if err != nil || claims.TokenType != "refresh" || claims.UserID == "" || claims.ID == "" {
		return errors.New("invalid refresh token")
	}
	if err := s.repo.RevokeRefreshSession(hashToken(refreshToken)); err != nil {
		return errors.New("invalid refresh token")
	}
	return nil
}
