package dto

type StockResponse struct {
	Token           string  `json:"token"`
	Symbol          string  `json:"symbol"`
	DisplayName     string  `json:"display_name,omitempty"`
	Name            string  `json:"name"`
	Expiry          string  `json:"expiry"`
	Strike          string  `json:"strike"`
	OptionType      string  `json:"option_type,omitempty"`
	LotSize         int64   `json:"lot_size"`
	InstrumentType  string  `json:"instrument_type"`
	ExchangeSegment string  `json:"exchange_segment"`
	TickSize        string  `json:"tick_size"`
	PricePaise      int64   `json:"price_paise,omitempty"`
	ChangePercent   float64 `json:"change_percent,omitempty"`
}
