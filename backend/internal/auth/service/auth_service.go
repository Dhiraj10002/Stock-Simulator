package service

import (
	"errors"
	"fmt"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/repository"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/token"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/google/uuid"
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
