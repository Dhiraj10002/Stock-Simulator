package app

import (
	"context"
	instrumentService "github.com/Dhiraj10002/Stock-Simulator/backend/internal/instrument/service"
	"strings"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/testutil"
	"gorm.io/gorm"
	gormLogger "gorm.io/gorm/logger"
)

// PostgreSQL is disposable and all benchmark schema/data is rolled back.
func BenchmarkWarmSchemaStartup(b *testing.B) {
	tx := testutil.DisposableBenchmarkSchema(b)
	if _, err := migrateSchema(tx, false); err != nil {
		b.Fatal(err)
	}
	for _, mode := range []string{"legacy", "versioned"} {
		b.Run(mode, func(b *testing.B) {
			recorder := &queryRecorder{Interface: gormLogger.Default}
			db := tx.Session(&gorm.Session{Logger: recorder})
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if mode == "versioned" {
					if _, err := migrateSchema(db, false); err != nil {
						b.Fatal(err)
					}
				} else {
					if err := model.UpgradeInstrumentSchema(db); err != nil {
						b.Fatal(err)
					}
					if !db.Migrator().HasTable(&model.User{}) {
						b.Fatal("missing users")
					}
					for _, item := range []struct {
						model any
						field string
					}{{&model.Trade{}, "Tag"}, {&model.RefreshSession{}, "JTI"}, {&model.Instrument{}, "Active"}, {&model.Instrument{}, "Exchange"}, {&model.Instrument{}, "IsTradable"}} {
						if !db.Migrator().HasColumn(item.model, item.field) {
							b.Fatal("legacy schema incomplete")
						}
					}
					if !db.Migrator().HasTable(&model.InstrumentSnapshot{}) {
						b.Fatal("missing snapshots")
					}
					if err := upgradeRequiredSchema(db); err != nil {
						b.Fatal(err)
					}
					for _, statement := range performanceIndexStatements() {
						if err := db.Exec(statement).Error; err != nil {
							b.Fatal(err)
						}
					}
				}
			}
			b.StopTimer()
			b.ReportMetric(float64(len(recorder.queries))/float64(b.N), "sql_calls/op")
		})
	}
}

func BenchmarkMasterMetadataProjection(b *testing.B) {
	tx := testutil.DisposableBenchmarkSchema(b)
	if err := tx.AutoMigrate(&model.InstrumentSnapshot{}); err != nil {
		b.Fatal(err)
	}
	now := time.Now()
	snapshot := model.InstrumentSnapshot{Version: "benchmark-v1", Status: model.SnapshotStatusActive, TotalInstruments: 44500, Payload: strings.Repeat("x", 20*1024*1024), ActivatedAt: &now}
	if err := tx.Create(&snapshot).Error; err != nil {
		b.Fatal(err)
	}
	for _, mode := range []string{"legacy_full_snapshot", "metadata_only"} {
		b.Run(mode, func(b *testing.B) {
			service := instrumentService.NewService(tx)
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if mode == "metadata_only" {
					metadata, err := service.GetActiveSnapshot(context.Background())
					if err != nil || metadata.Payload != "" || metadata.Version != snapshot.Version {
						b.Fatalf("bad metadata: %v", err)
					}
				} else {
					var all []model.InstrumentSnapshot
					if err := tx.Where("status = ?", model.SnapshotStatusActive).Find(&all).Error; err != nil {
						b.Fatal(err)
					}
					if len(all) != 1 || len(all[0].Payload) != len(snapshot.Payload) {
						b.Fatal("missing benchmark payload")
					}
				}
			}
			b.StopTimer()
		})
	}
}
