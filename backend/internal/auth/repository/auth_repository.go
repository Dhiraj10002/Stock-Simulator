package repository

import (
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
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
