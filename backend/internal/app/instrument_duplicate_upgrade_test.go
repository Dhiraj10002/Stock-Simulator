package app

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/testutil"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

func legacyInstrumentDB(t *testing.T) *gorm.DB {
	t.Helper()
	tx := testutil.RequireDisposableDB(t).Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	t.Cleanup(func() { tx.Rollback() })
	schema := "instrument_upgrade_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	for _, sql := range []string{"CREATE SCHEMA " + schema, "SET LOCAL search_path TO " + schema} {
		if err := tx.Exec(sql).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.AutoMigrate(&model.Instrument{}, &model.InstrumentSnapshot{}); err != nil {
		t.Fatal(err)
	}
	if err := model.DropIndexInTableSchema(tx, "instruments", "idx_instruments_contract"); err != nil {
		t.Fatal(err)
	}
	return tx
}

func seedDuplicate(t *testing.T, tx *gorm.DB, token, version string, stamp time.Time) model.Instrument {
	t.Helper()
	row := model.Instrument{Symbol: "DUPLICATECE", Name: "DUPLICATE", Token: token,
		Exchange: "NFO", ExchangeSegment: "NFO", InstrumentType: "OPTSTK", Expiry: "2099-12-31",
		Strike: "100", OptionType: "CE", LotSize: 10, TickSize: "0.05", Underlying: "DUPLICATE",
		UnderlyingSymbol: "DUPLICATE", SnapshotVersion: version, Active: true, IsTradable: true,
		CreatedAt: stamp, UpdatedAt: stamp}
	if err := tx.Create(&row).Error; err != nil {
		t.Fatal(err)
	}
	return row
}

func activateDuplicateMaster(t *testing.T, tx *gorm.DB, members []model.Instrument, payloadOverride string) {
	t.Helper()
	payload, err := json.Marshal(members)
	if err != nil {
		t.Fatal(err)
	}
	if payloadOverride != "" {
		payload = []byte(payloadOverride)
	}
	now := time.Now().UTC()
	if err := tx.Create(&model.InstrumentSnapshot{Version: "current", Status: model.SnapshotStatusActive,
		Payload: string(payload), TotalInstruments: len(members), ActivatedAt: &now}).Error; err != nil {
		t.Fatal(err)
	}
}

