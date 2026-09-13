package model

import (
	"time"

	"github.com/google/uuid"
)

// Position represents one symbol currently held by a user.
// Prices are stored in paise and quantity is stored as whole units.
type Position struct {
	ID                uint      `gorm:"primaryKey"`
	UUID              uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	UserUUID          uuid.UUID `gorm:"type:uuid;index;not null"`
	Symbol            string    `gorm:"size:30;index;not null"`
	Quantity          int64     `gorm:"not null;default:0"`
	AveragePricePaise int64     `gorm:"not null;default:0"`
	// CostBasisPaise retains the exact remaining acquisition cost. Average
	// price is only a display value and cannot represent fractional paise.
	CostBasisPaise    int64     `gorm:"not null;default:0"`
	RealizedPnlPaise  int64     `gorm:"not null;default:0"`
	CurrentPricePaise int64     `gorm:"not null;default:0"`
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

func (p Position) InvestedValuePaise() int64 {
	// Rows created before exact cost-basis tracking have a zero value here.
	// Preserve their historical behaviour until they next trade.
	if p.CostBasisPaise == 0 && p.Quantity > 0 && p.AveragePricePaise > 0 {
		return p.Quantity * p.AveragePricePaise
	}
	return p.CostBasisPaise
}

func (p Position) CurrentValuePaise() int64 {
	return p.Quantity * p.CurrentPricePaise
}

func (p Position) UnrealizedPnlPaise() int64 {
	return p.CurrentValuePaise() - p.InvestedValuePaise()
}
