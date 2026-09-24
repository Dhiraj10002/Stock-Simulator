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
	Active         bool    `json:"active"`
}
