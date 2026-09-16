package app

import (
	"context"
	"errors"
	"net/http"
	"os/signal"
	"syscall"
	"time"

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
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	return a.RunWithContext(ctx)
}

func (a *App) RunWithContext(ctx context.Context) error {
	// Worker context for background lifecycle workers
	workerCtx, cancelWorkers := context.WithCancel(context.Background())
	defer cancelWorkers()

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
		&model.Instrument{},
		&model.RiskEvent{},
		&model.WatchlistItem{},
	); err != nil {
		return err
	}

	logger.Info("Database Migration Completed")

	// Setup Router with worker context
	r := router.Setup(workerCtx, cfg)

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: r,
	}

	serverErrors := make(chan error, 1)
	go func() {
		logger.Info("Starting HTTP Server on :" + cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrors <- err
		}
	}()

	select {
	case err := <-serverErrors:
		return err
	case <-ctx.Done():
		logger.Info("Shutdown signal received")
	}

	// 1. Cancel root context to cleanly terminate RunMatcher, RunProductLifecycle, and RunExpirySettlement
	cancelWorkers()
	logger.Info("Background worker contexts cancelled")

	// 2. Shut down HTTP server with a 10s timeout to allow in-flight requests to complete
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("HTTP server graceful shutdown failed: " + err.Error())
		_ = srv.Close()
		return err
	}

	logger.Info("HTTP server gracefully stopped")
	return nil
}
