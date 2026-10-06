package router

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/testutil"
	"github.com/google/uuid"
	"gorm.io/gorm"
	gormLogger "gorm.io/gorm/logger"
)

type finderQueryRecorder struct {
	gormLogger.Interface
	queries []string
}

func (r *finderQueryRecorder) Trace(_ context.Context, _ time.Time, fc func() (string, int64), _ error) {
	query, _ := fc()
	r.queries = append(r.queries, query)
}

func TestInstrumentFinderLoadsOnlyRequestedSymbols(t *testing.T) {
	tx := testutil.RequireDisposableDB(t).Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	defer tx.Rollback()
	schema := "finder_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	for _, statement := range []string{"CREATE SCHEMA " + schema, "SET LOCAL search_path TO " + schema} {
		if err := tx.Exec(statement).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.AutoMigrate(&model.Instrument{}); err != nil {
		t.Fatal(err)
	}
	if err := tx.Create(&model.Instrument{Symbol: "CUSTOM-EQ", Name: "CUSTOM", Token: "101", ExchangeSegment: "NSE"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.Create(&model.Instrument{Symbol: "CUSTOM31DEC2099CE", Name: "CUSTOM", Token: "102", ExchangeSegment: "NFO"}).Error; err != nil {
		t.Fatal(err)
	}
	recorder := &finderQueryRecorder{Interface: gormLogger.Default}
	finder := newInstrumentFinder(tx.Session(&gorm.Session{Logger: recorder}), time.Second)
	if len(recorder.queries) != 0 {
		t.Fatal("finder construction read the full master")
	}
	for symbol, expected := range map[string]bool{"TCS": true, "custom": true, "CUSTOM-EQ": true, "CUSTOM31DEC2099CE": true, "NONEXISTENT": false, " ": false} {
		found, err := finder(symbol)
		if err != nil || found != expected {
			t.Fatalf("%s: %v %v", symbol, found, err)
		}
	}
	count := len(recorder.queries)
	for _, symbol := range []string{"CUSTOM", "CUSTOM-EQ", "NONEXISTENT"} {
		if _, err := finder(symbol); err != nil {
			t.Fatal(err)
		}
	}
	if count != len(recorder.queries) {
		t.Fatal("warm lookups repeated database reads")
	}
	for _, query := range recorder.queries {
		if !strings.Contains(query, "SELECT EXISTS") {
			t.Fatalf("unexpected master query: %s", query)
		}
	}
}

func TestInstrumentFinderRetriesDatabaseFailures(t *testing.T) {
	tx := testutil.RequireDisposableDB(t).Begin()
	defer tx.Rollback()
	schema := "finder_failure_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if err := tx.Exec("CREATE SCHEMA " + schema).Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.Exec("SET LOCAL search_path TO " + schema).Error; err != nil {
		t.Fatal(err)
	}
	finder := newInstrumentFinder(tx, time.Second)
	// A savepoint allows a real undefined-table failure without poisoning the
	// surrounding transaction, then verifies the failure was not cached.
	if err := tx.SavePoint("before_lookup").Error; err != nil {
		t.Fatal(err)
	}
	if _, err := finder("LATER"); err == nil {
		t.Fatal("missing table should fail lookup")
	}
	if err := tx.RollbackTo("before_lookup").Error; err != nil {
		t.Fatal(err)
	}
	if err := tx.AutoMigrate(&model.Instrument{}); err != nil {
		t.Fatal(err)
	}
	if err := tx.Create(&model.Instrument{Symbol: "LATER-EQ", Name: "LATER", Token: "100", ExchangeSegment: "NSE"}).Error; err != nil {
		t.Fatal(err)
	}
	if found, err := finder("LATER"); err != nil || !found {
		t.Fatalf("database failure was cached as absence: %v %v", found, err)
	}
}
