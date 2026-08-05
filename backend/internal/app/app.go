package app

import (
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/router"
)

type App struct {
}

func New() *App {
	return &App{}
}

func (a *App) Run() error {

	cfg, err := config.Load()
	if err != nil {
		return err
	}

	router := router.Setup()

	return router.Run(":" + cfg.Port)
}