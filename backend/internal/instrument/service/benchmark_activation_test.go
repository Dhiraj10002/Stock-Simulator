package service

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/market/calendar"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestActivationPreservesActiveBenchmarkOnlyIndices(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "benchmark.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Instrument{}, &model.InstrumentSnapshot{}); err != nil {
		t.Fatal(err)
	}
	svc := NewService(db)
	payload := `[{"token":"99926000","symbol":"NIFTY 50","name":"NIFTY","instrumenttype":"AMXIDX","exch_seg":"NSE","lotsize":"1","tick_size":"5"},{"token":"99919000","symbol":"SENSEX","name":"SENSEX","instrumenttype":"AMXIDX","exch_seg":"BSE","lotsize":"1","tick_size":"5"},{"token":"11536","symbol":"TCS-EQ","name":"TCS","instrumenttype":"","exch_seg":"NSE","lotsize":"1","tick_size":"5"}]`
	for _, version := range []string{"benchmark-v1", "benchmark-v2"} {
		if _, _, err := svc.StageSnapshot(context.Background(), version, "angelone_openapi", strings.NewReader(payload)); err != nil {
			t.Fatal(err)
		}
		if _, err := svc.ActivateSnapshot(context.Background(), version); err != nil {
			t.Fatal(err)
		}
		var rows []model.Instrument
		if err := db.Find(&rows).Error; err != nil {
			t.Fatal(err)
		}
		if len(rows) != 3 {
			t.Fatalf("expected three retained instruments, got %d", len(rows))
		}
		for _, row := range rows {
			wantTradable := row.InstrumentType == "EQUITY"
			if !row.Active || row.IsTradable != wantTradable || ToCanonicalInstrument(row).IsTradable != wantTradable {
				t.Fatalf("incorrect activated metadata: %+v", row)
			}
		}
	}
}

func TestNFORetirementUsesSegmentClose(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "expiry.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Instrument{}); err != nil {
		t.Fatal(err)
	}
	inst := model.Instrument{Symbol: "NIFTY29SEP26FUT", Name: "NIFTY", Token: "123", ExchangeSegment: "NFO", InstrumentType: "FUTIDX", Expiry: "29SEP2026", Active: true, IsTradable: true}
	if err := db.Create(&inst).Error; err != nil {
		t.Fatal(err)
	}
	svc := NewService(db)
	for _, tc := range []struct {
		minute int
		count  int64
	}{{35, 0}, {40, 1}} {
		now := time.Date(2026, 9, 29, 15, tc.minute, 0, 0, calendar.Location())
		count, err := svc.ExpireInstruments(context.Background(), now)
		if err != nil || count != tc.count {
			t.Fatalf("15:%d retirement count=%d, error=%v", tc.minute, count, err)
		}
	}
}
