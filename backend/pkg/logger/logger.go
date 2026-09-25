package logger

import (
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var Log = zap.NewNop()

// Init initializes the production Zap logger equipped with the SanitizingCore
// to strictly guarantee zero leaks of JWTs, API keys, passwords, and sensitive headers.
func Init() error {
	prodConfig := zap.NewProductionConfig()
	prodConfig.EncoderConfig.TimeKey = "timestamp"
	prodConfig.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder

	baseLogger, err := prodConfig.Build()
	if err != nil {
		return err
	}

	sanitizedCore := NewSanitizingCore(baseLogger.Core())
	Log = zap.New(sanitizedCore, zap.AddCaller(), zap.AddCallerSkip(1))
	return nil
}

// SetLogger replaces the active global logger (useful for tests or custom outputs).
func SetLogger(l *zap.Logger) {
	if l != nil {
		sanitizedCore := NewSanitizingCore(l.Core())
		Log = zap.New(sanitizedCore)
	}
}

func Sync() {
	if Log != nil {
		_ = Log.Sync()
	}
}

func Info(msg string, fields ...zap.Field) {
	Log.Info(msg, fields...)
}

func Warn(msg string, fields ...zap.Field) {
	Log.Warn(msg, fields...)
}

func Error(msg string, fields ...zap.Field) {
	Log.Error(msg, fields...)
}

func Fatal(msg string, fields ...zap.Field) {
	Log.Fatal(msg, fields...)
}

func Debug(msg string, fields ...zap.Field) {
	Log.Debug(msg, fields...)
}

// Structured Field Constructors for Canonical Observability

func RequestID(id string) zap.Field {
	return zap.String("request_id", id)
}

func UserID(id string) zap.Field {
	return zap.String("user_id", id)
}

func OrderID(id string) zap.Field {
	return zap.String("order_id", id)
}

func MarketEventID(id string) zap.Field {
	return zap.String("market_event_id", id)
}

func FeedState(state string) zap.Field {
	return zap.String("feed_state", state)
}

func LastTick(tick string) zap.Field {
	return zap.String("last_tick", tick)
}

func Latency(d time.Duration) zap.Field {
	return zap.Duration("latency", d)
}

func ExecutionLatency(d time.Duration) zap.Field {
	return zap.Duration("execution_latency", d)
}

func RedisLatency(d time.Duration) zap.Field {
	return zap.Duration("redis_latency", d)
}

func DBLatency(d time.Duration) zap.Field {
	return zap.Duration("db_latency", d)
}
