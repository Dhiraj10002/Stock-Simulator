package model

import (
	"time"

	"github.com/google/uuid"
)

type Trade struct {
	ID         uint      `gorm:"primaryKey"`
	UUID       uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	OrderUUID  uuid.UUID `gorm:"type:uuid;index;not null"`
	UserUUID   uuid.UUID `gorm:"type:uuid;index;not null"`
	Symbol     string    `gorm:"size:30;index;not null"`
	Side       string    `gorm:"size:10;not null"`
	Quantity   int64     `gorm:"not null"`
	PricePaise int64     `gorm:"not null"`
	TotalPaise int64     `gorm:"not null"`
	ExecutedAt time.Time
}
