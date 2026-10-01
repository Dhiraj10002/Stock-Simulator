package dto

// InstrumentResponse defines the authoritative canonical identity for every instrument.
type InstrumentResponse struct {
	ID             uint    `json:"id"`
	Symbol         string  `json:"symbol"`
	DisplaySymbol  string  `json:"display_symbol"`
	Exchange       string  `json:"exchange"`
	Token          string  `json:"token"`
	InstrumentType string  `json:"instrument_type"`
	Underlying     string  `json:"underlying"`
	Expiry         string  `json:"expiry"`
	Strike         float64 `json:"strike"`
	OptionType     string  `json:"option_type"`
	LotSize        int64   `json:"lot_size"`
	TickSize       float64 `json:"tick_size"`
	Active          bool    `json:"active"`
	IsTradable      bool    `json:"is_tradable"`
	SnapshotVersion string  `json:"snapshot_version,omitempty"`
}

// SnapshotResponse exposes metadata for an imported instrument snapshot.
type SnapshotResponse struct {
	ID               uint    `json:"id"`
	Version          string  `json:"version"`
	Source           string  `json:"source"`
	TotalInstruments int     `json:"total_instruments"`
	EquityCount      int     `json:"equity_count"`
	FuturesCount     int     `json:"futures_count"`
	OptionsCount     int     `json:"options_count"`
	IndexCount       int     `json:"index_count"`
	Status           string  `json:"status"`
	ValidationErrors string  `json:"validation_errors,omitempty"`
	ActivatedAt      *string `json:"activated_at,omitempty"`
	CreatedAt        string  `json:"created_at"`
}
