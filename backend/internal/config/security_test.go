package config

import (
	"os"
	"strings"
	"testing"
)

const testSigningSecret = "9a76f328d104b5e69c027adf8310e4b5f602a389d417e650c38fb024da9176be"

func TestJWTSecretValidation(t *testing.T) {
	for _, value := range []string{"", "short", "change_this_to_a_long_random_secret", "replace-with-a-long-random-secret", "<generate-secure-random-32-byte-hex-string>", strings.Repeat("x", 64), " " + testSigningSecret} {
		if err := validateJWTSecret(value); err == nil {
			t.Error("unsafe signing secret accepted")
		}
	}
	if err := validateJWTSecret(testSigningSecret); err != nil {
		t.Fatal(err)
	}
}

func TestLoadRejectsUnsafeSecretsInEveryEnvironment(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://unused/test")
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://app.example.com")
	for _, env := range []string{"development", "production"} {
		t.Run(env, func(t *testing.T) {
			t.Setenv("APP_ENV", env)
			t.Setenv("JWT_SECRET", "change_this_to_a_long_random_secret")
			if _, err := Load(); err == nil {
				t.Fatal("Load accepted placeholder")
			}
			t.Setenv("JWT_SECRET", testSigningSecret)
			if _, err := Load(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestRateLimitingDefaultsOnAndAllowsExplicitOverride(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://unused/test")
	t.Setenv("JWT_SECRET", testSigningSecret)
	t.Setenv("APP_ENV", "development")
	t.Setenv("RATE_LIMIT_ENABLED", "")
	if err := os.Unsetenv("RATE_LIMIT_ENABLED"); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load()
	if err != nil || !cfg.RateLimitEnabled {
		t.Fatalf("default limiter: cfg=%v err=%v", cfg != nil, err)
	}
	t.Setenv("RATE_LIMIT_ENABLED", "false")
	cfg, err = Load()
	if err != nil || cfg.RateLimitEnabled {
		t.Fatalf("explicit override failed: %v", err)
	}
}
