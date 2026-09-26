package model

import (
	"time"

	"github.com/google/uuid"
)

// RefreshSession stores only a hash of the refresh token so the token itself
// is never persisted in PostgreSQL.
type RefreshSession struct {
	ID        uint       `gorm:"primaryKey"`
	UUID      uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	UserUUID  uuid.UUID  `gorm:"type:uuid;index;not null"`
	TokenHash string     `gorm:"size:64;uniqueIndex;not null" json:"-"`
	JTI       string     `gorm:"size:64;index" json:"-"`
	ExpiresAt time.Time  `gorm:"not null"`
	RevokedAt *time.Time `gorm:"index"`
	CreatedAt time.Time
}
