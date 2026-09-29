package testutil

import (
	"os"
	"testing"
)

func TestValidateDisposableDBURL(t *testing.T) {
	// 1. Empty URL
	if err := ValidateDisposableDBURL(""); err == nil {
		t.Fatal("expected error for empty URL")
	}

	// 2. Matching application DATABASE_URL
	origAppDB := os.Getenv("DATABASE_URL")
	t.Setenv("DATABASE_URL", "postgresql://user:pass@127.0.0.1:5432/my_app_db")
	defer func() {
		if origAppDB != "" {
			_ = os.Setenv("DATABASE_URL", origAppDB)
		} else {
			_ = os.Unsetenv("DATABASE_URL")
		}
	}()

	if err := ValidateDisposableDBURL("postgresql://user:pass@127.0.0.1:5432/my_app_db"); err == nil {
		t.Fatal("expected error when TEST_DATABASE_URL matches DATABASE_URL")
	}

	// 3. Cloud/Production Neon DB URL
	neonURL := "postgresql://neondb_owner:npg_secret@ep-cool-butterfly-123456.us-east-2.aws.neon.tech/stock_simulator?sslmode=require"
	if err := ValidateDisposableDBURL(neonURL); err == nil {
		t.Fatal("expected error for Neon cloud host")
	}

	// 4. Disallowed production database name "stock_simulator"
	localProdNamed := "postgresql://postgres:postgres@127.0.0.1:5432/stock_simulator?sslmode=disable"
	if err := ValidateDisposableDBURL(localProdNamed); err == nil {
		t.Fatal("expected error when DB name is 'stock_simulator'")
	}

	// 5. Valid disposable database URLs
	validURLs := []string{
		"postgresql://postgres:postgres@127.0.0.1:5433/testdb?sslmode=disable",
		"postgresql://postgres:postgres@127.0.0.1:5432/stock_simulator_test?sslmode=disable",
		"postgresql://postgres:postgres@localhost:5432/ci_disposable_db?sslmode=disable",
	}
	for _, u := range validURLs {
		if err := ValidateDisposableDBURL(u); err != nil {
			t.Fatalf("unexpected error for valid disposable DB URL %q: %v", u, err)
		}
	}
}

func TestValidateDisposableRedisURL(t *testing.T) {
	// 1. Empty URL
	if err := ValidateDisposableRedisURL(""); err == nil {
		t.Fatal("expected error for empty URL")
	}

	// 2. Matching application REDIS_URL
	origAppRedis := os.Getenv("REDIS_URL")
	t.Setenv("REDIS_URL", "redis://127.0.0.1:6379/0")
	defer func() {
		if origAppRedis != "" {
			_ = os.Setenv("REDIS_URL", origAppRedis)
		} else {
			_ = os.Unsetenv("REDIS_URL")
		}
	}()

	if err := ValidateDisposableRedisURL("redis://127.0.0.1:6379/0"); err == nil {
		t.Fatal("expected error when TEST_REDIS_URL matches REDIS_URL")
	}

	// 3. Upstash cloud host
	upstashURL := "rediss://default:token@cool-monkey-12345.upstash.io:6379"
	if err := ValidateDisposableRedisURL(upstashURL); err == nil {
		t.Fatal("expected error for Upstash cloud Redis")
	}

	// 4. Valid local disposable Redis URLs
	validURLs := []string{
		"redis://127.0.0.1:6380/0",
		"redis://localhost:6379/15",
	}
	for _, u := range validURLs {
		if err := ValidateDisposableRedisURL(u); err != nil {
			t.Fatalf("unexpected error for valid disposable Redis URL %q: %v", u, err)
		}
	}
}
