package config

import (
	"fmt"
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
	}

	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	if cfg.APIVersion == "" {
		cfg.APIVersion = "v1"
	}
	if cfg.CORSAllowedOrigins == "" {
		cfg.CORSAllowedOrigins = "http://localhost:3000"
	}
	if cfg.InitialVirtualBalancePaise <= 0 {
		cfg.InitialVirtualBalancePaise = 100000000 // ₹10,00,000
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
