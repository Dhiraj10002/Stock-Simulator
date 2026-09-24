package model

import "time"

// Instrument is the authoritative canonical instrument record. Token IDs
// are only unique within an exchange segment, so both columns form the
// provider identity used by the market-data worker.
type Instrument struct {
	ID               uint      `gorm:"primaryKey" json:"id"`
	Token            string    `gorm:"size:32;not null;uniqueIndex:idx_instruments_token_exchange,priority:1" json:"token"`
	Symbol           string    `gorm:"size:80;not null;index" json:"symbol"`
	DisplaySymbol    string    `gorm:"column:display_symbol;size:120;index" json:"display_symbol"`
	Exchange         string    `gorm:"column:exchange;size:16;index" json:"exchange"`
	Name             string    `gorm:"size:160;not null;index" json:"name"`
	Underlying       string    `gorm:"column:underlying;size:80;index" json:"underlying"`
	UnderlyingSymbol string    `gorm:"column:underlying_symbol;size:80;index" json:"underlying_symbol,omitempty"`
	Expiry           string    `gorm:"size:32" json:"expiry"`
	Strike           string    `gorm:"size:32" json:"strike"`
	OptionType       string    `gorm:"column:option_type;size:8" json:"option_type"`
	LotSize          int64     `gorm:"column:lot_size;not null;default:1" json:"lot_size"`
	InstrumentType   string    `gorm:"column:instrument_type;size:40" json:"instrument_type"`
	ExchangeSegment  string    `gorm:"column:exchange_segment;size:16;not null;uniqueIndex:idx_instruments_token_exchange,priority:2;index" json:"exchange_segment"`
	TickSize         string    `gorm:"column:tick_size;size:32;default:'0.05'" json:"tick_size"`
	Active           bool      `gorm:"column:active;not null;default:true" json:"active"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}
