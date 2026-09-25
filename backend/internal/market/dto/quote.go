package dto

type QuoteResponse struct {
	Symbol            string  `json:"symbol"`
	PricePaise        int64   `json:"price_paise"`
	ChangePaise       int64   `json:"change_paise,omitempty"`
	ChangePercent     float64 `json:"change_percent,omitempty"`
	LowerCircuitPaise int64   `json:"lower_circuit_paise,omitempty"`
	UpperCircuitPaise int64   `json:"upper_circuit_paise,omitempty"`
	Volume            int64   `json:"volume,omitempty"`
	Source            string  `json:"source"`
	UpdatedAt         string  `json:"updated_at"`
}

type CandleResponse struct {
	Timestamp  int64 `json:"timestamp"`
	OpenPaise  int64 `json:"open_paise"`
	HighPaise  int64 `json:"high_paise"`
	LowPaise   int64 `json:"low_paise"`
	ClosePaise int64 `json:"close_paise"`
	Volume     int64 `json:"volume"`
}
