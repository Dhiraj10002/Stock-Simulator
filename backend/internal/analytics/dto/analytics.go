package dto

type PerformanceOverviewResponse struct {
	TotalTrades          int     `json:"total_trades"`
	WinningTrades        int     `json:"winning_trades"`
	LosingTrades         int     `json:"losing_trades"`
	BreakEvenTrades      int     `json:"break_even_trades"`
	WinRatePct           float64 `json:"win_rate_pct"`
	NetRealizedPnlPaise  int64   `json:"net_realized_pnl_paise"`
	GrossProfitPaise     int64   `json:"gross_profit_paise"`
	GrossLossPaise       int64   `json:"gross_loss_paise"`
	ProfitFactor         float64 `json:"profit_factor"`
	AverageWinPaise      int64   `json:"average_win_paise"`
	AverageLossPaise     int64   `json:"average_loss_paise"`
	WinLossRatio         float64 `json:"win_loss_ratio"`
	LargestWinPaise      int64   `json:"largest_win_paise"`
	LargestWinSymbol     string  `json:"largest_win_symbol"`
	LargestLossPaise     int64   `json:"largest_loss_paise"`
	LargestLossSymbol    string  `json:"largest_loss_symbol"`
}

type DailyPnlDay struct {
	Date             string `json:"date"` // "YYYY-MM-DD"
	RealizedPnlPaise int64  `json:"realized_pnl_paise"`
	TradesCount      int    `json:"trades_count"`
	WinTrades        int    `json:"win_trades"`
	LossTrades       int    `json:"loss_trades"`
}

type PnlCalendarResponse struct {
	Month               string        `json:"month"` // "YYYY-MM"
	Days                []DailyPnlDay `json:"days"`
	MonthTotalPnlPaise  int64         `json:"month_total_pnl_paise"`
	ProfitableDaysCount int           `json:"profitable_days_count"`
	LossDaysCount       int           `json:"loss_days_count"`
}
