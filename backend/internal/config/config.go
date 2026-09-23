package config

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/spf13/viper"
)

type Config struct {
	AppName    string
	AppEnv     string
	Port       string
	APIVersion string

	DatabaseURL           string
	RedisURL              string
	RedisOperationTimeout time.Duration

	RateLimitEnabled         bool
	RateLimitWindow          time.Duration
	RateLimitMaxRequests     int
	AuthRateLimitMaxRequests int

	JWTSecret    string
	GeminiAPIKey string
	GeminiModel  string

	CORSAllowedOrigins         string
	InitialVirtualBalancePaise int64
	MISLeverage                int64
	FuturesMarginPercent       int64
	OptionSellMarginPercent    int64
	AllowSeededQuotes          bool
	MarketWorkerURL            string
}

func Load() (*Config, error) {

	_ = godotenv.Load()

	viper.AutomaticEnv()

	cfg := &Config{
		AppName:               viper.GetString("APP_NAME"),
		AppEnv:                viper.GetString("APP_ENV"),
		Port:                  viper.GetString("PORT"),
		APIVersion:            viper.GetString("API_VERSION"),
		DatabaseURL:           viper.GetString("DATABASE_URL"),
		RedisURL:              viper.GetString("REDIS_URL"),
		RedisOperationTimeout: viper.GetDuration("REDIS_OPERATION_TIMEOUT"),

		RateLimitEnabled:         viper.IsSet("RATE_LIMIT_ENABLED") && viper.GetBool("RATE_LIMIT_ENABLED"),
		RateLimitWindow:          viper.GetDuration("RATE_LIMIT_WINDOW"),
		RateLimitMaxRequests:     viper.GetInt("RATE_LIMIT_MAX_REQUESTS"),
		AuthRateLimitMaxRequests: viper.GetInt("AUTH_RATE_LIMIT_MAX_REQUESTS"),

		JWTSecret:    viper.GetString("JWT_SECRET"),
		GeminiAPIKey: viper.GetString("GEMINI_API_KEY"),
		GeminiModel:  viper.GetString("GEMINI_MODEL"),

		CORSAllowedOrigins:         viper.GetString("CORS_ALLOWED_ORIGINS"),
		InitialVirtualBalancePaise: viper.GetInt64("INITIAL_VIRTUAL_BALANCE_PAISE"),
		MISLeverage:                viper.GetInt64("MIS_LEVERAGE"),
		FuturesMarginPercent:       viper.GetInt64("FUTURES_MARGIN_PERCENT"),
		OptionSellMarginPercent:    viper.GetInt64("OPTION_SELL_MARGIN_PERCENT"),
		AllowSeededQuotes:          viper.GetBool("ALLOW_SEEDED_QUOTES") || viper.GetBool("SIMULATION_MODE") || viper.GetBool("ALLOW_SEEDED_EXECUTABLE_QUOTES"),
		MarketWorkerURL:            viper.GetString("MARKET_WORKER_URL"),
	}

	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	if cfg.APIVersion == "" {
		cfg.APIVersion = "v1"
	}
	if cfg.AppEnv == "" {
		if env := viper.GetString("ENVIRONMENT"); env != "" {
			cfg.AppEnv = env
		} else {
			cfg.AppEnv = "development"
		}
	}
	isProd := strings.ToLower(strings.TrimSpace(cfg.AppEnv)) == "production"
	if cfg.CORSAllowedOrigins == "" {
		if isProd {
			log.Println("WARNING: CORS_ALLOWED_ORIGINS is not set in production — all cross-origin requests will be rejected")
		} else {
			cfg.CORSAllowedOrigins = "http://localhost:3000"
		}
	}
	if isProd && strings.TrimSpace(cfg.CORSAllowedOrigins) == "*" {
		return nil, fmt.Errorf("CORS_ALLOWED_ORIGINS=* is not allowed in production; set explicit origins (e.g. https://app.example.com)")
	}
	if cfg.MarketWorkerURL == "" {
		if isProd || isRunningInDocker() {
			cfg.MarketWorkerURL = "http://market-worker:8085"
		} else {
			cfg.MarketWorkerURL = "http://127.0.0.1:8085"
		}
	}
	if cfg.InitialVirtualBalancePaise <= 0 {
		cfg.InitialVirtualBalancePaise = 100000000 // ₹10,00,000
	}
	if cfg.MISLeverage <= 0 {
		cfg.MISLeverage = 5
	}
	if cfg.FuturesMarginPercent <= 0 || cfg.FuturesMarginPercent > 100 {
		cfg.FuturesMarginPercent = 20
	}
	if cfg.OptionSellMarginPercent <= 0 || cfg.OptionSellMarginPercent > 100 {
		cfg.OptionSellMarginPercent = 30
	}
	if cfg.RedisURL == "" {
		cfg.RedisURL = "redis://localhost:6379/0"
	}
	if cfg.RedisOperationTimeout <= 0 {
		cfg.RedisOperationTimeout = 2 * time.Second
	}
	if cfg.RateLimitWindow <= 0 {
		cfg.RateLimitWindow = time.Minute
	}
	if cfg.RateLimitMaxRequests <= 0 {
		cfg.RateLimitMaxRequests = 60
	}
	if cfg.AuthRateLimitMaxRequests <= 0 {
		cfg.AuthRateLimitMaxRequests = 10
	}
	if cfg.GeminiModel == "" {
		cfg.GeminiModel = "gemini-3.7-flash"
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if strings.TrimSpace(cfg.JWTSecret) == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}

	return cfg, nil
}

func isRunningInDocker() bool {
	if _, err := os.Stat("/.dockerenv"); err == nil {
		return true
	}
	if _, err := os.Stat("/run/.containerenv"); err == nil {
		return true
	}
	if os.Getenv("CONTAINER") != "" || os.Getenv("DOCKER_CONTAINER") != "" {
		return true
	}
	return false
}

// IsProduction returns true if the application environment is configured for production.
func (c *Config) IsProduction() bool {
	if c == nil {
		return false
	}
	return strings.ToLower(strings.TrimSpace(c.AppEnv)) == "production"
}
