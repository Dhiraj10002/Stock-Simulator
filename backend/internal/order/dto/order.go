package dto

type CreateOrderRequest struct {
	Symbol     string `json:"symbol" binding:"required"`
	Side       string `json:"side" binding:"required,oneof=BUY SELL"`
	Type       string `json:"type" binding:"required,oneof=MARKET LIMIT"`
	Product    string `json:"product" binding:"required,oneof=INTRADAY DELIVERY FNO"`
	Quantity   int64  `json:"quantity" binding:"required,gt=0"`
	PricePaise int64  `json:"price_paise"`
}

type OrderResponse struct {
	UUID               string `json:"uuid"`
	Symbol             string `json:"symbol"`
	Side               string `json:"side"`
	Type               string `json:"type"`
	Product            string `json:"product"`
	Quantity           int64  `json:"quantity"`
	PricePaise         int64  `json:"price_paise"`
	ExecutedPricePaise int64  `json:"executed_price_paise"`
	ReservedPaise      int64  `json:"reserved_paise"`
	Status             string `json:"status"`
}
