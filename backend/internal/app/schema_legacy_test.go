package app

import (
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"gorm.io/gorm"
)

// The pre-versioned bootstrap is retained only for legacy upgrade tests and comparisons.
func upgradeRequiredSchema(db *gorm.DB) error {
	if err := upgradeDailySnapshotIndex(db); err != nil {
		return err
	}
	return db.AutoMigrate(&model.Order{}, &model.RefreshSession{}, &model.SettlementReference{}, &model.AccountDailySnapshot{}, &model.Instrument{}, &model.InstrumentSnapshot{})
}
