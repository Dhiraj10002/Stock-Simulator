package model

import (
	"time"

	"github.com/google/uuid"
)

const (
	WalletTransactionInitialCredit = "INITIAL_CREDIT"
	WalletTransactionReset         = "RESET"
)

type WalletTransaction struct {
	ID           uint      `gorm:"primaryKey"`
	UUID         uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	WalletUUID   uuid.UUID `gorm:"type:uuid;index;not null"`
	Type         string    `gorm:"size:30;index;not null"`
	AmountPaise  int64     `gorm:"not null"`
	BalancePaise int64     `gorm:"not null"`
	BlockedPaise int64     `gorm:"not null;default:0"`
	Note         string    `gorm:"size:255"`
	CreatedAt    time.Time
}
