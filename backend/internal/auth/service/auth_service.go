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
	"github.com/google/uuid"
)

type AuthService struct {
	repo *repository.AuthRepository
	cfg  *config.Config
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
	if err != nil || claims.TokenType != "refresh" || claims.UserID == "" {
		return nil, errors.New("invalid refresh token")
	}

	session, err := s.repo.FindActiveRefreshSession(hashToken(refreshToken))
	if err != nil || session.UserUUID.String() != claims.UserID {
		return nil, errors.New("invalid refresh token")
	}

	accessToken, err := token.GenerateAccessToken(s.cfg.JWTSecret, claims.UserID)
	if err != nil {
		return nil, err
	}
	newRefreshToken, err := token.GenerateRefreshToken(s.cfg.JWTSecret, claims.UserID)
	if err != nil {
		return nil, err
	}

	if err := s.repo.RevokeRefreshSession(session.TokenHash); err != nil {
		return nil, err
	}
	if err := s.repo.CreateRefreshSession(&model.RefreshSession{
		UserUUID:  session.UserUUID,
		TokenHash: hashToken(newRefreshToken),
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
	}); err != nil {
		return nil, err
	}

	return &dto.LoginResponse{AccessToken: accessToken, RefreshToken: newRefreshToken}, nil
}

func (s *AuthService) Logout(refreshToken string) error {
	claims, err := token.Parse(s.cfg.JWTSecret, refreshToken)
	if err != nil || claims.TokenType != "refresh" {
		return errors.New("invalid refresh token")
	}
	if err := s.repo.RevokeRefreshSession(hashToken(refreshToken)); err != nil {
		return err
	}
	return nil
}

func New(cfg *config.Config) *AuthService {
	return &AuthService{
		repo: repository.New(),
		cfg:  cfg,
	}
}
