package app

import (
	"fmt"
	"strings"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"gorm.io/gorm"
)

func upgradeDailySnapshotIndex(db *gorm.DB) error {
	if db.Migrator().HasTable(&model.AccountDailySnapshot{}) && !db.Migrator().HasColumn(&model.AccountDailySnapshot{}, "Epoch") && db.Migrator().HasIndex(&model.AccountDailySnapshot{}, "idx_daily_snapshots_user_date") {
		if err := model.DropIndexInTableSchema(db, model.AccountDailySnapshot{}.TableName(), "idx_daily_snapshots_user_date"); err != nil {
			return err
		}
	}
	return nil
}

func upgradeRequiredSchema(db *gorm.DB) error {
	if err := upgradeDailySnapshotIndex(db); err != nil {
		return err
	}
	return db.AutoMigrate(&model.Order{}, &model.RefreshSession{}, &model.SettlementReference{}, &model.AccountDailySnapshot{}, &model.Instrument{}, &model.InstrumentSnapshot{})
}

func ensurePerformanceIndexes(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("database unavailable")
	}
	// These are constant statements with no parameters; pgx uses the simple
	// protocol, avoiding a separate network round trip for each index.
	if err := db.Exec(strings.Join(performanceIndexStatements(), ";\n")).Error; err != nil {
		return fmt.Errorf("create performance indexes: %w", err)
	}
	return nil
}

func performanceIndexStatements() []string {
	return []string{
		"CREATE INDEX IF NOT EXISTS idx_orders_symbol_status_created ON orders (symbol, status, created_at ASC)",
		"CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders (user_uuid, created_at DESC)",
		"CREATE INDEX IF NOT EXISTS idx_orders_user_status_created ON orders (user_uuid, status, created_at DESC)",
		"CREATE INDEX IF NOT EXISTS idx_orders_open_status ON orders (status, created_at ASC)",
		"CREATE INDEX IF NOT EXISTS idx_positions_user_symbol ON positions (user_uuid, symbol)",
		"CREATE INDEX IF NOT EXISTS idx_positions_user_qty ON positions (user_uuid, quantity)",
		"CREATE INDEX IF NOT EXISTS idx_positions_user_qty_symbol ON positions (user_uuid, quantity, symbol ASC)",
		"CREATE INDEX IF NOT EXISTS idx_positions_fno_settlement ON positions (product, quantity, settlement_state)",
		"CREATE INDEX IF NOT EXISTS idx_trades_user_executed ON trades (user_uuid, executed_at DESC)",
		"CREATE INDEX IF NOT EXISTS idx_trades_user_executed_pnl ON trades (user_uuid, executed_at DESC, realized_pnl_paise)",
		"CREATE INDEX IF NOT EXISTS idx_watchlist_user_symbol_sort ON watchlist_items (user_uuid, symbol ASC)",
		"CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets (user_uuid, id ASC)",
		"CREATE INDEX IF NOT EXISTS idx_instruments_fno_catalog ON instruments (active, is_tradable, instrument_type, symbol ASC)",
		"CREATE INDEX IF NOT EXISTS idx_instruments_segment_expiry ON instruments (is_tradable, exchange_segment, expiry)",
		"CREATE INDEX IF NOT EXISTS idx_instruments_upper_symbol ON instruments (UPPER(symbol))",
		"CREATE INDEX IF NOT EXISTS idx_instruments_upper_name ON instruments (UPPER(name))",
		"CREATE INDEX IF NOT EXISTS idx_instruments_tradable_active_id ON instruments (is_tradable DESC, active DESC, id ASC)",
		"CREATE INDEX IF NOT EXISTS idx_wallet_tx_uuid_created ON wallet_transactions (wallet_uuid, created_at DESC, type)",
		"CREATE INDEX IF NOT EXISTS idx_wallet_tx_uuid_type_created ON wallet_transactions (wallet_uuid, type, created_at DESC, id DESC)",
		"CREATE INDEX IF NOT EXISTS idx_account_daily_snapshots_lookup ON account_daily_snapshots (user_uuid, session_date, epoch)",
	}
}
