package service

import (
	"context"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"path/filepath"
	"strings"
	"testing"
)

func TestStagingIsolationAndTokenReuse(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "master.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Instrument{}, &model.InstrumentSnapshot{}); err != nil {
		t.Fatal(err)
	}
	svc := NewService(db)
	ctx := context.Background()
	fixture := func(symbol string) string {
		return `[{"token":"101","symbol":"` + symbol + `","name":"TEST","expiry":"","strike":"-1","lotsize":"1","instrumenttype":"","exch_seg":"NSE","tick_size":"5"}]`
	}
	if _, _, err := svc.StageSnapshot(ctx, "v1", "test", strings.NewReader(fixture("OLD-EQ"))); err != nil {
		t.Fatal(err)
	}
	var count int64
	db.Model(&model.Instrument{}).Count(&count)
	if count != 0 {
		t.Fatal("staging leaked live rows")
	}
	if _, err := svc.ActivateSnapshot(ctx, "v1"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.StageSnapshot(ctx, "v2", "test", strings.NewReader(fixture("NEW-EQ"))); err != nil {
		t.Fatal(err)
	}
	var old model.Instrument
	db.Where("symbol = ?", "OLD-EQ").First(&old)
	if !old.Active {
		t.Fatal("staging retired live master")
	}
	if _, err := svc.ActivateSnapshot(ctx, "v2"); err != nil {
		t.Fatal(err)
	}
	db.Model(&model.Instrument{}).Count(&count)
	if count != 2 {
		t.Fatalf("recycled token destroyed history: %d", count)
	}
	db.Where("symbol = ?", "OLD-EQ").First(&old)
	if old.Active {
		t.Fatal("old identity remained active")
	}
	if _, _, err := svc.StageSnapshot(ctx, "broken", "test", strings.NewReader(strings.TrimSuffix(fixture("BROKEN-EQ"), "]"))); err == nil {
		t.Fatal("malformed master accepted")
	}
	var active model.Instrument
	db.Where("symbol = ?", "NEW-EQ").First(&active)
	if !active.Active {
		t.Fatal("failed import changed active master")
	}
	if _, _, err := svc.StageSnapshot(ctx, "empty", "test", strings.NewReader("[]")); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ActivateSnapshot(ctx, "empty"); err == nil {
		t.Fatal("empty master activated")
	}
}
