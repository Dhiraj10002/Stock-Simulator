package model

import "time"

// Instrument is an entry from Angel One's daily instrument master. Token IDs
// are only unique within an exchange segment, so both columns form the
// provider identity used by the market-data worker.
type Instrument struct {
	ID              uint   `gorm:"primaryKey"`
	Token           string `gorm:"size:32;not null;uniqueIndex:idx_instruments_token_exchange,priority:1"`
	Symbol          string `gorm:"size:80;not null;index"`
	Name            string `gorm:"size:160;not null;index"`
	Expiry          string `gorm:"size:32"`
	Strike          string `gorm:"size:32"`
	LotSize         int64  `gorm:"not null;default:0"`
	InstrumentType  string `gorm:"size:40"`
	ExchangeSegment string `gorm:"column:exchange_segment;size:16;not null;uniqueIndex:idx_instruments_token_exchange,priority:2;index"`
	TickSize        string `gorm:"size:32"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}
