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
}

func Load() (*Config, error) {

	_ = godotenv.Load()

	viper.AutomaticEnv()

	cfg := &Config{
		AppName:    viper.GetString("APP_NAME"),
		AppEnv:     viper.GetString("APP_ENV"),
		Port:       viper.GetString("PORT"),
		APIVersion: viper.GetString("API_VERSION"),
	}

	return cfg, nil
}