package dto

type MentorRequest struct {
	Question string `json:"question" binding:"required,min=5,max=2000"`
}

type MentorResponse struct {
	Answer string `json:"answer"`
}

type BehavioralFlag struct {
	Type        string `json:"type"` // "POSITIVE", "WARNING", "CRITICAL"
	Title       string `json:"title"`
	Description string `json:"description"`
}

type CritiqueMetrics struct {
	WinRate                float64 `json:"win_rate"`
	ConcentrationRisk      string  `json:"concentration_risk"` // "LOW", "MODERATE", "HIGH"
	LeverageRisk           string  `json:"leverage_risk"`      // "SAFE", "ELEVATED", "HIGH"
	RevengeTradingDetected bool    `json:"revenge_trading_detected"`
	LimitOrderUsagePct     float64 `json:"limit_order_usage_pct"`
	TotalTradesEvaluated   int     `json:"total_trades_evaluated"`
}

type TradeCritiqueResponse struct {
	DisciplineScore int              `json:"discipline_score"` // 0 to 100
	RiskRating      string           `json:"risk_rating"`      // "EXCELLENT", "MODERATE", "HIGH_RISK"
	Metrics         CritiqueMetrics  `json:"metrics"`
	BehavioralFlags []BehavioralFlag `json:"behavioral_flags"`
	Critique        string           `json:"critique"`
}

type PreTradeCheckRequest struct {
	Symbol     string `json:"symbol" binding:"required"`
	Side       string `json:"side" binding:"required,oneof=BUY SELL"`
	Product    string `json:"product" binding:"required,oneof=DELIVERY INTRADAY FNO"`
	Type       string `json:"type" binding:"required,oneof=MARKET LIMIT SL SL-M"`
	Quantity   int64  `json:"quantity" binding:"required,gt=0"`
	PricePaise int64  `json:"price_paise" binding:"required,gt=0"`
}

type PreTradeCheckResponse struct {
	RiskLevel              string   `json:"risk_level"` // "SAFE", "MODERATE", "HIGH_RISK"
	RequiredMarginPaise    int64    `json:"required_margin_paise"`
	AvailableBalancePaise  int64    `json:"available_balance_paise"`
	MarginImpactPct        float64  `json:"margin_impact_pct"`
	ConcentrationImpactPct float64  `json:"concentration_impact_pct"`
	Warnings               []string `json:"warnings"`
	Advice                 string   `json:"advice"`
}

