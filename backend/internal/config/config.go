package config

import (
	"github.com/joho/godotenv"
	"github.com/spf13/viper"
)

type Config struct {
	AppName    string
	AppEnv     string
	Port       string
	APIVersion string

	DatabaseURL    string
	JWTSecret      string
	AccessTokenTTL string
	RefreshTokenTTL string
}

func Load() (*Config, error) {

	_ = godotenv.Load()

	viper.AutomaticEnv()

	cfg := &Config{
		AppName:    viper.GetString("APP_NAME"),
		AppEnv:     viper.GetString("APP_ENV"),
		Port:       viper.GetString("PORT"),
		APIVersion: viper.GetString("API_VERSION"),
		DatabaseURL:     viper.GetString("DATABASE_URL"),

        JWTSecret:       viper.GetString("JWT_SECRET"),
        AccessTokenTTL:  viper.GetString("ACCESS_TOKEN_TTL"),
        RefreshTokenTTL: viper.GetString("REFRESH_TOKEN_TTL"),
	}

	return cfg, nil
}