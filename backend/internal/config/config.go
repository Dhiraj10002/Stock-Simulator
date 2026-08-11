package config

import (
	"fmt"
	"github.com/joho/godotenv"
	"github.com/spf13/viper"
	"strings"
)

type Config struct {
	AppName    string
	AppEnv     string
	Port       string
	APIVersion string

	DatabaseURL string

	JWTSecret string

	CORSAllowedOrigins string
}

func Load() (*Config, error) {

	_ = godotenv.Load()

	viper.AutomaticEnv()

	cfg := &Config{
		AppName:     viper.GetString("APP_NAME"),
		AppEnv:      viper.GetString("APP_ENV"),
		Port:        viper.GetString("PORT"),
		APIVersion:  viper.GetString("API_VERSION"),
		DatabaseURL: viper.GetString("DATABASE_URL"),

		JWTSecret: viper.GetString("JWT_SECRET"),

		CORSAllowedOrigins: viper.GetString("CORS_ALLOWED_ORIGINS"),
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

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if strings.TrimSpace(cfg.JWTSecret) == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}

	return cfg, nil
}
