package database

import (
	"context"
	"net"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
)

func getTestDatabase(t *testing.T) {
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@127.0.0.1:5433/testdb?sslmode=disable"
	}
	conn, err := net.DialTimeout("tcp", "127.0.0.1:5433", 50*time.Millisecond)
	if err != nil {
		t.Skipf("PostgreSQL not accessible at 127.0.0.1:5433 (%v); skipping DB performance index test", err)
		return
	}
	_ = conn.Close()

	if err := Connect(&config.Config{DatabaseURL: dbURL}); err != nil {
		t.Skipf("PostgreSQL connection failed (%v); skipping DB performance index test", err)
		return
	}
	dbConn := GetDB()
	if dbConn == nil {
		t.Skip("PostgreSQL db connection is nil; skipping test")
		return
	}
	_ = dbConn.AutoMigrate(
		&model.User{},
		&model.Wallet{},
		&model.WalletTransaction{},
		&model.Position{},
		&model.Order{},
		&model.Trade{},
		&model.Instrument{},
		&model.RiskEvent{},
		&model.RefreshSession{},
		&model.WatchlistItem{},
		&model.SimulationReset{},
	)
}

func TestPhase26_DatabaseIndexCoverage(t *testing.T) {
	getTestDatabase(t)
	dbConn := GetDB()
	if dbConn == nil {
		return
	}

	requiredIndexes := map[string][]string{
		"orders": {
			"idx_orders_user_uuid",
			"idx_orders_symbol",
			"idx_orders_status",
			"idx_orders_uuid",
		},
		"positions": {
			"idx_positions_user_uuid",
			"idx_positions_symbol",
			"idx_positions_uuid",
		},
		"trades": {
			"idx_trades_user_uuid",
			"idx_trades_order_uuid",
			"idx_trades_symbol",
			"idx_trades_uuid",
		},
		"wallets": {
			"idx_wallets_user_uuid",
			"idx_wallets_uuid",
		},
		"wallet_transactions": {
			"idx_wallet_transactions_wallet_uuid",
			"idx_wallet_transactions_type",
		},
		"instruments": {
			"idx_instruments_symbol",
			"idx_instruments_token_exchange",
		},
	}

	type indexRecord struct {
		IndexName string `gorm:"column:indexname"`
	}

	for table, expectedIdxs := range requiredIndexes {
		var records []indexRecord
		err := dbConn.Raw("SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = ?", table).Scan(&records).Error
		if err != nil {
			t.Fatalf("failed to query pg_indexes for table %s: %v", table, err)
		}

		existingMap := make(map[string]bool)
		for _, r := range records {
			existingMap[r.IndexName] = true
		}

		for _, expected := range expectedIdxs {
			if !existingMap[expected] {
				t.Errorf("table %s is missing critical index %s", table, expected)
			}
		}
	}
}

func TestPhase26_QueryPlansUseIndexScans(t *testing.T) {
	getTestDatabase(t)
	dbConn := GetDB()
	if dbConn == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	queries := []struct {
		name          string
		query         string
		expectedIndex string
	}{
		{
			name:          "Order user query uses idx_orders_user_uuid",
			query:         "EXPLAIN SELECT * FROM orders WHERE user_uuid = '00000000-0000-0000-0000-000000000000'",
			expectedIndex: "idx_orders_user_uuid",
		},
		{
			name:          "Position user query uses idx_positions_user_uuid",
			query:         "EXPLAIN SELECT * FROM positions WHERE user_uuid = '00000000-0000-0000-0000-000000000000'",
			expectedIndex: "idx_positions_user_uuid",
		},
		{
			name:          "Trade user query uses idx_trades_user_uuid",
			query:         "EXPLAIN SELECT * FROM trades WHERE user_uuid = '00000000-0000-0000-0000-000000000000'",
			expectedIndex: "idx_trades_user_uuid",
		},
		{
			name:          "Instrument symbol query uses idx_instruments_symbol",
			query:         "EXPLAIN SELECT * FROM instruments WHERE symbol = 'INFY'",
			expectedIndex: "idx_instruments_symbol",
		},
	}

	for _, q := range queries {
		t.Run(q.name, func(t *testing.T) {
			tx := dbConn.WithContext(ctx).Begin()
			defer tx.Rollback()

			if err := tx.Exec("SET LOCAL enable_seqscan = off").Error; err != nil {
				t.Fatalf("failed to set enable_seqscan=off: %v", err)
			}

			var lines []string
			rows, err := tx.Raw(q.query).Rows()
			if err != nil {
				t.Fatalf("failed to explain query: %v", err)
			}
			defer rows.Close()

			for rows.Next() {
				var line string
				if err := rows.Scan(&line); err != nil {
					t.Fatalf("scan error: %v", err)
				}
				lines = append(lines, line)
			}

			plan := strings.Join(lines, "\n")
			if !strings.Contains(plan, q.expectedIndex) {
				t.Fatalf("query plan did not use expected index %s. Plan:\n%s", q.expectedIndex, plan)
			}
		})
	}
}
