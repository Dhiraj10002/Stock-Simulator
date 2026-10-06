package app

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/testutil"
	"github.com/google/uuid"
	"gorm.io/gorm"
	gormLogger "gorm.io/gorm/logger"
)

type queryRecorder struct {
	gormLogger.Interface
	queries []string
}

func (r *queryRecorder) Trace(_ context.Context, _ time.Time, fc func() (string, int64), _ error) {
	query, _ := fc()
	r.queries = append(r.queries, query)
}

func isolatedSchema(t *testing.T) *gorm.DB {
	t.Helper()
	tx := testutil.RequireDisposableDB(t).Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	t.Cleanup(func() { tx.Rollback() })
	schema := "startup_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	for _, sql := range []string{"CREATE SCHEMA " + schema, "SET LOCAL search_path TO " + schema} {
		if err := tx.Exec(sql).Error; err != nil {
			t.Fatal(err)
		}
	}
	return tx
}

func TestSchemaMigrationFreshThenReadOnlyRestart(t *testing.T) {
	tx := isolatedSchema(t)
	report, err := migrateSchema(tx, false)
	if err != nil {
		t.Fatal(err)
	}
	if report.Version != currentSchemaVersion || report.Applied != 1 {
		t.Fatalf("unexpected fresh migration: %+v", report)
	}
	user := model.User{Name: "Test", Email: uuid.NewString() + "@test.local", Password: "test"}
	if err := tx.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	wallet := model.Wallet{UserUUID: user.UUID, CashBalancePaise: 123456, BlockedPaise: 2345}
	if err := tx.Create(&wallet).Error; err != nil {
		t.Fatal(err)
	}
	recorder := &queryRecorder{Interface: gormLogger.Default}
	report, err = migrateSchema(tx.Session(&gorm.Session{Logger: recorder}), false)
	if err != nil {
		t.Fatal(err)
	}
	if report.Applied != 0 || len(recorder.queries) != 3 {
		t.Fatalf("warm restart should perform three reads: %+v %v", report, recorder.queries)
	}
	for _, query := range recorder.queries {
		upper := strings.ToUpper(strings.TrimSpace(query))
		if !strings.HasPrefix(upper, "SELECT") && !strings.HasPrefix(upper, "WITH") {
			t.Fatalf("warm restart ran DDL: %s", query)
		}
	}
	var after model.Wallet
	if err := tx.First(&after, wallet.ID).Error; err != nil {
		t.Fatal(err)
	}
	if after.CashBalancePaise != wallet.CashBalancePaise || after.BlockedPaise != wallet.BlockedPaise {
		t.Fatal("restart changed financial state")
	}
}

func TestSchemaMigrationAdoptsLegacyEpochAndContractIdentity(t *testing.T) {
	tx := isolatedSchema(t)
	if err := tx.AutoMigrate(&model.User{}, &model.Instrument{}); err != nil {
		t.Fatal(err)
	}
	if err := tx.Exec(`DROP INDEX idx_instruments_contract;
		DROP INDEX idx_instruments_token_exchange;
		CREATE UNIQUE INDEX idx_instruments_token_exchange ON instruments (token, exchange_segment);
		CREATE TABLE account_daily_snapshots (
			id bigserial PRIMARY KEY, user_uuid uuid NOT NULL, session_date date NOT NULL,
			opening_cash_paise bigint NOT NULL, opening_holdings_value_paise bigint NOT NULL,
			opening_equity_paise bigint NOT NULL, net_cash_inflows_paise bigint NOT NULL DEFAULT 0,
			created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP);
		CREATE UNIQUE INDEX idx_daily_snapshots_user_date ON account_daily_snapshots (user_uuid, session_date)`).Error; err != nil {
		t.Fatal(err)
	}
	user := uuid.New()
	if err := tx.Exec("INSERT INTO account_daily_snapshots (user_uuid,session_date,opening_cash_paise,opening_holdings_value_paise,opening_equity_paise) VALUES (?, '2026-10-03',12345,0,12345)", user).Error; err != nil {
		t.Fatal(err)
	}
	seedDuplicate(t, tx, "100", "", time.Now().Add(-time.Hour))
	seedDuplicate(t, tx, "200", "", time.Now())
	if _, err := migrateSchema(tx, false); err != nil {
		t.Fatal(err)
	}
	var rows []model.AccountDailySnapshot
	if err := tx.Find(&rows).Error; err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].OpeningCashPaise != 12345 || rows[0].Epoch != "" {
		t.Fatalf("legacy baseline changed: %+v", rows)
	}
	if err := tx.Create(&model.AccountDailySnapshot{UserUUID: user, SessionDate: "2026-10-03", Epoch: "new-reset"}).Error; err != nil {
		t.Fatal(err)
	}
	var archiveCount int64
	if err := tx.Model(&model.InstrumentDuplicateArchive{}).Count(&archiveCount).Error; err != nil {
		t.Fatal(err)
	}
	if archiveCount != 2 {
		t.Fatalf("duplicate archive missing: %d", archiveCount)
	}
	for _, symbol := range []string{"OLDCE", "NEWCE"} {
		if err := tx.Create(&model.Instrument{Symbol: symbol, Name: symbol, Token: "50001", ExchangeSegment: "NFO"}).Error; err != nil {
			t.Fatal(err)
		}
	}
}

