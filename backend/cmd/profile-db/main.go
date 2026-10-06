// profile-db measures connection setup, warm round trips and optional read-only
// execution plans. It does not migrate schemas or read account balances.
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"math"
	"net"
	"os"
	"sort"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/pkg/logger"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/joho/godotenv"
)

type timings struct {
	MinMs float64 `json:"min_ms"`
	P50Ms float64 `json:"p50_ms"`
	P95Ms float64 `json:"p95_ms"`
	MaxMs float64 `json:"max_ms"`
}

func summarize(values []float64) timings {
	sort.Float64s(values)
	round := func(v float64) float64 { return math.Round(v*100) / 100 }
	percentile := func(p float64) float64 { return round(values[int(math.Ceil(p*float64(len(values))))-1]) }
	return timings{round(values[0]), percentile(.5), percentile(.95), round(values[len(values)-1])}
}

func sample(count int, operation func(context.Context) error) (timings, error) {
	values := make([]float64, 0, count)
	for i := 0; i < count; i++ {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		start := time.Now()
		err := operation(ctx)
		values = append(values, float64(time.Since(start).Microseconds())/1000)
		cancel()
		if err != nil {
			return timings{}, err
		}
	}
	return summarize(values), nil
}

func main() {
	samples := flag.Int("samples", 5, "number of warm ping and SELECT 1 samples (1-20)")
	plans := flag.Bool("plans", false, "include EXPLAIN ANALYZE for three read-only instrument/order queries")
	flag.Parse()
	if *samples < 1 || *samples > 20 {
		fmt.Fprintln(os.Stderr, "samples must be between 1 and 20")
		os.Exit(2)
	}
	_ = godotenv.Load()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is required")
		os.Exit(2)
	}
	if err := run(url, *samples, *plans); err != nil {
		fmt.Fprintln(os.Stderr, logger.SanitizeText(err.Error()))
		os.Exit(1)
	}
}

func run(url string, samples int, includePlans bool) error {
	cfg, err := pgx.ParseConfig(url)
	if err != nil {
		return fmt.Errorf("parse database configuration: %w", err)
	}
	// Match the API's IPv4 dialing policy. Warm samples reuse one connection.
	dialer := &net.Dialer{Timeout: 8 * time.Second, KeepAlive: 30 * time.Second}
	cfg.DialFunc = func(ctx context.Context, _ string, addr string) (net.Conn, error) {
		return dialer.DialContext(ctx, "tcp4", addr)
	}
	db := stdlib.OpenDB(*cfg)
	defer db.Close()
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	connection, err := sample(1, db.PingContext)
	if err != nil {
		return fmt.Errorf("initial database connection: %w", err)
	}
	ping, err := sample(samples, db.PingContext)
	if err != nil {
		return fmt.Errorf("warm database ping: %w", err)
	}
	selectOne, err := sample(samples, func(ctx context.Context) error {
		var one int
		return db.QueryRowContext(ctx, "SELECT 1").Scan(&one)
	})
	if err != nil {
		return fmt.Errorf("SELECT 1 round trip: %w", err)
	}
	result := struct {
		Samples      int                        `json:"samples"`
		ConnectionMs float64                    `json:"initial_connection_ms"`
		Ping         timings                    `json:"warm_ping"`
		SelectOne    timings                    `json:"select_one_round_trip"`
		Plans        map[string]json.RawMessage `json:"read_only_plans,omitempty"`
	}{Samples: samples, ConnectionMs: connection.P50Ms, Ping: ping, SelectOne: selectOne}
	if includePlans {
		result.Plans, err = readOnlyPlans(db)
		if err != nil {
			return err
		}
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	return encoder.Encode(result)
}

func readOnlyPlans(db *sql.DB) (map[string]json.RawMessage, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	tx, err := db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	queries := map[string]string{
		"master_refresh_metadata": `SELECT COUNT(*), MAX(updated_at) FROM instruments WHERE active = true AND (is_tradable = true OR instrument_type IN ('INDEX', 'AMXIDX')) AND snapshot_version IN (SELECT version FROM instrument_snapshots WHERE status = 'ACTIVE')`,
		"instrument_existence":    `SELECT EXISTS (SELECT 1 FROM instruments WHERE UPPER(symbol) IN ('TCS', 'TCS-EQ') OR UPPER(name) = 'TCS')`,
		"pending_intraday_orders": `SELECT * FROM orders WHERE product = 'INTRADAY' AND status IN ('PENDING', 'OPEN', 'TRIGGER_PENDING')`,
	}
	result := make(map[string]json.RawMessage)
	for name, query := range queries {
		var plan []byte
		if err := tx.QueryRowContext(ctx, "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "+query).Scan(&plan); err != nil {
			return nil, fmt.Errorf("profile %s: %w", name, err)
		}
		result[name] = plan
	}
	return result, nil
}
