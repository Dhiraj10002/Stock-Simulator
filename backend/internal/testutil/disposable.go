package testutil

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

var (
	disposableDBOnce sync.Once
	disposableDB     *gorm.DB
	disposableDBErr  error
)

// ValidateDisposableDBURL enforces that the test database connection string
// CANNOT point to the application or production account database.
func ValidateDisposableDBURL(rawURL string) error {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return errors.New("TEST_DATABASE_URL is empty")
	}

	// 1. Must not match application DATABASE_URL
	appDBURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if appDBURL != "" && rawURL == appDBURL {
		return errors.New("TEST_DATABASE_URL cannot match application DATABASE_URL; tests must use an isolated disposable database")
	}

	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid database URL: %w", err)
	}

	host := strings.ToLower(parsed.Hostname())

	// 2. Reject known managed / production cloud database domains
	prohibitedHosts := []string{
		"neon.tech",
		"aws.neon.tech",
		"rds.amazonaws.com",
		"supabase.co",
		"supabase.in",
		"elephantsql.com",
		"aivencloud.com",
		"cockroachlabs.cloud",
	}
	for _, ph := range prohibitedHosts {
		if strings.HasSuffix(host, ph) || strings.Contains(host, ph) {
			if os.Getenv("ALLOW_CLOUD_TEST_DATABASE") != "1" {
				return fmt.Errorf("refusing to run tests against cloud/production database host %q (set ALLOW_CLOUD_TEST_DATABASE=1 if this is a disposable cloud test database)", host)
			}
		}
	}

	// 3. Reject normal account database name "stock_simulator" unless explicitly marked as a test database
	dbName := strings.TrimPrefix(parsed.Path, "/")
	if strings.EqualFold(dbName, "stock_simulator") {
		return fmt.Errorf("refusing to run tests against account database %q; test database name must contain 'test' (e.g. 'stock_simulator_test' or 'testdb')", dbName)
	}

	return nil
}

// RequireDisposableDB returns an initialized and migrated disposable PostgreSQL *gorm.DB.
// If TEST_DATABASE_URL is unset, it skips the test. If TEST_DATABASE_URL points
// to an unsafe database, it fails the test immediately.
func RequireDisposableDB(t *testing.T) *gorm.DB {
	t.Helper()
	rawURL := os.Getenv("TEST_DATABASE_URL")
	if strings.TrimSpace(rawURL) == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database (e.g. postgresql://postgres:postgres@127.0.0.1:5433/testdb?sslmode=disable)")
	}

	if err := ValidateDisposableDBURL(rawURL); err != nil {
		t.Fatalf("SAFETY ABORT: Refusing to run tests: %v", err)
	}

	disposableDBOnce.Do(func() {
		cfg := &config.Config{DatabaseURL: rawURL}
		if err := database.Connect(cfg); err != nil {
			disposableDBErr = fmt.Errorf("connect disposable database: %w", err)
			return
		}
		db := database.GetDB()
		if err := db.AutoMigrate(
			&model.User{},
			&model.Wallet{},
			&model.WalletTransaction{},
			&model.Position{},
			&model.Order{},
			&model.Trade{},
			&model.Instrument{},
			&model.RiskEvent{},
		); err != nil {
			disposableDBErr = fmt.Errorf("migrate disposable database: %w", err)
			return
		}
		disposableDB = db
	})

	if disposableDBErr != nil {
		t.Fatalf("disposable database setup failed: %v", disposableDBErr)
	}
	if disposableDB == nil {
		t.Fatal("disposable database was not initialized")
	}

	return disposableDB
}

// ValidateDisposableRedisURL enforces that the test Redis connection string
// CANNOT point to the application or production Upstash Redis.
func ValidateDisposableRedisURL(rawURL string) error {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return errors.New("TEST_REDIS_URL is empty")
	}

	// 1. Must not match application REDIS_URL
	appRedisURL := strings.TrimSpace(os.Getenv("REDIS_URL"))
	if appRedisURL != "" && rawURL == appRedisURL {
		return errors.New("TEST_REDIS_URL cannot match application REDIS_URL; tests must use an isolated disposable Redis")
	}

	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid redis URL: %w", err)
	}

	host := strings.ToLower(parsed.Hostname())

	// 2. Reject known managed / production cloud redis domains
	if strings.Contains(host, "upstash.io") || strings.Contains(host, "redislabs.com") || strings.Contains(host, "redis.cache.windows.net") {
		if os.Getenv("ALLOW_CLOUD_TEST_REDIS") != "1" {
			return fmt.Errorf("refusing to run tests against cloud Redis host %q (set ALLOW_CLOUD_TEST_REDIS=1 if this is a disposable cloud test Redis)", host)
		}
	}

	return nil
}

// RequireDisposableRedis returns a verified client connected to disposable Redis.
// If TEST_REDIS_URL is unset, it skips the test.
func RequireDisposableRedis(t *testing.T) *redis.Client {
	t.Helper()
	rawURL := os.Getenv("TEST_REDIS_URL")
	if strings.TrimSpace(rawURL) == "" {
		t.Skip("set TEST_REDIS_URL to an isolated disposable Redis instance")
	}

	if err := ValidateDisposableRedisURL(rawURL); err != nil {
		t.Fatalf("SAFETY ABORT: Refusing to run tests against Redis: %v", err)
	}

	opts, err := redis.ParseURL(rawURL)
	if err != nil {
		t.Fatalf("parse TEST_REDIS_URL: %v", err)
	}

	client := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		t.Skipf("disposable Redis at %q is not reachable: %v", rawURL, err)
	}

	t.Cleanup(func() {
		_ = client.Close()
	})

	return client
}