func TestCurrentSchemaAdoptionSkipsModelIntrospection(t *testing.T) {
	tx := isolatedSchema(t)
	if _, err := migrateSchema(tx, false); err != nil {
		t.Fatal(err)
	}
	// Emulate a current installation created before the migration ledger.
	if err := tx.Exec("DROP TABLE app_schema_migrations").Error; err != nil {
		t.Fatal(err)
	}
	recorder := &queryRecorder{Interface: gormLogger.Default}
	report, err := migrateSchema(tx.Session(&gorm.Session{Logger: recorder}), false)
	if err != nil || report.Applied != 1 {
		t.Fatalf("adoption failed: %+v %v", report, err)
	}
	for _, query := range recorder.queries {
		upper := strings.ToUpper(query)
		if strings.Contains(upper, "INFORMATION_SCHEMA") || strings.Contains(upper, "ALTER TABLE") {
			t.Fatalf("current schema was fully migrated again: %s", query)
		}
	}
}

func TestSchemaMigrationDetectsDriftAndExplicitRepair(t *testing.T) {
	tx := isolatedSchema(t)
	if _, err := migrateSchema(tx, false); err != nil {
		t.Fatal(err)
	}
	if err := tx.Exec("ALTER TABLE trades DROP COLUMN tag").Error; err != nil {
		t.Fatal(err)
	}
	if _, err := migrateSchema(tx, false); err == nil || !strings.Contains(err.Error(), "trades.tag") {
		t.Fatalf("damaged schema passed restart: %v", err)
	}
	if _, err := migrateSchema(tx, true); err != nil {
		t.Fatalf("explicit repair failed: %v", err)
	}
	if err := tx.Exec(`DROP INDEX idx_instruments_contract;
		CREATE UNIQUE INDEX idx_instruments_contract ON instruments (token, exchange_segment)`).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := migrateSchema(tx, false); err == nil || !strings.Contains(err.Error(), "idx_instruments_contract") {
		t.Fatalf("wrong identity index passed restart: %v", err)
	}
	if _, err := migrateSchema(tx, true); err != nil {
		t.Fatalf("legacy identity repair failed: %v", err)
	}
	if err := tx.Exec("INSERT INTO app_schema_migrations (version) VALUES (?)", currentSchemaVersion+1).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := migrateSchema(tx, true); err == nil || !strings.Contains(err.Error(), "newer than this binary") {
		t.Fatalf("old binary accepted future schema: %v", err)
	}
}

func TestSchemaMigrationRollsBackOnFailure(t *testing.T) {
	tx := isolatedSchema(t)
	if err := tx.Exec(`CREATE TABLE wallets (id bigserial PRIMARY KEY, cash_balance_paise text);
		INSERT INTO wallets (cash_balance_paise) VALUES ('unconvertible')`).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := migrateSchema(tx, false); err == nil {
		t.Fatal("invalid existing data should fail migration")
	}
	var exists bool
	if err := tx.Raw("SELECT to_regclass('app_schema_migrations') IS NOT NULL").Scan(&exists).Error; err != nil {
		t.Fatal(err)
	}
	if exists {
		t.Fatal("failed migration committed its ledger")
	}
	var original string
	if err := tx.Raw("SELECT cash_balance_paise FROM wallets").Scan(&original).Error; err != nil {
		t.Fatal(err)
	}
	if original != "unconvertible" {
		t.Fatal("failed migration changed original data")
	}
}

func TestWarmSchemaRejectsBrokenExitIdempotencyAndMoneyTypes(t *testing.T) {
	tx := isolatedSchema(t)
	if _, err := migrateSchema(tx, false); err != nil {
		t.Fatal(err)
	}
	if err := tx.Exec("DROP INDEX idx_order_exit_key").Error; err != nil {
		t.Fatal(err)
	}
	if _, err := migrateSchema(tx, false); err == nil || !strings.Contains(err.Error(), "idx_order_exit_key") {
		t.Fatalf("exit retry uniqueness was not checked: %v", err)
	}
	if _, err := migrateSchema(tx, true); err != nil {
		t.Fatal(err)
	}
	if err := tx.Exec("ALTER TABLE wallets ALTER COLUMN cash_balance_paise TYPE numeric").Error; err != nil {
		t.Fatal(err)
	}
	if _, err := migrateSchema(tx, false); err == nil || !strings.Contains(err.Error(), "cash_balance_paise") {
		t.Fatalf("integer paise storage was not checked: %v", err)
	}
}

func TestConcurrentSchemaAdoptionAppliesOnce(t *testing.T) {
	db := testutil.RequireDisposableDB(t)
	schema := "startup_concurrent_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if err := db.Exec("CREATE SCHEMA " + schema).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec("DROP SCHEMA " + schema + " CASCADE") })
	type result struct {
		report migrationReport
		err    error
	}
	results := make(chan result, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			var report migrationReport
			err := db.Connection(func(session *gorm.DB) error {
				if err := session.Exec("SET search_path TO " + schema).Error; err != nil {
					return err
				}
				defer session.Exec("RESET search_path")
				var err error
				report, err = migrateSchema(session, false)
				return err
			})
			results <- result{report, err}
		}()
	}
	wg.Wait()
	close(results)
	applied := 0
	for result := range results {
		if result.err != nil {
			t.Fatal(result.err)
		}
		applied += result.report.Applied
	}
	if applied != 1 {
		t.Fatalf("migration ran %d times", applied)
	}
}
