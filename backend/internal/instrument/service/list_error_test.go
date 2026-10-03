package service

import (
	"path/filepath"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestListDatabaseFailureDoesNotReturnDefaultInstruments(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "missing.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	rows, err := NewService(db).List("", "", "", "", true, 100)
	if err == nil || len(rows) != 0 {
		t.Fatalf("missing instrument table must return an error, got %d rows and %v", len(rows), err)
	}
}

func TestListPopulatedMasterUsesCanonicalRecords(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "master.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Instrument{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Instrument{Symbol: "VERIFIED-EQ", Name: "VERIFIED", Token: "123", Exchange: "NSE", ExchangeSegment: "NSE", InstrumentType: "EQUITY", LotSize: 1, Active: true, IsTradable: true, SnapshotVersion: "v1"}).Error; err != nil {
		t.Fatal(err)
	}
	rows, err := NewService(db).List("", "", "", "", true, 100)
	if err != nil || len(rows) != 1 || rows[0].Symbol != "VERIFIED-EQ" {
		t.Fatalf("expected the canonical master row, got %+v and %v", rows, err)
	}
}
