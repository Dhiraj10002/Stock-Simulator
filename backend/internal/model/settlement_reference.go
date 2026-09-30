package model

import "time"

// SettlementReference is the latest sourced closing-window observation for a
// symbol/session/mode. It is a paper settlement reference, not an official
// exchange settlement price. Redis loss must not erase it.
type SettlementReference struct {
	Symbol      string    `gorm:"primaryKey;size:80"`
	SessionDate string    `gorm:"primaryKey;size:10"`
	FeedMode    string    `gorm:"primaryKey;size:16"`
	Source      string    `gorm:"size:40;not null"`
	PricePaise  int64     `gorm:"not null"`
	ObservedAt  time.Time `gorm:"not null"`
}
