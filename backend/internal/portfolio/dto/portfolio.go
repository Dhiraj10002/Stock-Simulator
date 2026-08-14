package dto

type PositionResponse struct {
	UUID               string `json:"uuid"`
	Symbol             string `json:"symbol"`
	Quantity           int64  `json:"quantity"`
	AveragePricePaise  int64  `json:"average_price_paise"`
	CurrentPricePaise  int64  `json:"current_price_paise"`
	InvestedValuePaise int64  `json:"invested_value_paise"`
	CurrentValuePaise  int64  `json:"current_value_paise"`
	UnrealizedPnlPaise int64  `json:"unrealized_pnl_paise"`
}

type PortfolioResponse struct {
	Positions          []PositionResponse `json:"positions"`
	InvestedValuePaise int64              `json:"invested_value_paise"`
	CurrentValuePaise  int64              `json:"current_value_paise"`
	UnrealizedPnlPaise int64              `json:"unrealized_pnl_paise"`
}
