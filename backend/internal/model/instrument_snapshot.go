package model

import "time"

const (
	SnapshotStatusStaged  = "STAGED"
	SnapshotStatusActive  = "ACTIVE"
	SnapshotStatusRetired = "RETIRED"
	SnapshotStatusFailed  = "FAILED"
)

// InstrumentSnapshot records the versioned metadata of an imported instrument master.
// It enables staged ingestion, duplicate-token validation, and atomic version switching.
type InstrumentSnapshot struct {
	Payload          string     `gorm:"type:text" json:"-"`
	Partial          bool       `gorm:"not null;default:false" json:"partial"`
	ID               uint       `gorm:"primaryKey" json:"id"`
	Version          string     `gorm:"size:64;not null;uniqueIndex" json:"version"`
	Source           string     `gorm:"size:64;not null;default:'angelone_openapi'" json:"source"`
	TotalInstruments int        `gorm:"not null;default:0" json:"total_instruments"`
	EquityCount      int        `gorm:"not null;default:0" json:"equity_count"`
	FuturesCount     int        `gorm:"not null;default:0" json:"futures_count"`
	OptionsCount     int        `gorm:"not null;default:0" json:"options_count"`
	IndexCount       int        `gorm:"not null;default:0" json:"index_count"`
	Status           string     `gorm:"size:32;not null;default:'STAGED';index" json:"status"`
	ValidationErrors string     `gorm:"type:text" json:"validation_errors,omitempty"`
	ActivatedAt      *time.Time `json:"activated_at,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}
