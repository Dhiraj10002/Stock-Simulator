package dto

// MarketMoverItem represents a ranked equity instrument in the market movers aggregation.
type MarketMoverItem struct {
	Symbol        string  `json:"symbol"`
	Name          string  `json:"name,omitempty"`
	PricePaise    int64   `json:"price_paise"`
	ChangePaise   int64   `json:"change_paise"`
	ChangePercent float64 `json:"change_percent"`
	Volume        int64   `json:"volume"`
	Turnover      float64 `json:"turnover,omitempty"` // in INR (price * volume)
	TrendingScore float64 `json:"trending_score,omitempty"`
	Exchange      string  `json:"exchange,omitempty"`
	Source        string  `json:"source"`
	UpdatedAt     string  `json:"updated_at"`
}

// MarketMoversResponse contains dynamic aggregations for top market movers.
type MarketMoversResponse struct {
	Gainers    []MarketMoverItem `json:"gainers"`
	Losers     []MarketMoverItem `json:"losers"`
	MostTraded []MarketMoverItem `json:"most_traded"`
	Trending   []MarketMoverItem `json:"trending"`
	UpdatedAt  string            `json:"updated_at"`
}

// MarketBreadthResponse contains aggregate market advance/decline distribution metrics.
type MarketBreadthResponse struct {
	Advances            int     `json:"advances"`
	Declines            int     `json:"declines"`
	Unchanged           int     `json:"unchanged"`
	Total               int     `json:"total"`
	AdvanceDeclineRatio float64 `json:"advance_decline_ratio"`
	AdvancePercent      float64 `json:"advance_percent"`
	UpdatedAt           string  `json:"updated_at"`
}
