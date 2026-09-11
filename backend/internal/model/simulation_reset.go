package model

import (
	"time"

	"github.com/google/uuid"
)

// SimulationReset is an immutable audit snapshot taken before a user's current
// simulation state is cleared.
type SimulationReset struct {
	ID                   uint      `gorm:"primaryKey"`
	UUID                 uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	UserUUID             uuid.UUID `gorm:"type:uuid;index;not null"`
	InitialBalancePaise  int64     `gorm:"not null"`
	PreviousCashPaise    int64     `gorm:"not null"`
	PreviousBlockedPaise int64     `gorm:"not null"`
	InvestedValuePaise   int64     `gorm:"not null"`
	CurrentValuePaise    int64     `gorm:"not null"`
	UnrealizedPnlPaise   int64     `gorm:"not null"`
	CancelledOrderCount  int64     `gorm:"not null"`
	ClearedPositionCount int64     `gorm:"not null"`
	CreatedAt            time.Time
}
