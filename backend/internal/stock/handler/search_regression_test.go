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

func TestPrintSearchSQL(t *testing.T) {
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: "host=localhost user=unused dbname=unused sslmode=disable"}), &gorm.Config{DryRun: true, DisableAutomaticPing: true})
	if err != nil {
		t.Fatal(err)
	}
	var instruments []model.Instrument
	query := "tcs"
	pattern := "%tcs%"
	prefixPattern := "tcs%"
	dbQuery := db.Where("symbol ILIKE ? ESCAPE '\\' OR name ILIKE ? ESCAPE '\\'", pattern, pattern)
	dbQuery = dbQuery.Where("active = ?", true).
		Where("exchange != 'BFO' AND exchange_segment != 'BFO'").
		Where("instrument_type IN ?", []string{"", "EQ", "EQUITY", "INDEX", "AMXIDX", "FUTSTK", "FUTIDX", "OPTSTK", "OPTIDX"}).
		Where("(exchange_segment = 'NFO') OR (exchange_segment = 'NSE' AND (instrument_type IN ('INDEX', 'AMXIDX') OR symbol NOT LIKE '%-%' OR symbol LIKE '%-EQ')) OR (exchange_segment = 'BSE' AND (symbol = 'SENSEX' OR instrument_type IN ('INDEX', 'AMXIDX')))")
	dbQuery = dbQuery.Where("token ~ '^[0-9]+$'")
	cutoff := "2026-10-07"
	dbQuery = dbQuery.Where(`(COALESCE(expiry, '') = '' OR
		(CASE WHEN expiry ~ '^\d{4}-\d{2}-\d{2}$' THEN expiry::date
		 WHEN expiry ~ '^\d{2}[A-Za-z]{3}\d{4}$' THEN to_date(expiry, 'DDMONYYYY')
		 WHEN expiry ~ '^\d{2}-[A-Za-z]{3}-\d{4}$' THEN to_date(expiry, 'DD-MON-YYYY') END) >= ?::date)`, cutoff)
	dbQuery = dbQuery.Where("instrument_type IN ?", []string{"OPTSTK", "OPTIDX"})
	stmt := dbQuery.Clauses(searchOrder(query, prefixPattern)).Limit(100).Find(&instruments).Statement
	sql := stmt.SQL.String()
	if !strings.Contains(sql, "(COALESCE(expiry") {
		t.Fatalf("expected parenthesized expiry clause in SQL: %s", sql)
	}
	t.Logf("SQL: %s", sql)
}
