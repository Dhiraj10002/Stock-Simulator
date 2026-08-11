package service

import (
	"errors"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/auth/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"golang.org/x/crypto/bcrypt"
)

func (s *AuthService) Register(req dto.RegisterRequest) error {

	// Check if email already exists
	_, err := s.repo.FindByEmail(req.Email)
	if err == nil {
		return errors.New("email already exists")
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword(
		[]byte(req.Password),
		bcrypt.DefaultCost,
	)

	if err != nil {
		return err
	}

	user := &model.User{
		Name:     req.Name,
		Email:    req.Email,
		Password: string(hashedPassword),
	}

	return s.repo.Create(user)
}
