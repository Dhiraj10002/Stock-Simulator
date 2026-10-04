package service

import (
	"context"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestFuturesCatalogCompleteCurrentUniverse(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "catalog.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Instrument{}); err != nil {
		t.Fatal(err)
	}
	future := time.Now().AddDate(0, 1, 0).Format("02Jan2006")
	past := time.Now().AddDate(0, -1, 0).Format("02Jan2006")
	var rows []model.Instrument
	add := func(symbol, kind, expiry string) {
		rows = append(rows, model.Instrument{Token: symbol, Symbol: symbol, Name: symbol, Underlying: symbol, Exchange: "NFO", ExchangeSegment: "NFO", InstrumentType: kind, Expiry: expiry, LotSize: 65, Active: true, IsTradable: true, SnapshotVersion: "v1"})
	}
	for i := 0; i < 510; i++ {
		add(fmt.Sprintf("STOCK%03dFUT", i), "FUTSTK", future)
	}
	add("NIFTYFUT", "FUTIDX", future)
	add("OLDFUT", "FUTIDX", past)
	add("BADDATEFUT", "FUTIDX", "bad")
	add("NIFTYCE", "OPTIDX", future)
	add("011NSETESTFUT", "FUTSTK", future)
	add("BSETESTFUT", "FUTIDX", future)
	add("RETIRED", "FUTIDX", future)
	if err := db.CreateInBatches(rows, 100).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.Instrument{}).Where("symbol = ?", "RETIRED").Update("is_tradable", false).Error; err != nil {
		t.Fatal(err)
	}
	catalog, err := NewService(db).FuturesCatalog(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(catalog) != 511 {
		t.Fatalf("complete current catalog expected 511 entries, got %d", len(catalog))
	}
	for _, row := range catalog {
		if row.LotSize != 65 || row.Token == "" || !row.IsTradable {
			t.Fatalf("identity lost: %+v", row)
		}
	}
}

func TestFuturesCatalogFailsWithoutMaster(t *testing.T) {
	if rows, err := NewService(nil).FuturesCatalog(context.Background()); err == nil || len(rows) != 0 {
		t.Fatalf("expected unavailable master, got %+v / %v", rows, err)
	}
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "missing.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if rows, err := NewService(db).FuturesCatalog(context.Background()); err == nil || len(rows) != 0 {
		t.Fatalf("expected missing schema failure, got %+v / %v", rows, err)
	}
}
