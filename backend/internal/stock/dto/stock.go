package dto

type StockResponse struct {
	Token           string `json:"token"`
	Symbol          string `json:"symbol"`
	Name            string `json:"name"`
	Expiry          string `json:"expiry"`
	Strike          string `json:"strike"`
	LotSize         int64  `json:"lot_size"`
	InstrumentType  string `json:"instrument_type"`
	ExchangeSegment string `json:"exchange_segment"`
	TickSize        string `json:"tick_size"`
}
