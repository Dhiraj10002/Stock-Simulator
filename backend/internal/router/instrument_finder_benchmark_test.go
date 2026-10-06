package router

import (
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/testutil"
)

var benchmarkFinder func(string) (bool, error)

func BenchmarkInstrumentFinderBootstrap(b *testing.B) {
	tx := testutil.DisposableBenchmarkSchema(b)
	if err := tx.AutoMigrate(&model.Instrument{}); err != nil {
		b.Fatal(err)
	}
	if err := tx.Exec(`INSERT INTO instruments (token,symbol,name,exchange_segment)
		SELECT i::text, 'BENCH'||i||'-EQ', 'BENCH'||i, 'NSE' FROM generate_series(1,44500) i`).Error; err != nil {
		b.Fatal(err)
	}
	for _, mode := range []string{"legacy_preload", "on_demand"} {
		b.Run(mode, func(b *testing.B) {
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				if mode == "on_demand" {
					benchmarkFinder = newInstrumentFinder(tx, time.Second)
					continue
				}
				var symbols []string
				if err := tx.Model(&model.Instrument{}).Where("active = ? AND is_tradable = ?", true, true).Pluck("symbol", &symbols).Error; err != nil {
					b.Fatal(err)
				}
				var cache sync.Map
				for _, symbol := range symbols {
					clean := strings.ToUpper(strings.TrimSpace(symbol))
					cache.Store(clean, true)
					cache.Store(strings.TrimSuffix(clean, "-EQ"), true)
				}
			}
			b.StopTimer()
			if mode == "on_demand" {
				b.ReportMetric(0, "sql_calls/op")
			} else {
				b.ReportMetric(1, "sql_calls/op")
			}
		})
	}
}
