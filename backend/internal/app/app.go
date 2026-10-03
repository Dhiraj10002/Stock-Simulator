package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/router"
	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/logger"
	"gorm.io/gorm"
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

	// Provider tokens are recyclable. Historical identity is symbol + segment.
	if err := model.UpgradeInstrumentTokenIndex(database.GetDB()); err != nil {
		return err
	}
	// Run Migrations if tables do not exist or if explicitly requested
	shouldMigrate := os.Getenv("RUN_MIGRATION") == "true" || !database.GetDB().Migrator().HasTable(&model.User{})
	if shouldMigrate {
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
			&model.InstrumentSnapshot{},
			&model.RiskEvent{},
			&model.WatchlistItem{},
			&model.AccountDailySnapshot{},
		); err != nil {
			return err
		}
		logger.Info("Database Migration Completed")
	} else {
		logger.Info("Existing database detected; checking required schema upgrades")
		if !database.GetDB().Migrator().HasColumn(&model.Trade{}, "Tag") {
			_ = database.GetDB().AutoMigrate(&model.Trade{})
			logger.Info("Auto-migrated Trade model (Tag & Notes columns)")
		}
		if !database.GetDB().Migrator().HasColumn(&model.RefreshSession{}, "JTI") {
			_ = database.GetDB().AutoMigrate(&model.RefreshSession{})
			logger.Info("Auto-migrated RefreshSession model (JTI column)")
		}
		if !database.GetDB().Migrator().HasColumn(&model.Instrument{}, "Active") || !database.GetDB().Migrator().HasColumn(&model.Instrument{}, "Exchange") || !database.GetDB().Migrator().HasColumn(&model.Instrument{}, "IsTradable") {
			_ = database.GetDB().AutoMigrate(&model.Instrument{})
			logger.Info("Auto-migrated Instrument model (Exchange, Active & IsTradable columns)")
		}
		if !database.GetDB().Migrator().HasTable(&model.InstrumentSnapshot{}) {
			_ = database.GetDB().AutoMigrate(&model.InstrumentSnapshot{})
			logger.Info("Auto-migrated InstrumentSnapshot table")
		}
	}

	// Required additive upgrade: fail startup rather than run without durable exits.
	if err := upgradeRequiredSchema(database.GetDB()); err != nil {
		return fmt.Errorf("upgrade required trading and portfolio schema: %w", err)
	}
	logger.Info("Required trading and portfolio schema upgrades verified")
	ensurePerformanceIndexes(database.GetDB())

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

func upgradeRequiredSchema(db *gorm.DB) error {
	if db.Migrator().HasTable(&model.AccountDailySnapshot{}) && !db.Migrator().HasColumn(&model.AccountDailySnapshot{}, "Epoch") && db.Migrator().HasIndex(&model.AccountDailySnapshot{}, "idx_daily_snapshots_user_date") {
		if err := model.DropIndexInTableSchema(db, model.AccountDailySnapshot{}.TableName(), "idx_daily_snapshots_user_date"); err != nil {
			return err
		}
	}
	return db.AutoMigrate(&model.Order{}, &model.RefreshSession{}, &model.SettlementReference{}, &model.AccountDailySnapshot{}, &model.Instrument{}, &model.InstrumentSnapshot{})
}

func ensurePerformanceIndexes(db *gorm.DB) {
	if db == nil {
		return
	}
	indexes := []string{
		"CREATE INDEX IF NOT EXISTS idx_orders_symbol_status_created ON orders (symbol, status, created_at ASC)",
		"CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders (user_uuid, created_at DESC)",
		"CREATE INDEX IF NOT EXISTS idx_positions_user_symbol ON positions (user_uuid, symbol)",
		"CREATE INDEX IF NOT EXISTS idx_positions_user_qty ON positions (user_uuid, quantity)",
		"CREATE INDEX IF NOT EXISTS idx_trades_user_executed ON trades (user_uuid, executed_at DESC)",
		"CREATE INDEX IF NOT EXISTS idx_watchlist_user_symbol_sort ON watchlist_items (user_uuid, symbol ASC)",
		"CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets (user_uuid, id ASC)",
	}
	for _, idx := range indexes {
		_ = db.Exec(idx).Error
	}
}
