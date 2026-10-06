package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"gorm.io/gorm"
)

// Append a migration when models/indexes change; never edit an applied version.
const currentSchemaVersion int64 = 2026100601

type schemaMigration struct {
	version int64
	apply   func(*gorm.DB) error
}

var schemaMigrations = []schemaMigration{{2026100601, adoptBaselineSchema}}

type migrationReport struct {
	Version int64
	Applied int
	Forced  bool
}

func forceMigrations() bool { return os.Getenv("RUN_MIGRATION") == "true" }

func applicationModels() []any {
	return []any{&model.User{}, &model.RefreshSession{}, &model.Wallet{},
		&model.WalletTransaction{}, &model.Position{}, &model.Order{}, &model.Trade{},
		&model.SimulationReset{}, &model.Instrument{}, &model.InstrumentSnapshot{},
		&model.RiskEvent{}, &model.WatchlistItem{}, &model.AccountDailySnapshot{},
		&model.SettlementReference{}}
}

func migrateSchema(db *gorm.DB, force bool) (migrationReport, error) {
	report := migrationReport{Forced: force}
	if db == nil || db.Dialector.Name() != "postgres" {
		return report, fmt.Errorf("startup migrations require PostgreSQL")
	}
	var ledgerExists bool
	if err := db.Raw("SELECT to_regclass('app_schema_migrations') IS NOT NULL").Scan(&ledgerExists).Error; err != nil {
		return report, err
	}
	if ledgerExists {
		if err := db.Raw("SELECT COALESCE(MAX(version), 0) FROM app_schema_migrations").Scan(&report.Version).Error; err != nil {
			return report, err
		}
		if report.Version > currentSchemaVersion {
			return report, fmt.Errorf("database schema version %d is newer than this binary (%d)", report.Version, currentSchemaVersion)
		}
		if report.Version == currentSchemaVersion && !force {
			return report, validateApplicationSchema(db)
		}
	}

	err := db.Transaction(func(tx *gorm.DB) error {
		// Use the importer's lock order to serialize migration/activation and
		// simultaneous API starts. All DDL and the ledger commit together.
		if err := tx.Exec("SELECT pg_advisory_xact_lock(81003261003)").Error; err != nil {
			return err
		}
		if err := tx.Exec(`CREATE TABLE IF NOT EXISTS app_schema_migrations (
			version bigint PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)`).Error; err != nil {
			return err
		}
		if err := tx.Raw("SELECT COALESCE(MAX(version), 0) FROM app_schema_migrations").Scan(&report.Version).Error; err != nil {
			return err
		}
		if report.Version > currentSchemaVersion {
			return fmt.Errorf("database schema version %d is newer than this binary (%d)", report.Version, currentSchemaVersion)
		}
		for _, migration := range schemaMigrations {
			if migration.version <= report.Version {
				continue
			}
			if err := migration.apply(tx); err != nil {
				return fmt.Errorf("migration %d: %w", migration.version, err)
			}
			if err := tx.Exec("INSERT INTO app_schema_migrations (version) VALUES (?)", migration.version).Error; err != nil {
				return err
			}
			report.Version = migration.version
			report.Applied++
		}
		if force && report.Applied == 0 {
			if err := upgradeBaselineSchema(tx); err != nil {
				return err
			}
		}
		return validateApplicationSchema(tx)
	})
	return report, err
}

// Existing current schemas can adopt the ledger without re-running GORM's
// per-model introspection. Older/incomplete schemas still use the full upgrade.
func adoptBaselineSchema(tx *gorm.DB) error {
	if err := validateApplicationSchema(tx); err != nil {
		var missing *schemaValidationError
		if !errors.As(err, &missing) {
			return err
		}
		return upgradeBaselineSchema(tx)
	}
	return ensurePerformanceIndexes(tx)
}

func upgradeBaselineSchema(tx *gorm.DB) error {
	// Preserve legacy identity repair and reset epochs before model/index DDL.
	if err := model.UpgradeInstrumentSchema(tx); err != nil {
		return fmt.Errorf("upgrade instrument identities: %w", err)
	}
	if err := upgradeDailySnapshotIndex(tx); err != nil {
		return err
	}
	if err := tx.AutoMigrate(applicationModels()...); err != nil {
		return err
	}
	return ensurePerformanceIndexes(tx)
}