func TestInstrumentUpgradeArchivesAndQuarantinesLegacyDuplicates(t *testing.T) {
	tx := legacyInstrumentDB(t)
	old := seedDuplicate(t, tx, "100", "", time.Now().Add(-time.Hour))
	newer := seedDuplicate(t, tx, "200", "", time.Now())
	other := model.Instrument{Symbol: newer.Symbol, Name: "OTHER", Token: "300", ExchangeSegment: "BFO"}
	if err := tx.Create(&other).Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.AutoMigrate(&model.Wallet{}, &model.Position{}, &model.Order{}, &model.Trade{}); err != nil {
		t.Fatal(err)
	}
	user := uuid.New()
	wallet := model.Wallet{UserUUID: user, CashBalancePaise: 123456, BlockedPaise: 2345}
	position := model.Position{UserUUID: user, Symbol: newer.Symbol, Product: "FNO", Quantity: 10, AveragePricePaise: 1700, CostBasisPaise: 17000, MarginBlockedPaise: 2345}
	order := model.Order{UserUUID: user, Symbol: newer.Symbol, Product: "FNO", Side: "BUY", Type: "MARKET", Status: "EXECUTED", Quantity: 10, ExecutedPricePaise: 1700}
	for _, row := range []any{&wallet, &position, &order} {
		if err := tx.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Create(&model.Trade{UserUUID: user, OrderUUID: order.UUID, Symbol: newer.Symbol, Product: "FNO", Side: "BUY", Quantity: 10, PricePaise: 1700, TotalPaise: 17000}).Error; err != nil {
		t.Fatal(err)
	}
	financialState := func() map[string]string {
		result := map[string]string{}
		for _, table := range []string{"wallets", "positions", "orders", "trades"} {
			var payload string
			if err := tx.Raw("SELECT jsonb_agg(to_jsonb(t) ORDER BY id)::text FROM " + table + " t").Scan(&payload).Error; err != nil {
				t.Fatal(err)
			}
			result[table] = payload
		}
		return result
	}
	before := financialState()
	if err := model.UpgradeInstrumentSchema(tx); err != nil {
		t.Fatal(err)
	}
	if err := upgradeRequiredSchema(tx); err != nil {
		t.Fatal(err)
	}
	for table, after := range financialState() {
		if before[table] != after {
			t.Fatalf("instrument repair must not change %s", table)
		}
	}
	var kept model.Instrument
	if err := tx.First(&kept, newer.ID).Error; err != nil {
		t.Fatal(err)
	}
	if kept.Active || kept.IsTradable || kept.SnapshotVersion != "legacy-duplicate-quarantine" || kept.Token != newer.Token {
		t.Fatalf("unverified survivor must be blocked without replacing identity: %+v", kept)
	}
	var archive []model.InstrumentDuplicateArchive
	if err := tx.Order("original_id").Find(&archive).Error; err != nil {
		t.Fatal(err)
	}
	if len(archive) != 2 || archive[0].OriginalID != old.ID || archive[1].OriginalID != newer.ID {
		t.Fatalf("every original row must be archived: %+v", archive)
	}
	for _, row := range archive {
		var original model.Instrument
		if err := json.Unmarshal([]byte(row.OriginalPayload), &original); err != nil {
			t.Fatal(err)
		}
		if original.ID != row.OriginalID || !original.Active || !original.IsTradable || original.SnapshotVersion != "" || row.SurvivorID != newer.ID || row.CanonicalVerified {
			t.Fatalf("original identity/state must be preserved before quarantine: %+v", row)
		}
	}
	var untouched model.Instrument
	if err := tx.First(&untouched, other.ID).Error; err != nil || !untouched.Active || untouched.Token != other.Token {
		t.Fatalf("same symbol in a different segment must be untouched: %+v, %v", untouched, err)
	}
	if err := model.UpgradeInstrumentSchema(tx); err != nil {
		t.Fatal(err)
	}
	var archivedCount int64
	tx.Model(&model.InstrumentDuplicateArchive{}).Count(&archivedCount)
	if archivedCount != 2 {
		t.Fatal("repeat upgrade changed the archive")
	}
	// A nested savepoint lets the expected uniqueness rejection roll back safely.
	err := tx.Transaction(func(nested *gorm.DB) error {
		duplicate := newer
		duplicate.ID = 0
		return nested.Create(&duplicate).Error
	})
	if err == nil {
		t.Fatal("contract uniqueness must remain enforced after repair")
	}
}

func TestInstrumentUpgradePrefersActivatedCanonicalIdentityOverNewestRow(t *testing.T) {
	tx := legacyInstrumentDB(t)
	canonical := seedDuplicate(t, tx, "100", "current", time.Now().Add(-time.Hour))
	seedDuplicate(t, tx, "200", "staged", time.Now())
	activateDuplicateMaster(t, tx, []model.Instrument{canonical}, "")
	if err := model.UpgradeInstrumentSchema(tx); err != nil {
		t.Fatal(err)
	}
	var rows []model.Instrument
	if err := tx.Find(&rows).Error; err != nil || len(rows) != 1 {
		t.Fatalf("expected one canonical contract: %+v, %v", rows, err)
	}
	if rows[0].ID != canonical.ID || rows[0].Token != canonical.Token || !rows[0].Active || !rows[0].IsTradable || rows[0].SnapshotVersion != "current" {
		t.Fatalf("active-master identity must win over recency: %+v", rows[0])
	}
	var verified int64
	if err := tx.Model(&model.InstrumentDuplicateArchive{}).Where("canonical_verified = true").Count(&verified).Error; err != nil || verified != 2 {
		t.Fatalf("canonical resolution must be recorded: %d, %v", verified, err)
	}
}

func TestInstrumentUpgradeUntrustedMasterCannotEnableAmbiguousContracts(t *testing.T) {
	for _, scenario := range []string{"malformed_payload", "token_mismatch", "duplicate_payload_identity", "partial_master", "multiple_active_masters"} {
		t.Run(scenario, func(t *testing.T) {
			tx := legacyInstrumentDB(t)
			first := seedDuplicate(t, tx, "100", "current", time.Now().Add(-time.Hour))
			newer := seedDuplicate(t, tx, "200", "current", time.Now())
			members, override := []model.Instrument{first}, ""
			switch scenario {
			case "malformed_payload":
				override = "broken-json"
			case "token_mismatch":
				members[0].Token = "999"
			case "duplicate_payload_identity":
				members = append(members, first)
			}
			activateDuplicateMaster(t, tx, members, override)
			if scenario == "partial_master" {
				tx.Model(&model.InstrumentSnapshot{}).Where("version = 'current'").Update("partial", true)
			}
			if scenario == "multiple_active_masters" {
				now := time.Now().UTC()
				if err := tx.Create(&model.InstrumentSnapshot{Version: "other", Status: model.SnapshotStatusActive, Payload: "[]", ActivatedAt: &now}).Error; err != nil {
					t.Fatal(err)
				}
			}
			if err := model.UpgradeInstrumentSchema(tx); err != nil {
				t.Fatal(err)
			}
			var kept model.Instrument
			if err := tx.First(&kept, newer.ID).Error; err != nil || kept.Active || kept.IsTradable || kept.SnapshotVersion == "" {
				t.Fatalf("ambiguous contracts must remain blocked: %+v, %v", kept, err)
			}
		})
	}
}

func TestInstrumentUpgradeSupportsMissingLegacyStateColumns(t *testing.T) {
	tx := legacyInstrumentDB(t)
	seedDuplicate(t, tx, "100", "", time.Now().Add(-time.Hour))
	newer := seedDuplicate(t, tx, "200", "", time.Now())
	if err := tx.Exec(`ALTER TABLE instruments DROP COLUMN active, DROP COLUMN is_tradable, DROP COLUMN snapshot_version`).Error; err != nil {
		t.Fatal(err)
	}
	if err := model.UpgradeInstrumentSchema(tx); err != nil {
		t.Fatal(err)
	}
	if err := upgradeRequiredSchema(tx); err != nil {
		t.Fatal(err)
	}
	var kept model.Instrument
	if err := tx.First(&kept, newer.ID).Error; err != nil || kept.Active || kept.IsTradable || kept.SnapshotVersion == "" {
		t.Fatalf("legacy columns must be upgraded before quarantine: %+v, %v", kept, err)
	}
}

func TestInstrumentUpgradeArchiveFailureRollsBackOriginalRows(t *testing.T) {
	tx := legacyInstrumentDB(t)
	first := seedDuplicate(t, tx, "100", "", time.Now().Add(-time.Hour))
	seedDuplicate(t, tx, "200", "", time.Now())
	if err := tx.AutoMigrate(&model.InstrumentDuplicateArchive{}); err != nil {
		t.Fatal(err)
	}
	// A preexisting audit identity must never be overwritten or silently skipped.
	if err := tx.Create(&model.InstrumentDuplicateArchive{OriginalID: first.ID, SurvivorID: first.ID, Symbol: first.Symbol, ExchangeSegment: first.ExchangeSegment, Reason: "sentinel", OriginalPayload: `{"preserve":true}`, ArchivedAt: time.Now()}).Error; err != nil {
		t.Fatal(err)
	}
	if err := model.UpgradeInstrumentSchema(tx); err == nil {
		t.Fatal("archive collision must abort repair")
	}
	var count int64
	if err := tx.Model(&model.Instrument{}).Where("active = true AND is_tradable = true").Count(&count).Error; err != nil || count != 2 {
		t.Fatalf("failed repair must preserve original rows/state: %d, %v", count, err)
	}
	if tx.Migrator().HasIndex(&model.Instrument{}, "idx_instruments_contract") {
		t.Fatal("failed repair must not create a partial identity upgrade")
	}
}

func TestInstrumentUpgradeRefusesCustomInstrumentIDReferences(t *testing.T) {
	tx := legacyInstrumentDB(t)
	first := seedDuplicate(t, tx, "100", "", time.Now().Add(-time.Hour))
	seedDuplicate(t, tx, "200", "", time.Now())
	if err := tx.Exec("CREATE TABLE external_instrument_refs (instrument_id bigint REFERENCES instruments(id) ON DELETE CASCADE)").Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.Exec("INSERT INTO external_instrument_refs VALUES (?)", first.ID).Error; err != nil {
		t.Fatal(err)
	}
	if err := model.UpgradeInstrumentSchema(tx); err == nil || !strings.Contains(err.Error(), "references instrument IDs") {
		t.Fatalf("custom references require explicit review: %v", err)
	}
	var count int64
	if err := tx.Model(&model.Instrument{}).Count(&count).Error; err != nil || count != 2 {
		t.Fatalf("referenced instruments must remain untouched: %d, %v", count, err)
	}
}
