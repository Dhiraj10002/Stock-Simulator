package model

import (
	"time"

	"github.com/google/uuid"
)

// Wallet stores balances in paise (1 rupee = 100 paise).
// Integer money values avoid floating-point rounding errors.
type Wallet struct {
	ID               uint      `gorm:"primaryKey"`
	UUID             uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	UserUUID         uuid.UUID `gorm:"type:uuid;uniqueIndex;not null"`
	CashBalancePaise int64     `gorm:"not null;default:0"`
	BlockedPaise     int64     `gorm:"not null;default:0"`
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

const (
	WalletTransactionCredit  = "CREDIT"
	WalletTransactionDebit   = "DEBIT"
	WalletTransactionReserve = "RESERVE"
	WalletTransactionRelease = "RELEASE"
)

// AvailableBalancePaise is the amount that can currently be used for orders.
func (w Wallet) AvailableBalancePaise() int64 {
	return w.CashBalancePaise - w.BlockedPaise
}