// Check required columns, integer-paise types and identity/idempotency indexes
// in one catalog query. This keeps restarts cheap without trusting the ledger
// when required schema objects have been removed or changed manually.
func validateApplicationSchema(db *gorm.DB) error {
	type column struct {
		Table        string `json:"table_name"`
		Name         string `json:"column_name"`
		IntegerPaise bool   `json:"integer_paise"`
		NotNull      bool   `json:"not_null"`
	}
	type index struct {
		Table   string   `json:"table_name"`
		Name    string   `json:"index_name"`
		Columns []string `json:"columns"`
		Unique  bool     `json:"unique_index"`
		Primary bool     `json:"primary_index"`
	}
	var columns []column
	var indexes []index
	for _, m := range applicationModels() {
		statement := &gorm.Statement{DB: db}
		if err := statement.Parse(m); err != nil {
			return err
		}
		for _, name := range statement.Schema.DBNames {
			field := statement.Schema.FieldsByDBName[name]
			columns = append(columns, column{statement.Schema.Table, name, strings.HasSuffix(name, "_paise"), field.NotNull})
		}
		if len(statement.Schema.PrimaryFieldDBNames) > 0 {
			indexes = append(indexes, index{Table: statement.Schema.Table, Columns: statement.Schema.PrimaryFieldDBNames, Unique: true, Primary: true})
		}
		for _, idx := range statement.Schema.ParseIndexes() {
			unique := idx.Class == "UNIQUE"
			if !unique && idx.Name != "idx_instruments_token_exchange" {
				continue
			}
			entry := index{Table: statement.Schema.Table, Name: idx.Name, Unique: unique}
			for _, field := range idx.Fields {
				entry.Columns = append(entry.Columns, field.DBName)
			}
			indexes = append(indexes, entry)
		}
	}
	columnPayload, err := json.Marshal(columns)
	if err != nil {
		return err
	}
	indexPayload, err := json.Marshal(indexes)
	if err != nil {
		return err
	}
	var missing []string
	if err := db.Raw(`WITH required_columns AS (
        SELECT * FROM jsonb_to_recordset(?::jsonb) AS r(table_name text,column_name text,integer_paise boolean,not_null boolean)
    ), required_indexes AS (
        SELECT * FROM jsonb_to_recordset(?::jsonb) AS r(table_name text,index_name text,columns text[],unique_index boolean,primary_index boolean)
    )
    SELECT table_name || '.' || column_name AS missing FROM required_columns r
    WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass(r.table_name)
        AND a.attname=r.column_name AND a.attnum>0 AND NOT a.attisdropped
        AND (NOT r.integer_paise OR a.atttypid='int8'::regtype)
        AND (NOT r.not_null OR a.attnotnull))
    UNION ALL
    SELECT r.table_name || '.' || COALESCE(NULLIF(r.index_name,''),'primary_key') FROM required_indexes r
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid
        WHERE i.indrelid=to_regclass(r.table_name)
        AND (CASE WHEN r.primary_index THEN i.indisprimary ELSE idx.relname=r.index_name END)
        AND i.indisunique=r.unique_index AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL
        AND i.indnkeyatts=cardinality(r.columns) AND i.indnatts=cardinality(r.columns)
        AND ARRAY(SELECT pg_get_indexdef(i.indexrelid,k,true) FROM generate_series(1,i.indnkeyatts) k ORDER BY 1)
            = ARRAY(SELECT unnest(r.columns) ORDER BY 1))`, string(columnPayload), string(indexPayload)).Scan(&missing).Error; err != nil {
		return err
	}
	if len(missing) > 0 {
		return &schemaValidationError{missing: missing}
	}
	return nil
}

type schemaValidationError struct{ missing []string }

func (e *schemaValidationError) Error() string {
	return fmt.Sprintf("schema validation failed (%s); repair with RUN_MIGRATION=true", strings.Join(e.missing, ", "))
}
