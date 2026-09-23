package database

import (
	"context"
	"log"
	"net"
	"os"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormLogger "gorm.io/gorm/logger"
)

var db *gorm.DB

func Connect(cfg *config.Config) error {
	newLogger := gormLogger.New(
		log.New(os.Stdout, "", log.LstdFlags),
		gormLogger.Config{
			SlowThreshold:             time.Second,
			LogLevel:                  gormLogger.Warn,
			IgnoreRecordNotFoundError: true,
			Colorful:                  true,
		},
	)

	var conn *gorm.DB
	var lastErr error

	for attempt := 1; attempt <= 5; attempt++ {
		pgxCfg, err := pgx.ParseConfig(cfg.DatabaseURL)
		if err != nil {
			return err
		}

		// Force IPv4 dialing to avoid IPv6 routing timeouts on dual-stack hosts
		dialer := &net.Dialer{Timeout: 8 * time.Second}
		pgxCfg.DialFunc = func(ctx context.Context, _ string, addr string) (net.Conn, error) {
			return dialer.DialContext(ctx, "tcp4", addr)
		}

		sqlDB := stdlib.OpenDB(*pgxCfg)
		sqlDB.SetMaxOpenConns(25)
		sqlDB.SetMaxIdleConns(5)
		sqlDB.SetConnMaxLifetime(5 * time.Minute)

		conn, lastErr = gorm.Open(postgres.New(postgres.Config{
			Conn: sqlDB,
		}), &gorm.Config{
			Logger: newLogger,
		})

		if lastErr == nil {
			db = conn
			return nil
		}

		log.Printf("[warn] Database connect attempt %d/5 failed: %v. Retrying in 2s...", attempt, lastErr)
		_ = sqlDB.Close()
		time.Sleep(2 * time.Second)
	}

	return lastErr
}

func GetDB() *gorm.DB {
	return db
}
