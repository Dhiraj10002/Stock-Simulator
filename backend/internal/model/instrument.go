package model

import (
	"gorm.io/gorm"
	"time"
)

// Instrument is the authoritative canonical instrument record. Token IDs
// are only unique within an exchange segment, so both columns form the
// provider identity used by the market-data worker.
type Instrument struct {
	ID               uint      `gorm:"primaryKey" json:"id"`
	Token            string    `gorm:"size:32;not null;index:idx_instruments_token_exchange,priority:1" json:"token"`
	Symbol           string    `gorm:"size:80;not null;index;uniqueIndex:idx_instruments_contract,priority:1" json:"symbol"`
	DisplaySymbol    string    `gorm:"column:display_symbol;size:120;index" json:"display_symbol"`
	Exchange         string    `gorm:"column:exchange;size:16;index" json:"exchange"`
	Name             string    `gorm:"size:160;not null;index" json:"name"`
	Underlying       string    `gorm:"column:underlying;size:80;index;index:idx_instruments_underlying_expiry,priority:1" json:"underlying"`
	UnderlyingSymbol string    `gorm:"column:underlying_symbol;size:80;index" json:"underlying_symbol,omitempty"`
	Expiry           string    `gorm:"size:32;index;index:idx_instruments_underlying_expiry,priority:2" json:"expiry"`
	Strike           string    `gorm:"size:32" json:"strike"`
	OptionType       string    `gorm:"column:option_type;size:8" json:"option_type"`
	LotSize          int64     `gorm:"column:lot_size;not null;default:1" json:"lot_size"`
	InstrumentType   string    `gorm:"column:instrument_type;size:40;index" json:"instrument_type"`
	ExchangeSegment  string    `gorm:"column:exchange_segment;size:16;not null;index:idx_instruments_token_exchange,priority:2;index;index:idx_instruments_seg_active,priority:1;uniqueIndex:idx_instruments_contract,priority:2" json:"exchange_segment"`
	TickSize         string    `gorm:"column:tick_size;size:32;default:'0.05'" json:"tick_size"`
	Active           bool      `gorm:"column:active;not null;default:true;index;index:idx_instruments_seg_active,priority:2" json:"active"`
	SnapshotVersion  string    `gorm:"column:snapshot_version;size:64;index;index:idx_instruments_version_tradable,priority:1" json:"snapshot_version,omitempty"`
	IsTradable       bool      `gorm:"column:is_tradable;not null;default:true;index;index:idx_instruments_version_tradable,priority:2" json:"is_tradable"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// UpgradeInstrumentTokenIndex removes only the obsolete uniqueness constraint.
func UpgradeInstrumentTokenIndex(db *gorm.DB) error {
	if !db.Migrator().HasTable(&Instrument{}) {
		return nil
	}
	indexes, err := db.Migrator().GetIndexes(&Instrument{})
	if err != nil {
		return err
	}
	for _, index := range indexes {
		if index.Name() == "idx_instruments_token_exchange" {
			unique, known := index.Unique()
			if known && unique {
				return DropIndexInTableSchema(db, "instruments", index.Name())
			}
		}
	}
	return nil
}
