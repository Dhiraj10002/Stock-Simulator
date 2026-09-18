package dto

type TradeResponse struct {
	UUID             string `json:"uuid"`
	OrderUUID        string `json:"order_uuid"`
	Symbol           string `json:"symbol"`
	Side             string `json:"side"`
	Product          string `json:"product"`
	Quantity         int64  `json:"quantity"`
	PricePaise       int64  `json:"price_paise"`
	TotalPaise       int64  `json:"total_paise"`
	RealizedPnlPaise int64  `json:"realized_pnl_paise"`
	Tag              string `json:"tag"`
	Notes            string `json:"notes"`
	ExecutedAt       string `json:"executed_at"`
}

type UpdateJournalRequest struct {
	Tag   string `json:"tag"`
	Notes string `json:"notes"`
}
