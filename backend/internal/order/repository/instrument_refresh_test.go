package repository

import (
	"errors"
	"path/filepath"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestFindInstrumentObservesUpdatesAndNeverReturnsSharedCachedPointers(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "instruments.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Instrument{}); err != nil {
		t.Fatal(err)
	}
	previous := database.GetDB()
	database.SetDBForTesting(db)
	t.Cleanup(func() { database.SetDBForTesting(previous) })
	inst := model.Instrument{Symbol: "ETERNAL-EQ", Name: "ETERNAL", Token: "5097", ExchangeSegment: "NSE", InstrumentType: "EQUITY", Active: true, IsTradable: true}
	if err := db.Create(&inst).Error; err != nil {
		t.Fatal(err)
	}
	repo := New()
	first, err := repo.FindInstrument("ZOMATO")
	if err != nil {
		t.Fatal(err)
	}
	first.Token = "caller-mutation"
	if err := db.Model(&inst).Updates(map[string]any{"token": "9001", "active": false, "is_tradable": false}).Error; err != nil {
		t.Fatal(err)
	}
	for _, symbol := range []string{"ZOMATO", "ETERNAL", "ETERNAL-EQ"} {
		current, err := repo.FindInstrument(symbol)
		if err != nil || current.Token != "9001" || current.Active || current.IsTradable {
			t.Fatalf("%s returned stale metadata: %+v, %v", symbol, current, err)
		}
	}
	// A successful lookup must not hide subsequent database outages.
	sqlDB, _ := db.DB()
	if err := sqlDB.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.FindInstrument("ETERNAL"); err == nil {
		t.Fatal("database outage returned an apparently valid cached instrument")
	}
}

func TestFindInstrumentDoesNotReintroduceRemovedBuiltinIntoPopulatedMaster(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "master.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Instrument{}); err != nil {
		t.Fatal(err)
	}
	previous := database.GetDB()
	database.SetDBForTesting(db)
	t.Cleanup(func() { database.SetDBForTesting(previous) })
	if err := db.Create(&model.Instrument{Symbol: "TCS-EQ", Token: "11536", Name: "TCS", ExchangeSegment: "NSE"}).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := New().FindInstrument("RELIANCE"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("removed builtin was reintroduced: %v", err)
	}
}
