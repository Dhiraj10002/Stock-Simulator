package database

import (
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func Connect(cfg *config.Config) error {

	db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{})
	if err != nil {
		return err
	}

	DB = db

	return nil
}

func GetDB() *gorm.DB {
	return DB
}