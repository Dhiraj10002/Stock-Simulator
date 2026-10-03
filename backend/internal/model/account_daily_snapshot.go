package model

import (
	"time"

	"github.com/google/uuid"
)

// AccountDailySnapshot records user account equity baseline at session open (09:15 IST).
// Used for establishing true account daily P&L.
type AccountDailySnapshot struct {
	Epoch                     string    `gorm:"size:36;not null;default:'';uniqueIndex:idx_daily_snapshots_user_date" json:"epoch"`
	ID                        uint      `gorm:"primaryKey" json:"id"`
	UserUUID                  uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_daily_snapshots_user_date" json:"user_uuid"`
	SessionDate               string    `gorm:"type:date;not null;uniqueIndex:idx_daily_snapshots_user_date" json:"session_date"`
	OpeningCashPaise          int64     `gorm:"not null" json:"opening_cash_paise"`
	OpeningHoldingsValuePaise int64     `gorm:"not null" json:"opening_holdings_value_paise"`
	OpeningEquityPaise        int64     `gorm:"not null" json:"opening_equity_paise"`
	NetCashInflowsPaise       int64     `gorm:"not null;default:0" json:"net_cash_inflows_paise"`
	CreatedAt                 time.Time `gorm:"not null;default:CURRENT_TIMESTAMP" json:"created_at"`
}

func (AccountDailySnapshot) TableName() string {
	return "account_daily_snapshots"
}
