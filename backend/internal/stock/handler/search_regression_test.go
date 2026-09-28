package handler

import (
	"strings"
	"testing"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestRegressionSearchSQLHasRanking(t *testing.T) {
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: "host=localhost user=unused dbname=unused sslmode=disable"}), &gorm.Config{DryRun: true, DisableAutomaticPing: true})
	if err != nil {
		t.Fatal(err)
	}
	var instruments []model.Instrument
	stmt := db.Clauses(searchOrder("tcs", "tcs%")).Limit(100).Find(&instruments).Statement
	sql := stmt.SQL.String()
	if !strings.Contains(sql, "ORDER BY") || !strings.Contains(sql, "CASE") || !strings.Contains(sql, "EQUITY") {
		t.Fatal(sql)
	}
	if strings.Contains(sql, "tcs") {
		t.Fatal("search input must be bound, not interpolated")
	}
}
