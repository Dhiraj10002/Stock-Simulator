package testutil

import (
	"os"
	"strings"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// DisposableBenchmarkSchema isolates all benchmark DDL and rows in a rolled
// back transaction. It uses the same database URL guard as integration tests.
func DisposableBenchmarkSchema(b *testing.B) *gorm.DB {
	b.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		b.Skip("TEST_DATABASE_URL required")
	}
	if err := ValidateDisposableDBURL(url); err != nil {
		b.Fatal(err)
	}
	if err := database.Connect(&config.Config{DatabaseURL: url}); err != nil {
		b.Fatal(err)
	}
	db := database.GetDB()
	pool, err := db.DB()
	if err != nil {
		b.Fatal(err)
	}
	b.Cleanup(func() { pool.Close() })
	tx := db.Begin()
	if tx.Error != nil {
		b.Fatal(tx.Error)
	}
	b.Cleanup(func() { tx.Rollback() })
	schema := "benchmark_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	for _, sql := range []string{"CREATE SCHEMA " + schema, "SET LOCAL search_path TO " + schema} {
		if err := tx.Exec(sql).Error; err != nil {
			b.Fatal(err)
		}
	}
	return tx
}
