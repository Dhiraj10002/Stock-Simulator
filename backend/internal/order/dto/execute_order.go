package dto

type ExecuteOrderRequest struct {
	ExecutionPricePaise int64 `json:"execution_price_paise" binding:"gte=0"`
}
