package service

import (
	"errors"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/token"
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

	return &dto.LoginResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	}, nil
}
