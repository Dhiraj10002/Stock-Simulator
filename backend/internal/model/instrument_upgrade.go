package model

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"gorm.io/gorm"
)

// InstrumentDuplicateArchive retains every original row of a repaired duplicate
// group, including its survivor before quarantine. Trading records use symbols,
// not instrument IDs, and are never rewritten by this upgrade.
type InstrumentDuplicateArchive struct {
	OriginalID        uint      `gorm:"primaryKey;autoIncrement:false"`
	SurvivorID        uint      `gorm:"not null"`
	Symbol            string    `gorm:"size:80;not null;index"`
	ExchangeSegment   string    `gorm:"size:16;not null"`
	WasKept           bool      `gorm:"not null"`
	CanonicalVerified bool      `gorm:"not null"`
	Reason            string    `gorm:"size:80;not null"`
	OriginalPayload   string    `gorm:"type:jsonb;not null"`
	ArchivedAt        time.Time `gorm:"not null"`
}

// UpgradeInstrumentSchema must precede any AutoMigrate of Instrument, both in
// application startup and in the importer. A new unique index cannot be added
// before old token-based imports' duplicate contract identities are repaired.
func UpgradeInstrumentSchema(db *gorm.DB) error {
	if db.Dialector.Name() != "postgres" {
		return UpgradeInstrumentTokenIndex(db)
	}
	var counts instrumentUpgradeCounts
	err := db.Transaction(func(tx *gorm.DB) error {
		if err := upgradeInstrumentContractIndex(tx, &counts); err != nil {
			return err
		}
		return UpgradeInstrumentTokenIndex(tx)
	})
	if err == nil && counts.Archived > 0 {
		log.Printf("Instrument duplicate repair: archived_rows=%d removed_duplicate_rows=%d quarantined_contracts=%d", counts.Archived, counts.Removed, counts.Quarantined)
	}
	return err
}

type instrumentUpgradeCounts struct {
	Archived    int64
	Removed     int64
	Quarantined int64
}

func upgradeInstrumentContractIndex(tx *gorm.DB, counts *instrumentUpgradeCounts) error {
	var schema string
	if err := tx.Raw(`SELECT ns.nspname FROM pg_class tbl JOIN pg_namespace ns
		ON ns.oid = tbl.relnamespace WHERE tbl.oid = to_regclass('instruments')`).Scan(&schema).Error; err != nil {
		return err
	}
	if schema == "" { // Fresh installation: AutoMigrate will create the table.
		return nil
	}
	var indexValid bool
	if err := tx.Raw(`SELECT i.indisunique AND i.indisvalid AND i.indpred IS NULL
		AND i.indexprs IS NULL AND i.indnkeyatts = 2 AND i.indnatts = 2
		AND pg_get_indexdef(i.indexrelid, 1, true) = 'symbol'
		AND pg_get_indexdef(i.indexrelid, 2, true) = 'exchange_segment'
		FROM pg_index i JOIN pg_class idx ON idx.oid = i.indexrelid
		WHERE i.indrelid = to_regclass('instruments') AND idx.relname = 'idx_instruments_contract'`).Scan(&indexValid).Error; err != nil {
		return err
	}
	if indexValid {
		return nil
	}
	// Same advisory lock/order as canonical activation. The table lock also
	// excludes legacy writers that do not participate in the advisory protocol.
	if err := tx.Exec("SELECT pg_advisory_xact_lock(81003261003)").Error; err != nil {
		return err
	}
	table := pgx.Identifier{schema, "instruments"}.Sanitize()
	if err := tx.Exec("LOCK TABLE " + table + " IN SHARE ROW EXCLUSIVE MODE").Error; err != nil {
		return err
	}
	var duplicates bool
	if err := tx.Raw("SELECT EXISTS (SELECT 1 FROM " + table + " GROUP BY symbol, exchange_segment HAVING COUNT(*) > 1)").Scan(&duplicates).Error; err != nil {
		return err
	}
	if duplicates {
		var referenced bool
		if err := tx.Raw("SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE contype = 'f' AND confrelid = to_regclass(?))", table).Scan(&referenced).Error; err != nil {
			return err
		}
		if referenced {
			return fmt.Errorf("duplicate instrument repair requires review: another table references instrument IDs")
		}
		// Older installations may lack these columns. Add them without creating
		// indexes first; ambiguous survivors must be blocked by all consumers.
		if err := tx.Exec("ALTER TABLE " + table + `
			ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
			ADD COLUMN IF NOT EXISTS is_tradable boolean NOT NULL DEFAULT true,
			ADD COLUMN IF NOT EXISTS snapshot_version varchar(64) NOT NULL DEFAULT ''`).Error; err != nil {
			return err
		}
		if err := tx.AutoMigrate(&InstrumentDuplicateArchive{}); err != nil {
			return err
		}
		version, members, err := canonicalUpgradeMembers(tx)
		if err != nil {
			return err
		}
		if err := tx.Raw(repairInstrumentDuplicatesSQL, members, version).Scan(counts).Error; err != nil {
			return fmt.Errorf("archive and repair duplicate instruments: %w", err)
		}
	}
	// Creation and deduplication commit together; a failed index or archive
	// write rolls back all repairs. Never relax contract identity uniqueness.
	if err := DropIndexInTableSchema(tx, "instruments", "idx_instruments_contract"); err != nil {
		return err
	}
	// PostgreSQL derives an index's schema from its table; CREATE INDEX does
	// not accept a schema-qualified index name (DROP INDEX does).
	index := pgx.Identifier{"idx_instruments_contract"}.Sanitize()
	return tx.Exec("CREATE UNIQUE INDEX " + index + " ON " + table + " (symbol, exchange_segment)").Error
}

