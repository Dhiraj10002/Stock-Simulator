package app

import (
	"strings"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/testutil"
	"github.com/google/uuid"
)

func TestRequiredSchemaUpgradeRepairsExistingDatabase(t *testing.T) {
	db := testutil.RequireDisposableDB(t)
	for _, legacy := range []bool{false, true} {
		t.Run(map[bool]string{false: "missing_daily_snapshots", true: "legacy_snapshot_epoch"}[legacy], func(t *testing.T) {
			// All DDL and seed rows are isolated and rolled back; application tables are untouched.
			tx := db.Begin()
			if tx.Error != nil {
				t.Fatal(tx.Error)
			}
			defer tx.Rollback()
			schema := "runtime_upgrade_" + strings.ReplaceAll(uuid.NewString(), "-", "")
			if err := tx.Exec("CREATE SCHEMA " + schema).Error; err != nil {
				t.Fatal(err)
			}
			if err := tx.Exec("SET LOCAL search_path TO " + schema).Error; err != nil {
				t.Fatal(err)
			}
			if err := tx.AutoMigrate(&model.User{}); err != nil {
				t.Fatal(err)
			}
			user := uuid.New()
			if legacy {
				if err := tx.Exec(`CREATE TABLE account_daily_snapshots (
					id bigserial PRIMARY KEY, user_uuid uuid NOT NULL, session_date date NOT NULL,
					opening_cash_paise bigint NOT NULL, opening_holdings_value_paise bigint NOT NULL,
					opening_equity_paise bigint NOT NULL, net_cash_inflows_paise bigint NOT NULL DEFAULT 0,
					created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP);
					CREATE UNIQUE INDEX idx_daily_snapshots_user_date ON account_daily_snapshots (user_uuid, session_date)`).Error; err != nil {
					t.Fatal(err)
				}
				if err := tx.Exec("INSERT INTO account_daily_snapshots (user_uuid,session_date,opening_cash_paise,opening_holdings_value_paise,opening_equity_paise) VALUES (?, '2026-10-03',12345,0,12345)", user).Error; err != nil {
					t.Fatal(err)
				}
			}
			for i := 0; i < 2; i++ {
				if err := upgradeRequiredSchema(tx); err != nil {
					t.Fatal(err)
				}
			}
			if !tx.Migrator().HasTable(&model.AccountDailySnapshot{}) || !tx.Migrator().HasColumn(&model.AccountDailySnapshot{}, "Epoch") {
				t.Fatal("portfolio baseline schema was not repaired")
			}
			if legacy {
				var row model.AccountDailySnapshot
				if err := tx.Where("user_uuid = ?", user).First(&row).Error; err != nil {
					t.Fatal(err)
				}
				if row.OpeningCashPaise != 12345 || row.Epoch != "" {
					t.Fatal("existing baseline was not preserved")
				}
				if err := tx.Create(&model.AccountDailySnapshot{UserUUID: user, SessionDate: "2026-10-03", Epoch: "reset-epoch"}).Error; err != nil {
					t.Fatalf("legacy unique index did not allow a new reset epoch: %v", err)
				}
			}
		})
	}
}
