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

		// Force IPv4 dialing to avoid IPv6 routing timeouts on dual-stack hosts, with retry for transient DNS hiccups
		dialer := &net.Dialer{
			Timeout:   8 * time.Second,
			KeepAlive: 30 * time.Second,
		}
		pgxCfg.DialFunc = func(ctx context.Context, _ string, addr string) (net.Conn, error) {
			var conn net.Conn
			var dialErr error
			for attempt := 0; attempt < 3; attempt++ {
				conn, dialErr = dialer.DialContext(ctx, "tcp4", addr)
				if dialErr == nil {
					return conn, nil
				}
				select {
				case <-ctx.Done():
					return nil, ctx.Err()
				case <-time.After(100 * time.Millisecond):
				}
			}
			return nil, dialErr
		}

		sqlDB := stdlib.OpenDB(*pgxCfg)
		sqlDB.SetMaxOpenConns(25)
		sqlDB.SetMaxIdleConns(25)
		sqlDB.SetConnMaxIdleTime(10 * time.Minute)
		sqlDB.SetConnMaxLifetime(30 * time.Minute)

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

// SetDBForTesting overrides the database connection for unit and integration tests.
func SetDBForTesting(d *gorm.DB) {
	db = d
}
