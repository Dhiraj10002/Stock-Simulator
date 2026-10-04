package model

import (
	"time"

	"github.com/google/uuid"
)

type WatchlistItem struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UUID      uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();uniqueIndex" json:"uuid"`
	UserUUID  uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_watchlist_user_symbol,priority:1" json:"user_uuid"`
	Symbol    string    `gorm:"size:80;not null;uniqueIndex:idx_watchlist_user_symbol,priority:2" json:"symbol"`
	CreatedAt time.Time `json:"created_at"`
}
