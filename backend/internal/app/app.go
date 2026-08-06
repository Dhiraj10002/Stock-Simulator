package app

import (
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/router"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/logger"
)

type App struct{}

func New() *App {
	return &App{}
}

func (a *App) Run() error {

	cfg, err := config.Load()
	if err != nil {
		return err
	}

	if err := logger.Init(); err != nil {
		return err
	}
	defer logger.Sync()

	logger.Info("Starting Stock Simulator API")

	r := router.Setup()

	logger.Info("Server running on :" + cfg.Port)

	return r.Run(":" + cfg.Port)

    if err := database.Connect(cfg); err != nil {
	     return err
}
}