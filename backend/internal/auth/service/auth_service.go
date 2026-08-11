package service

import (
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/repository"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
)

type AuthService struct {
	repo *repository.AuthRepository
	cfg  *config.Config
}

func New(cfg *config.Config) *AuthService {
	return &AuthService{
		repo: repository.New(),
		cfg:  cfg,
	}
}
