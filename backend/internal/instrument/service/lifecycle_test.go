package service

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestParseExpiryDate(t *testing.T) {
	loc, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		loc = time.FixedZone("IST", 5*3600+1800)
	}

	tests := []struct {
		expiry   string
		valid    bool
		expYear  int
		expMonth time.Month
		expDay   int
	}{
		{"24SEP2026", true, 2026, time.September, 24},
		{"24Sep2026", true, 2026, time.September, 24},
		{"2026-09-24", true, 2026, time.September, 24},
		{"24-09-2026", true, 2026, time.September, 24},
		{"24-SEP-2026", true, 2026, time.September, 24},
		{"", false, 0, 0, 0},
		{"INVALID-DATE", false, 0, 0, 0},
	}

	for _, tt := range tests {
		dt, err := ParseExpiryDate(tt.expiry, loc)
		if tt.valid {
			if err != nil {
				t.Fatalf("unexpected error parsing %s: %v", tt.expiry, err)
			}
			if dt.Year() != tt.expYear || dt.Month() != tt.expMonth || dt.Day() != tt.expDay {
				t.Errorf("ParseExpiryDate(%s) = %v; want %d-%d-%d", tt.expiry, dt, tt.expYear, tt.expMonth, tt.expDay)
			}
			if dt.Hour() != 15 || dt.Minute() != 40 {
				t.Errorf("expected 15:40 IST, got %02d:%02d", dt.Hour(), dt.Minute())
			}
		} else {
			if err == nil {
				t.Errorf("expected error parsing %s, got nil", tt.expiry)
			}
		}
	}
}

func TestStageSnapshot_ValidationAndDeduplication(t *testing.T) {
	mockJSON := `[
		{"token":"1001","symbol":"RELIANCE-EQ","name":"RELIANCE","expiry":"","strike":"-1.000000","lotsize":"1","instrumenttype":"","exch_seg":"NSE","tick_size":"5.000000"},
		{"token":"1001","symbol":"RELIANCE_DUP","name":"RELIANCE","expiry":"","strike":"-1.000000","lotsize":"1","instrumenttype":"","exch_seg":"NSE","tick_size":"5.000000"},
		{"token":"2001","symbol":"NIFTY24SEPFUT","name":"NIFTY","expiry":"24SEP2026","strike":"-1.000000","lotsize":"0","instrumenttype":"FUTIDX","exch_seg":"NFO","tick_size":"5.000000"},
		{"token":"3001","symbol":"TCS24SEPFUT","name":"TCS","expiry":"INVALID_EXP","strike":"-1.000000","lotsize":"175","instrumenttype":"FUTSTK","exch_seg":"NFO","tick_size":"5.000000"},
		{"token":"4001","symbol":"GOLD","name":"GOLD","expiry":"","strike":"-1.000000","lotsize":"100","instrumenttype":"","exch_seg":"MCX","tick_size":"1.000000"}
	]`

	svc := NewService(nil)
	ctx := context.Background()

	snapshot, stats, err := svc.StageSnapshot(ctx, "test-v1", "test_source", strings.NewReader(mockJSON))
	if err != nil {
		t.Fatalf("unexpected error staging snapshot: %v", err)
	}

	if stats.TotalProcessed != 5 {
		t.Errorf("expected 5 processed, got %d", stats.TotalProcessed)
	}
	// Upserted: RELIANCE (1001), TCS (3001). Skipped: RELIANCE_DUP (duplicate token), NIFTY (lot size 0), GOLD (MCX)
	if stats.TotalUpserted != 1 {
		t.Errorf("expected 1 valid staged member, got %d", stats.TotalUpserted)
	}
	if stats.TotalSkipped != 4 {
		t.Errorf("expected 4 skipped, got %d", stats.TotalSkipped)
	}

	if snapshot.Status != model.SnapshotStatusFailed {
		t.Errorf("expected invalid snapshot FAILED, got %s", snapshot.Status)
	}
	if snapshot.EquityCount != 1 {
		t.Errorf("expected 1 equity, got %d", snapshot.EquityCount)
	}
	if snapshot.FuturesCount != 0 {
		t.Errorf("expected 0 valid futures, got %d", snapshot.FuturesCount)
	}

	if !strings.Contains(snapshot.ValidationErrors, "duplicate token") {
		t.Errorf("expected duplicate token error in ValidationErrors, got: %s", snapshot.ValidationErrors)
	}
	if !strings.Contains(snapshot.ValidationErrors, "invalid lot size") {
		t.Errorf("expected invalid lot size error in ValidationErrors, got: %s", snapshot.ValidationErrors)
	}
	if !strings.Contains(snapshot.ValidationErrors, "invalid expiry format") {
		t.Errorf("expected invalid expiry format error in ValidationErrors, got: %s", snapshot.ValidationErrors)
	}
}

