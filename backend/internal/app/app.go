package app

import (
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/router"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/logger"
)

type App struct{}

func New() *App {
	return &App{}
}

func (a *App) Run() error {

	// Load Configuration
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	// Initialize Logger
	if err := logger.Init(); err != nil {
		return err
	}
	defer logger.Sync()

	logger.Info("Configuration Loaded")

	// Connect Database
	if err := database.Connect(cfg); err != nil {
		return err
	}

	logger.Info("Database Connected")

	// Run Migrations
	if err := database.GetDB().AutoMigrate(
		&model.User{},
		&model.RefreshSession{},
		&model.Wallet{},
		&model.WalletTransaction{},
		&model.Position{},
		&model.Order{},
		&model.Trade{},
		&model.SimulationReset{},
	); err != nil {
		return err
	}

	logger.Info("Database Migration Completed")

	// Setup Router
	r := router.Setup(cfg)

	logger.Info("Starting HTTP Server on :" + cfg.Port)

	return r.Run(":" + cfg.Port)
}
