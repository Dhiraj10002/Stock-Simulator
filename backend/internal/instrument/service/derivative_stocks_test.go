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

func TestDerivativeStocksCanonicalIntersection(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "eligible.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Instrument{}); err != nil {
		t.Fatal(err)
	}
	future := time.Now().AddDate(0, 1, 0).Format("02Jan2006")
	past := time.Now().AddDate(0, -1, 0).Format("02Jan2006")
	add := func(symbol, exchange, kind, underlying, expiry string) {
		t.Helper()
		row := model.Instrument{Symbol: symbol, Token: symbol, Exchange: exchange, ExchangeSegment: exchange, Name: underlying, Underlying: underlying, InstrumentType: kind, Expiry: expiry, Active: true, IsTradable: true, SnapshotVersion: "v1"}
		if err := db.Create(&row).Error; err != nil {
			t.Fatal(err)
		}
	}
	// A generic 500-record equity search cannot reach the eligible entries.
	for i := 0; i < 510; i++ {
		add(fmt.Sprintf("AAA%03d-EQ", i), "NSE", "EQUITY", "CASHONLY", "")
	}
	add("TCS-EQ", "NSE", "EQUITY", "TCS", "")
	add("TCSFUT", "NFO", "FUTSTK", "TCS", future)
	add("TCSOPT", "NFO", "OPTSTK", "TCS", future)
	add("RELIANCE", "NSE", "EQUITY", "RELIANCE", "")
	add("RELIANCEOPT", "NFO", "OPTSTK", "RELIANCE", future)
	add("OLD-EQ", "NSE", "EQUITY", "OLD", "")
	add("OLDFUT", "NFO", "FUTSTK", "OLD", past)
	add("NSETESTFUT", "NFO", "FUTSTK", "NSETEST", future)
	add("NSETEST-EQ", "NSE", "EQUITY", "NSETEST", "")
	add("TCS-BSE", "BSE", "EQUITY", "TCS", "")
	add("RETIRED-EQ", "NSE", "EQUITY", "RETIRED", "")
	add("RETIREDFUT", "NFO", "FUTSTK", "RETIRED", future)
	if err := db.Model(&model.Instrument{}).Where("symbol = ?", "RETIREDFUT").Update("is_tradable", false).Error; err != nil {
		t.Fatal(err)
	}
	rows, err := NewService(db).DerivativeStocks(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 || rows[0].Symbol != "RELIANCE" || rows[1].Symbol != "TCS-EQ" {
		t.Fatalf("unexpected eligible universe: %+v", rows)
	}
	if rows[1].Token != "TCS-EQ" || rows[1].Name != "TCS" {
		t.Fatalf("canonical identity not retained: %+v", rows[1])
	}
}

func TestDerivativeStocksDependencyFailure(t *testing.T) {
	if rows, err := NewService(nil).DerivativeStocks(context.Background()); err == nil || len(rows) != 0 {
		t.Fatalf("no master must fail, got %+v / %v", rows, err)
	}
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "missing.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if rows, err := NewService(db).DerivativeStocks(context.Background()); err == nil || len(rows) != 0 {
		t.Fatalf("missing schema must fail, got %+v / %v", rows, err)
	}
}