func TestLifecycle_DB_AtomicActivation_SoftRetirement(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "instruments_test.db")
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed opening test sqlite db: %v", err)
	}

	if err := db.AutoMigrate(&model.Instrument{}, &model.InstrumentSnapshot{}); err != nil {
		t.Fatalf("failed migrating test sqlite db: %v", err)
	}

	svc := NewService(db)
	ctx := context.Background()

	// 1. Stage Version 1: RELIANCE and TCS
	jsonV1 := `[
		{"token":"101","symbol":"RELIANCE-EQ","name":"RELIANCE","expiry":"","strike":"-1.000000","lotsize":"1","instrumenttype":"","exch_seg":"NSE","tick_size":"5.000000"},
		{"token":"102","symbol":"TCS-EQ","name":"TCS","expiry":"","strike":"-1.000000","lotsize":"1","instrumenttype":"","exch_seg":"NSE","tick_size":"5.000000"}
	]`

	snapV1, statsV1, err := svc.StageSnapshot(ctx, "snap-v1", "angelone_openapi", strings.NewReader(jsonV1))
	if err != nil {
		t.Fatalf("failed staging v1: %v", err)
	}
	if statsV1.TotalUpserted != 2 {
		t.Fatalf("expected 2 upserted in v1, got %d", statsV1.TotalUpserted)
	}
	if snapV1.Status != model.SnapshotStatusStaged {
		t.Fatalf("expected snapV1 STAGED, got %s", snapV1.Status)
	}

	// Activate Version 1
	activeSnapV1, err := svc.ActivateSnapshot(ctx, "snap-v1")
	if err != nil {
		t.Fatalf("failed activating v1: %v", err)
	}
	if activeSnapV1.Status != model.SnapshotStatusActive || activeSnapV1.ActivatedAt == nil {
		t.Fatalf("expected snapV1 ACTIVE with activated_at timestamp, got %+v", activeSnapV1)
	}

	// Verify both are active in DB
	v1List, err := svc.List("", "NSE", "", "", true, 10)
	if err != nil {
		t.Fatalf("failed listing v1: %v", err)
	}
	if len(v1List) != 2 {
		t.Fatalf("expected 2 active instruments in v1, got %d", len(v1List))
	}

	// 2. Stage Version 2: TCS and INFY (RELIANCE is omitted/removed)
	jsonV2 := `[
		{"token":"102","symbol":"TCS-EQ","name":"TCS","expiry":"","strike":"-1.000000","lotsize":"1","instrumenttype":"","exch_seg":"NSE","tick_size":"5.000000"},
		{"token":"103","symbol":"INFY-EQ","name":"INFY","expiry":"","strike":"-1.000000","lotsize":"1","instrumenttype":"","exch_seg":"NSE","tick_size":"5.000000"}
	]`

	_, statsV2, err := svc.StageSnapshot(ctx, "snap-v2", "angelone_openapi", strings.NewReader(jsonV2))
	if err != nil {
		t.Fatalf("failed staging v2: %v", err)
	}
	if statsV2.TotalUpserted != 2 {
		t.Fatalf("expected 2 upserted in v2, got %d", statsV2.TotalUpserted)
	}

	// Activate Version 2
	activeSnapV2, err := svc.ActivateSnapshot(ctx, "snap-v2")
	if err != nil {
		t.Fatalf("failed activating v2: %v", err)
	}
	if activeSnapV2.Status != model.SnapshotStatusActive {
		t.Fatalf("expected snapV2 ACTIVE, got %s", activeSnapV2.Status)
	}

	// Verify previous snapshot v1 is RETIRED
	var oldSnap model.InstrumentSnapshot
	if err := db.Where("version = ?", "snap-v1").First(&oldSnap).Error; err != nil {
		t.Fatalf("failed fetching old snapshot: %v", err)
	}
	if oldSnap.Status != model.SnapshotStatusRetired {
		t.Errorf("expected snap-v1 to be RETIRED, got %s", oldSnap.Status)
	}

	// CRITICAL TEST: Verify RELIANCE was NOT deleted from DB (foreign keys preserved)
	var totalRowCount int64
	db.Model(&model.Instrument{}).Count(&totalRowCount)
	if totalRowCount != 3 {
		t.Fatalf("expected 3 total rows in instruments table (none deleted), got %d", totalRowCount)
	}

	// Verify RELIANCE is soft-retired: is_tradable = false, active = false
	var relInst model.Instrument
	if err := db.Where("symbol = ?", "RELIANCE-EQ").First(&relInst).Error; err != nil {
		t.Fatalf("failed finding RELIANCE: %v", err)
	}
	if relInst.IsTradable {
		t.Errorf("expected RELIANCE is_tradable = false, got true")
	}
	if relInst.Active {
		t.Errorf("expected RELIANCE active = false, got true")
	}

	// Verify List(activeOnly=true) returns ONLY TCS and INFY
	activeList, err := svc.List("", "NSE", "", "", true, 10)
	if err != nil {
		t.Fatalf("failed listing active: %v", err)
	}
	if len(activeList) != 2 {
		t.Fatalf("expected exactly 2 active tradable instruments, got %d", len(activeList))
	}
	for _, inst := range activeList {
		if inst.Symbol == "RELIANCE-EQ" || inst.Symbol == "RELIANCE" {
			t.Errorf("soft-retired RELIANCE should NOT be returned in active List")
		}
	}

	// Verify GetActiveSnapshot returns snap-v2
	currentActive, err := svc.GetActiveSnapshot(ctx)
	if err != nil {
		t.Fatalf("failed getting active snapshot: %v", err)
	}
	if currentActive.Version != "snap-v2" {
		t.Errorf("expected active snapshot version snap-v2, got %s", currentActive.Version)
	}

	// Verify ListSnapshots returns both snapshots in descending order
	allSnaps, err := svc.ListSnapshots(ctx, 10)
	if err != nil {
		t.Fatalf("failed listing snapshots: %v", err)
	}
	if len(allSnaps) != 2 {
		t.Fatalf("expected 2 snapshots, got %d", len(allSnaps))
	}
	if allSnaps[0].Version != "snap-v2" || allSnaps[1].Version != "snap-v1" {
		t.Errorf("unexpected snapshot ordering: %+v", allSnaps)
	}
}

