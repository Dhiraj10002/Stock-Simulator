package service

import (
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestExpireInstrumentsUsesDistinctDatesAndPreservesBoundary(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "expiry.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Instrument{}); err != nil {
		t.Fatal(err)
	}
	var rows []model.Instrument
	for i := 0; i < 40; i++ {
		expiry := []string{"01OCT2026", "2026-10-01", "01-10-2026", "01-OCT-2026"}[i%4]
		rows = append(rows, model.Instrument{Symbol: fmt.Sprintf("EXP%dCE", i), Token: fmt.Sprint(i), Name: "expiry fixture", ExchangeSegment: "NFO", Expiry: expiry, Active: true, IsTradable: true})
	}
	for i, expiry := range []string{"2026-10-08", "invalid", ""} {
		rows = append(rows, model.Instrument{Symbol: fmt.Sprintf("KEEP%d", i), Token: fmt.Sprint(100 + i), Name: "preserve fixture", ExchangeSegment: "BFO", Expiry: expiry, Active: true, IsTradable: true})
	}
	rows = append(rows, model.Instrument{Symbol: "EQUITY", Token: "200", Name: "equity fixture", ExchangeSegment: "NSE", Expiry: "2026-10-01", Active: true, IsTradable: true})
	if err := db.Create(&rows).Error; err != nil {
		t.Fatal(err)
	}
	svc := NewService(db)
	expiry, err := ParseExpiryDate("2026-10-01", nil)
	if err != nil {
		t.Fatal(err)
	}
	if n, err := svc.ExpireInstruments(t.Context(), expiry.Add(-time.Nanosecond)); err != nil || n != 0 {
		t.Fatalf("before close: rows=%d error=%v", n, err)
	}
	var selects []string
	var fetched int64
	if err := db.Callback().Query().After("gorm:query").Register("capture_expiry_projection", func(tx *gorm.DB) {
		selects = append(selects, tx.Statement.SQL.String())
		fetched += tx.RowsAffected
	}); err != nil {
		t.Fatal(err)
	}
	n, err := svc.ExpireInstruments(t.Context(), expiry)
	_ = db.Callback().Query().Remove("capture_expiry_projection")
	if err != nil || n != 40 {
		t.Fatalf("at close: rows=%d error=%v", n, err)
	}
	if len(selects) != 1 || !strings.Contains(selects[0], "SELECT DISTINCT `expiry`") || fetched != 6 {
		t.Fatalf("expected six distinct nonempty dates, got %d rows with %v", fetched, selects)
	}
	var remaining []model.Instrument
	if err := db.Where("is_tradable = ?", true).Find(&remaining).Error; err != nil {
		t.Fatal(err)
	}
	if len(remaining) != 4 {
		t.Fatalf("future, invalid, blank and non-derivative rows must remain, got %d", len(remaining))
	}
	if n, err := svc.ExpireInstruments(t.Context(), expiry); err != nil || n != 0 {
		t.Fatalf("repeat: rows=%d error=%v", n, err)
	}
	var count int64
	db.Model(&model.Instrument{}).Count(&count)
	if count != int64(len(rows)) {
		t.Fatal("expiry retirement deleted historical contract identities")
	}
}
