package model

import (
	"time"

	"github.com/google/uuid"
)

type WatchlistItem struct {
	ID        uint      `gorm:"primaryKey"`
	UUID      uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex"`
	UserUUID  uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_watchlist_user_symbol,priority:1"`
	Symbol    string    `gorm:"size:80;not null;uniqueIndex:idx_watchlist_user_symbol,priority:2"`
	CreatedAt time.Time
}
