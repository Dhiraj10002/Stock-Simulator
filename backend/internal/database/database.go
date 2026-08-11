package database

import (
	"log"
	"os"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormLogger "gorm.io/gorm/logger"
)

var db *gorm.DB

func Connect(cfg *config.Config) error {

	newLogger := gormLogger.New(
		log.New(os.Stdout, "", log.LstdFlags),
		gormLogger.Config{
			SlowThreshold:             time.Second,
			LogLevel:                  gormLogger.Warn,
			IgnoreRecordNotFoundError: true,
			Colorful:                  true,
		},
	)

	conn, err := gorm.Open(postgres.Open(cfg.DatabaseURL), &gorm.Config{
		Logger: newLogger,
	})

	if err != nil {
		return err
	}

	db = conn

	return nil
}

func GetDB() *gorm.DB {
	return db
}