func TestLifecycle_ExpireInstruments(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "expire_test.db")
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed opening test sqlite db: %v", err)
	}

	if err := db.AutoMigrate(&model.Instrument{}); err != nil {
		t.Fatalf("failed migrating test sqlite db: %v", err)
	}

	svc := NewService(db)
	ctx := context.Background()

	// Seed 2 derivatives: one expired in Aug 2026, one valid until Sep 2026
	past := model.Instrument{
		Token:           "5001",
		Symbol:          "NIFTY24AUG26FUT",
		ExchangeSegment: "NFO",
		InstrumentType:  "FUTIDX",
		Expiry:          "24AUG2026",
		Active:          true,
		IsTradable:      true,
		SnapshotVersion: "v1",
	}
	future := model.Instrument{
		Token:           "5002",
		Symbol:          "NIFTY24SEP26FUT",
		ExchangeSegment: "NFO",
		InstrumentType:  "FUTIDX",
		Expiry:          "24SEP2026",
		Active:          true,
		IsTradable:      true,
		SnapshotVersion: "v1",
	}

	db.Create(&past)
	db.Create(&future)

	loc, _ := time.LoadLocation("Asia/Kolkata")
	// As of 2026-09-01 (after 24-Aug-2026, before 24-Sep-2026)
	asOf := time.Date(2026, 9, 1, 16, 0, 0, 0, loc)

	expiredCount, err := svc.ExpireInstruments(ctx, asOf)
	if err != nil {
		t.Fatalf("unexpected error expiring instruments: %v", err)
	}
	if expiredCount != 1 {
		t.Errorf("expected 1 expired contract, got %d", expiredCount)
	}

	var updatedPast model.Instrument
	db.Where("token = ?", "5001").First(&updatedPast)
	if updatedPast.IsTradable || updatedPast.Active {
		t.Errorf("expected past instrument to be inactive and untradable, got active=%v is_tradable=%v", updatedPast.Active, updatedPast.IsTradable)
	}

	var updatedFuture model.Instrument
	db.Where("token = ?", "5002").First(&updatedFuture)
	if !updatedFuture.IsTradable || !updatedFuture.Active {
		t.Errorf("expected future instrument to remain active and tradable, got active=%v is_tradable=%v", updatedFuture.Active, updatedFuture.IsTradable)
	}
}
