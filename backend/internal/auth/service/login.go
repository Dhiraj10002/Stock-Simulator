package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/token"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"golang.org/x/crypto/bcrypt"
)

func (s *AuthService) Login(req dto.LoginRequest) (*dto.LoginResponse, error) {

	user, err := s.repo.FindByEmail(req.Email)
	if err != nil {
		return nil, errors.New("invalid credentials")
	}

	err = bcrypt.CompareHashAndPassword(
		[]byte(user.Password),
		[]byte(req.Password),
	)

	if err != nil {
		return nil, errors.New("invalid credentials")
	}

	accessToken, err := token.GenerateAccessToken(
		s.cfg.JWTSecret,
		user.UUID.String(),
	)
	if err != nil {
		return nil, err
	}

	refreshToken, err := token.GenerateRefreshToken(
		s.cfg.JWTSecret,
		user.UUID.String(),
	)
	if err != nil {
		return nil, err
	}

	refreshClaims, err := token.Parse(s.cfg.JWTSecret, refreshToken)
	if err != nil {
		return nil, err
	}

	if err := s.repo.CreateRefreshSession(&model.RefreshSession{
		UserUUID:  user.UUID,
		TokenHash: hashToken(refreshToken),
		JTI:       refreshClaims.ID,
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
	}); err != nil {
		return nil, err
	}

	return &dto.LoginResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	}, nil
}

func hashToken(value string) string {
	hash := sha256.Sum256([]byte(value))
	return hex.EncodeToString(hash[:])
}