func canonicalUpgradeMembers(tx *gorm.DB) (string, string, error) {
	var exists bool
	if err := tx.Raw("SELECT to_regclass('instrument_snapshots') IS NOT NULL").Scan(&exists).Error; err != nil || !exists {
		return "", "[]", err
	}
	// Read JSON so missing legacy metadata columns do not break the upgrade.
	var rows []struct{ Payload string }
	if err := tx.Raw(`SELECT to_jsonb(s)::text AS payload FROM instrument_snapshots s
		WHERE to_jsonb(s)->>'status' = 'ACTIVE'`).Scan(&rows).Error; err != nil {
		return "", "[]", err
	}
	if len(rows) != 1 {
		return "", "[]", nil
	}
	var snapshot struct {
		Version          string
		Payload          string
		Partial          bool
		TotalInstruments int        `json:"total_instruments"`
		ValidationErrors string     `json:"validation_errors"`
		ActivatedAt      *time.Time `json:"activated_at"`
	}
	if err := json.Unmarshal([]byte(rows[0].Payload), &snapshot); err != nil {
		return "", "[]", nil
	}
	var members []Instrument
	if snapshot.Version == "" || snapshot.ActivatedAt == nil || snapshot.Partial || snapshot.ValidationErrors != "" || json.Unmarshal([]byte(snapshot.Payload), &members) != nil || len(members) == 0 || snapshot.TotalInstruments != len(members) {
		return "", "[]", nil
	}
	seen := map[string]bool{}
	for _, member := range members {
		key := member.Symbol + "|" + member.ExchangeSegment
		if seen[key] || member.Symbol == "" || member.ExchangeSegment == "" || member.Token == "" || member.LotSize <= 0 || member.SnapshotVersion != snapshot.Version {
			return "", "[]", nil
		}
		seen[key] = true
	}
	return snapshot.Version, snapshot.Payload, nil
}

const repairInstrumentDuplicatesSQL = `WITH canonical AS MATERIALIZED (
	SELECT * FROM jsonb_to_recordset(?::jsonb) AS a(symbol text, exchange_segment text, token text,
		instrument_type text, expiry text, strike text, option_type text, lot_size bigint, tick_size text,
		underlying text, underlying_symbol text)
), candidates AS MATERIALIZED (
	SELECT i.id, i.symbol, i.exchange_segment, to_jsonb(i) AS original_payload,
		COUNT(*) OVER (PARTITION BY i.symbol, i.exchange_segment) AS duplicate_count
	FROM instruments i
), matched AS MATERIALIZED (
	SELECT c.*, COALESCE(a.symbol IS NOT NULL AND c.original_payload->>'snapshot_version' = ?, false) AS verified
	FROM candidates c LEFT JOIN canonical a ON
		a.symbol = c.symbol AND a.exchange_segment = c.exchange_segment
		AND a.token = c.original_payload->>'token'
		AND COALESCE(a.instrument_type,'') = COALESCE(c.original_payload->>'instrument_type','')
		AND COALESCE(a.expiry,'') = COALESCE(c.original_payload->>'expiry','')
		AND COALESCE(a.strike,'') = COALESCE(c.original_payload->>'strike','')
		AND COALESCE(a.option_type,'') = COALESCE(c.original_payload->>'option_type','')
		AND a.lot_size::text = c.original_payload->>'lot_size'
		AND COALESCE(a.tick_size,'') = COALESCE(c.original_payload->>'tick_size','')
		AND COALESCE(a.underlying,'') = COALESCE(c.original_payload->>'underlying','')
		AND COALESCE(a.underlying_symbol,'') = COALESCE(c.original_payload->>'underlying_symbol','')
	WHERE c.duplicate_count > 1
), ranked AS MATERIALIZED (
	SELECT m.*, FIRST_VALUE(id) OVER (PARTITION BY symbol, exchange_segment
		ORDER BY verified DESC, (original_payload->>'updated_at')::timestamptz DESC NULLS LAST, id DESC) AS survivor_id,
		BOOL_OR(verified) OVER (PARTITION BY symbol, exchange_segment) AS canonical_verified
	FROM matched m
), archived AS (
	INSERT INTO instrument_duplicate_archives (original_id, survivor_id, symbol, exchange_segment,
		was_kept, canonical_verified, reason, original_payload, archived_at)
	SELECT id, survivor_id, symbol, exchange_segment, id = survivor_id, canonical_verified,
		'duplicate contract identity before unique index upgrade', original_payload, CURRENT_TIMESTAMP
	FROM ranked RETURNING original_id
), quarantined AS (
	UPDATE instruments i SET active = false, is_tradable = false,
		snapshot_version = CASE WHEN COALESCE(i.snapshot_version, '') = '' THEN 'legacy-duplicate-quarantine' ELSE i.snapshot_version END
	FROM ranked r WHERE i.id = r.id AND r.id = r.survivor_id AND NOT r.canonical_verified
		AND EXISTS (SELECT 1 FROM archived a WHERE a.original_id = i.id)
	RETURNING i.id
), removed AS (
	DELETE FROM instruments i USING ranked r WHERE i.id = r.id AND r.id <> r.survivor_id
		AND EXISTS (SELECT 1 FROM archived a WHERE a.original_id = i.id)
	RETURNING i.id
)
SELECT (SELECT COUNT(*) FROM archived) AS archived, (SELECT COUNT(*) FROM removed) AS removed,
	(SELECT COUNT(*) FROM quarantined) AS quarantined`
