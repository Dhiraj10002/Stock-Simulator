package dto

type OptionContract struct {
	Symbol           string  `json:"symbol"`
	OptionType       string  `json:"option_type"` // CE or PE
	StrikePricePaise int64   `json:"strike_price_paise"`
	LTPPaise         int64   `json:"ltp_paise"`
	OpenInterest     int64   `json:"open_interest"`
	IV               float64 `json:"iv"`
	Delta            float64 `json:"delta"`
	Gamma            float64 `json:"gamma"`
	Theta            float64 `json:"theta"`
	Vega             float64 `json:"vega"`
	LotSize          int64   `json:"lot_size"`
}

type StrikeRow struct {
	StrikePricePaise int64          `json:"strike_price_paise"`
	IsATM            bool           `json:"is_atm"`
	Call             OptionContract `json:"call"`
	Put              OptionContract `json:"put"`
}

type OptionChainResponse struct {
	UnderlyingSymbol string      `json:"underlying_symbol"`
	SpotPricePaise   int64       `json:"spot_price_paise"`
	ExpiryDate       string      `json:"expiry_date"`
	TotalCallOI      int64       `json:"total_call_oi"`
	TotalPutOI       int64       `json:"total_put_oi"`
	PutCallRatio     float64     `json:"put_call_ratio"`
	LotSize          int64       `json:"lot_size"`
	Strikes          []StrikeRow `json:"strikes"`
}
