package model

import (
	"time"

	"github.com/google/uuid"
)

// RiskEvent records an unresolved automated action. It deliberately does not
// imply a fill: callers can surface it to an operator or a future UI.
type RiskEvent struct {
	ID        uint      `gorm:"primaryKey"`
	UUID      uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	UserUUID  uuid.UUID `gorm:"type:uuid;index;not null"`
	Symbol    string    `gorm:"size:80;index;not null"`
	Product   string    `gorm:"size:15;index;not null"`
	EventType string    `gorm:"size:40;index;not null"`
	Status    string    `gorm:"size:20;index;not null"`
	Message   string    `gorm:"size:500;not null"`
	CreatedAt time.Time
}
