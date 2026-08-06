package logger

import (
	"go.uber.org/zap"
)

var Log *zap.Logger

func Init() error {
	var err error

	Log, err = zap.NewProduction()
	if err != nil {
		return err
	}

	return nil
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