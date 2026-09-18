package dto

type RiskOverviewResponse struct {
	AccountEquityPaise      int64   `json:"account_equity_paise"`
	CashBalancePaise        int64   `json:"cash_balance_paise"`
	BlockedPaise            int64   `json:"blocked_paise"`
	AvailableBalancePaise   int64   `json:"available_balance_paise"`
	UnrealizedPnlPaise      int64   `json:"unrealized_pnl_paise"`
	MarginUtilizationPct    float64 `json:"margin_utilization_pct"`
	Status                  string  `json:"status"` // HEALTHY, WARNING, MARGIN_CALL, CRITICAL
	Message                 string  `json:"message"`
	IntradayPositionsCount  int     `json:"intraday_positions_count"`
	DeliveryPositionsCount  int     `json:"delivery_positions_count"`
	ActiveOrdersCount       int     `json:"active_orders_count"`
}
