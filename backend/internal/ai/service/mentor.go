package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/ai/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/config"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	"github.com/google/uuid"
)

const geminiGenerateContentURL = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent"

type MentorService struct {
	apiKey string
	model  string
	client *http.Client
}

type geminiRequest struct {
	SystemInstruction geminiContent   `json:"system_instruction"`
	Contents          []geminiContent `json:"contents"`
	GenerationConfig  struct {
		MaxOutputTokens int `json:"maxOutputTokens"`
	} `json:"generationConfig"`
}

type geminiContent struct {
	Role  string `json:"role,omitempty"`
	Parts []struct {
		Text string `json:"text"`
	} `json:"parts"`
}

type geminiResponse struct {
	Candidates []struct {
		Content geminiContent `json:"content"`
	} `json:"candidates"`
}

func content(text string) geminiContent {
	item := geminiContent{}
	item.Parts = append(item.Parts, struct {
		Text string `json:"text"`
	}{Text: text})
	return item
}

func New(cfg *config.Config) *MentorService {
	return &MentorService{apiKey: cfg.GeminiAPIKey, model: cfg.GeminiModel, client: &http.Client{Timeout: 30 * time.Second}}
}

func (s *MentorService) Analyze(ctx context.Context, userID, question string) (string, error) {
	uCtx := s.fetchUserAccountContext(userID)
	if strings.TrimSpace(s.apiKey) == "" {
		return s.generateRuleBasedAnswerWithContext(userID, question, uCtx), nil
	}

	payload := geminiRequest{
		SystemInstruction: content("You are the Trade-Aware AI Mentor inside an institutional stock simulator for Indian financial markets (NSE/BSE). Explain trading concepts, market mechanics, order types, and risk management clearly. Contextualize answers using the user's active holdings, margin utilization, and recent orders when applicable. Never promise returns, predict future prices with certainty, or provide SEBI-registered financial advice. Emphasize disciplined position sizing (1-2% risk per trade), risk-reward asymmetry, hard stop-losses, and capital preservation. Always end with a brief reminder that this is educational simulator analysis, not financial advice."),
		Contents: []geminiContent{
			{Role: "user", Parts: content(fmt.Sprintf("%s\n\nTrader's Question:\n%s", uCtx.FullContextString, question)).Parts},
		},
	}
	payload.GenerationConfig.MaxOutputTokens = 700
	body, err := json.Marshal(payload)
	if err != nil {
		return s.generateRuleBasedAnswerWithContext(userID, question, uCtx), nil
	}
	url := fmt.Sprintf(geminiGenerateContentURL, s.model)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return s.generateRuleBasedAnswerWithContext(userID, question, uCtx), nil
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", s.apiKey)
	response, err := s.client.Do(req)
	if err != nil {
		return s.generateRuleBasedAnswerWithContext(userID, question, uCtx), nil
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return s.generateRuleBasedAnswerWithContext(userID, question, uCtx), nil
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return s.generateRuleBasedAnswerWithContext(userID, question, uCtx), nil
	}
	var result geminiResponse
	if err := json.Unmarshal(responseBody, &result); err != nil {
		return s.generateRuleBasedAnswerWithContext(userID, question, uCtx), nil
	}
	for _, candidate := range result.Candidates {
		for _, part := range candidate.Content.Parts {
			if strings.TrimSpace(part.Text) != "" {
				return part.Text, nil
			}
		}
	}
	return s.generateRuleBasedAnswerWithContext(userID, question, uCtx), nil
}

func (s *MentorService) PreTradeCheck(ctx context.Context, userID string, req dto.PreTradeCheckRequest) (*dto.PreTradeCheckResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID")
	}

	var wallet model.Wallet
	var positions []model.Position
	db := database.GetDB()
	if db != nil {
		_ = db.Where("user_uuid = ?", userUUID).First(&wallet).Error
		_ = db.Where("user_uuid = ? AND quantity <> 0", userUUID).Find(&positions).Error
	}

	availablePaise := wallet.AvailableBalancePaise()
	turnoverPaise := req.Quantity * req.PricePaise

	// Calculate required margin
	var requiredMarginPaise int64
	switch req.Product {
	case "INTRADAY":
		requiredMarginPaise = (turnoverPaise + 4) / 5 // 20% margin (5x leverage)
	case "FNO":
		requiredMarginPaise = (turnoverPaise + 4) / 5 // 20% margin
	default: // "DELIVERY"
		requiredMarginPaise = turnoverPaise // 100%
	}

	// Calculate projected margin impact
	marginImpactPct := 0.0
	if availablePaise > 0 {
		marginImpactPct = (float64(requiredMarginPaise) / float64(availablePaise)) * 100
	} else if requiredMarginPaise > 0 {
		marginImpactPct = 100.0
	}

	// Concentration check
	var totalPortfolioValue int64 = requiredMarginPaise
	var symbolExistingValue int64 = 0
	for _, p := range positions {
		v := p.CurrentValuePaise()
		if v == 0 {
			v = p.AveragePricePaise * mathAbs(p.Quantity)
		} else {
			v = mathAbs(v)
		}
		totalPortfolioValue += v
		if p.Symbol == req.Symbol {
			symbolExistingValue += v
		}
	}
	projectedSymbolValue := symbolExistingValue + requiredMarginPaise
	concentrationImpactPct := 0.0
	if totalPortfolioValue > 0 {
		concentrationImpactPct = (float64(projectedSymbolValue) / float64(totalPortfolioValue)) * 100
	}

	var warnings []string
	riskLevel := "SAFE"

	// 1. Margin & Capital Warnings
	if requiredMarginPaise > availablePaise && !(req.Side == "SELL" && req.Product == "DELIVERY") {
		riskLevel = "HIGH_RISK"
		deficitRupees := float64(requiredMarginPaise-availablePaise) / 100.0
		warnings = append(warnings, fmt.Sprintf("Insufficient available margin: Deficit of ₹%.2f. Order will be rejected.", deficitRupees))
	} else if marginImpactPct >= 50.0 {
		riskLevel = "HIGH_RISK"
		warnings = append(warnings, fmt.Sprintf("Excessive Margin Commitment: Order consumes %.1f%% (>50%%) of total available cash balance.", marginImpactPct))
	} else if marginImpactPct >= 25.0 {
		if riskLevel == "SAFE" {
			riskLevel = "MODERATE"
		}
		warnings = append(warnings, fmt.Sprintf("Elevated Margin Commitment: Order utilizes %.1f%% (>25%%) of available trading balance.", marginImpactPct))
	}

	// 2. Slippage Warning on Market Orders
	if req.Type == "MARKET" && req.Quantity > 50 {
		if riskLevel == "SAFE" {
			riskLevel = "MODERATE"
		}
		warnings = append(warnings, fmt.Sprintf("Exchange Slippage Alert: Placing a MARKET order for %d units may experience 2–6 bps of execution slippage against the order book.", req.Quantity))
	}

	// 3. Concentration Warning
	if concentrationImpactPct > 40.0 {
		riskLevel = "HIGH_RISK"
		warnings = append(warnings, fmt.Sprintf("Severe Concentration: Post-trade exposure to %s will reach %.1f%% of total portfolio equity.", req.Symbol, concentrationImpactPct))
	} else if concentrationImpactPct > 25.0 {
		if riskLevel == "SAFE" {
			riskLevel = "MODERATE"
		}
		warnings = append(warnings, fmt.Sprintf("Moderate Concentration: %s will account for %.1f%% of your active portfolio.", req.Symbol, concentrationImpactPct))
	}

	// 4. Intraday Auto-Squareoff reminder
	if req.Product == "INTRADAY" {
		warnings = append(warnings, "MIS Leverage Notice: Mandatory automated square-off at 15:20 IST applies to this position.")
	}

	// 5. Missing Stop-Loss Warning on Volatile / Derivative Symbols
	isDerivativeOrIntraday := req.Product == "FNO" || req.Product == "INTRADAY" ||
		strings.Contains(req.Symbol, "NIFTY") || strings.Contains(req.Symbol, "BANKNIFTY") ||
		strings.Contains(req.Symbol, "CE") || strings.Contains(req.Symbol, "PE")
	if isDerivativeOrIntraday && req.StopLossPaise <= 0 {
		if riskLevel == "SAFE" {
			riskLevel = "MODERATE"
		}
		warnings = append(warnings, "Missing Stop-Loss Protection: Derivative & intraday positions carry high gamma and gap risk. Trading without an active Stop-Loss exposes capital to unbounded drawdowns.")
	}

	// 6. Risk-Reward Ratio Calculation & Feasibility Check
	var riskRewardRatio float64 = 0.0
	circuitBreached := false
	unrealisticTarget := false

	if req.StopLossPaise > 0 && req.TargetPaise > 0 {
		var riskPaise, rewardPaise int64
		if req.Side == "BUY" {
			riskPaise = req.PricePaise - req.StopLossPaise
			rewardPaise = req.TargetPaise - req.PricePaise
		} else {
			riskPaise = req.StopLossPaise - req.PricePaise
			rewardPaise = req.PricePaise - req.TargetPaise
		}

		// Direction validation
		if riskPaise <= 0 {
			warnings = append(warnings, fmt.Sprintf("Invalid Stop-Loss Order: For %s orders, stop-loss price must be on the defensive side of entry price.", req.Side))
		}
		if rewardPaise <= 0 {
			warnings = append(warnings, fmt.Sprintf("Invalid Target Order: For %s orders, profit target must be on the favorable side of entry price.", req.Side))
		}

		if riskPaise > 0 && rewardPaise > 0 {
			riskRewardRatio = float64(rewardPaise) / float64(riskPaise)

			// Calculate percentage movements
			targetMovePct := (float64(rewardPaise) / float64(req.PricePaise)) * 100.0
			stopMovePct := (float64(riskPaise) / float64(req.PricePaise)) * 100.0

			// Circuit limit checks
			if req.Product == "INTRADAY" && targetMovePct > 20.0 {
				circuitBreached = true
				unrealisticTarget = true
				warnings = append(warnings, fmt.Sprintf("Circuit Limit Breach (+%.1f%%): Target exceeds maximum NSE daily circuit band (10%%–20%%). Single-day move to ₹%.2f is impossible under exchange price collars.", targetMovePct, float64(req.TargetPaise)/100.0))
			} else if req.Product == "INTRADAY" && targetMovePct > 8.0 {
				unrealisticTarget = true
				warnings = append(warnings, fmt.Sprintf("Aggressive Intraday Target (+%.1f%%): Exceeds normal daily ATR volatility (1.2%%–2.5%%). Statistically rare for single-session execution.", targetMovePct))
			} else if targetMovePct > 40.0 {
				unrealisticTarget = true
				warnings = append(warnings, fmt.Sprintf("Unrealistic Short-Term Target (+%.1f%%): Far exceeds standard swing trading horizons without multi-quarter positioning.", targetMovePct))
			}

			// Wishful thinking bias / Extreme R:R trap
			if circuitBreached || (riskRewardRatio > 8.0 && unrealisticTarget) {
				warnings = append(warnings, fmt.Sprintf("Wishful Thinking Bias (1:%.1f): Extreme asymmetric target against a narrow %.2f%% stop-loss gives near-zero statistical probability. Market noise will almost certainly trigger the stop-loss first.", riskRewardRatio, stopMovePct))
			} else if riskRewardRatio < 1.0 {
				if riskLevel == "SAFE" {
					riskLevel = "MODERATE"
				}
				warnings = append(warnings, fmt.Sprintf("Sub-optimal Risk-to-Reward Ratio (1:%.2f): Potential loss outweighs projected target gain. Target at least 1:1.50.", riskRewardRatio))
			} else if riskRewardRatio >= 1.8 && riskRewardRatio <= 4.0 {
				warnings = append(warnings, fmt.Sprintf("Favorable Asymmetric R:R (1:%.2f): Balanced reward-to-risk asymmetry aligned with realistic price moves.", riskRewardRatio))
			}
		}
	}

	// 7. Safety / Discipline Score Calculation (0 - 100)
	score := 100
	if requiredMarginPaise > availablePaise {
		score -= 50
	} else if marginImpactPct >= 75.0 {
		score -= 35
	} else if marginImpactPct >= 50.0 {
		score -= 25
	} else if marginImpactPct >= 25.0 {
		score -= 15
	}

	if concentrationImpactPct > 40.0 {
		score -= 20
	} else if concentrationImpactPct > 25.0 {
		score -= 10
	}

	if isDerivativeOrIntraday && req.StopLossPaise <= 0 {
		score -= 15
	}

	if circuitBreached {
		score = 25
		riskLevel = "HIGH_RISK"
	} else if unrealisticTarget {
		score -= 35
		if riskLevel == "SAFE" {
			riskLevel = "MODERATE"
		}
	} else if riskRewardRatio > 0 && riskRewardRatio < 1.0 {
		score -= 15
	} else if riskRewardRatio >= 1.5 && riskRewardRatio <= 4.5 {
		score += 5
	}

	if req.Type == "MARKET" && req.Quantity > 50 {
		score -= 5
	}

	if score < 10 {
		score = 10
	} else if score > 100 {
		score = 100
	}

	// 8. Synthesis Advice
	advice := "Systematic execution: Parameters fall within normal institutional risk tolerance."
	if circuitBreached {
		advice = fmt.Sprintf("Critical Risk: Intraday target of ₹%.2f on %s breaches NSE daily circuit limits (10%%–20%%). Normal large-cap daily range is 1.2%%–2.5%%. Recalibrate target to a realistic band for achievable expectancy.", float64(req.TargetPaise)/100.0, req.Symbol)
	} else if riskLevel == "HIGH_RISK" {
		advice = "Exercise caution: High capital commitment, portfolio concentration, or unrealistic parameters detected. Consider reducing quantity or setting a realistic Stop-Loss."
	} else if riskLevel == "MODERATE" {
		if isDerivativeOrIntraday && req.StopLossPaise <= 0 {
			advice = "Protect downside: Set an automated Stop-Loss (e.g. 1.5% below entry) before executing leveraged or derivative trades."
		} else {
			advice = "Balanced setup: Consider using a Limit order to guarantee entry price and minimize spread cost."
		}
	}

	return &dto.PreTradeCheckResponse{
		RiskLevel:              riskLevel,
		RiskScore:              score,
		RequiredMarginPaise:    requiredMarginPaise,
		AvailableBalancePaise:  availablePaise,
		MarginImpactPct:        marginImpactPct,
		ConcentrationImpactPct: concentrationImpactPct,
		RiskRewardRatio:        riskRewardRatio,
		Warnings:               warnings,
		Advice:                 advice,
	}, nil
}

func (s *MentorService) Critique(ctx context.Context, userID string) (*dto.TradeCritiqueResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID")
	}

	var positions []model.Position
	var allPositions []model.Position
	var wallet model.Wallet
	var orders []model.Order

	db := database.GetDB()
	if db != nil {
		_ = db.Where("user_uuid = ?", userUUID).First(&wallet).Error
		_ = db.Where("user_uuid = ? AND quantity <> 0", userUUID).Find(&positions).Error
		_ = db.Where("user_uuid = ?", userUUID).Find(&allPositions).Error
		_ = db.Where("user_uuid = ?", userUUID).Order("created_at DESC").Limit(50).Find(&orders).Error
	}

	totalTrades := len(orders)
	limitOrders := 0
	for _, o := range orders {
		if o.Type == "LIMIT" {
			limitOrders++
		}
	}

	limitUsagePct := 0.0
	if totalTrades > 0 {
		limitUsagePct = (float64(limitOrders) / float64(totalTrades)) * 100
	}

	// 1. Revenge Trading Detection (3+ orders placed within 5 minutes of each other)
	revengeDetected := false
	if totalTrades >= 3 {
		for i := 0; i <= totalTrades-3; i++ {
			diff := orders[i].CreatedAt.Sub(orders[i+2].CreatedAt)
			if diff >= 0 && diff <= 5*time.Minute {
				revengeDetected = true
				break
			}
		}
	}

	// 2. Concentration Risk Check
	var totalPositionValue int64 = 0
	var maxPositionValue int64 = 0
	var maxSymbol string = ""
	for _, p := range positions {
		val := p.CurrentValuePaise()
		if val == 0 {
			val = p.AveragePricePaise * mathAbs(p.Quantity)
		} else {
			val = mathAbs(val)
		}
		totalPositionValue += val
		if val > maxPositionValue {
			maxPositionValue = val
			maxSymbol = p.Symbol
		}
	}

	concentrationRisk := "LOW"
	if totalPositionValue > 0 {
		ratio := float64(maxPositionValue) / float64(totalPositionValue)
		if ratio > 0.35 {
			concentrationRisk = "HIGH"
		} else if ratio > 0.20 {
			concentrationRisk = "MODERATE"
		}
	}

	// 3. Leverage & Margin Risk Check
	leverageRisk := "SAFE"
	if wallet.CashBalancePaise > 0 {
		marginRatio := float64(wallet.BlockedPaise) / float64(wallet.CashBalancePaise)
		if marginRatio > 0.70 {
			leverageRisk = "HIGH"
		} else if marginRatio > 0.40 {
			leverageRisk = "ELEVATED"
		}
	}

	// 4. Calculate Objective Discipline Score (0 - 100)
	score := 100
	if revengeDetected {
		score -= 25
	}
	if concentrationRisk == "HIGH" {
		score -= 20
	} else if concentrationRisk == "MODERATE" {
		score -= 10
	}
	if leverageRisk == "HIGH" {
		score -= 20
	} else if leverageRisk == "ELEVATED" {
		score -= 10
	}
	if limitUsagePct < 25 && totalTrades >= 4 {
		score -= 15
	}

	// 5. Evaluate Closed Trades Win-Rate and Realized P&L
	var totalClosed int = 0
	var winningTrades int = 0
	var totalRealizedPnlPaise int64 = 0
	for _, p := range allPositions {
		totalRealizedPnlPaise += p.RealizedPnlPaise
		if p.RealizedPnlPaise != 0 {
			totalClosed++
			if p.RealizedPnlPaise > 0 {
				winningTrades++
			}
		}
	}

	winRate := 66.7 // default baseline
	if totalClosed > 0 {
		winRate = (float64(winningTrades) / float64(totalClosed)) * 100.0
		if winRate < 40.0 {
			score -= 10
		} else if winRate >= 70.0 {
			score += 5
		}
	}

	if score < 10 {
		score = 10
	} else if score > 100 {
		score = 100
	}

	riskRating := "EXCELLENT"
	if score < 55 {
		riskRating = "HIGH_RISK"
	} else if score < 80 {
		riskRating = "MODERATE"
	}

	grade := "B"
	if score >= 92 {
		grade = "A+"
	} else if score >= 82 {
		grade = "A"
	} else if score >= 72 {
		grade = "B+"
	} else if score >= 60 {
		grade = "B"
	} else if score >= 45 {
		grade = "C"
	} else if score >= 30 {
		grade = "D"
	} else {
		grade = "F"
	}

	// 6. Behavioral Flags
	var flags []dto.BehavioralFlag
	if revengeDetected {
		flags = append(flags, dto.BehavioralFlag{
			Type:        "CRITICAL",
			Title:       "Rapid Trading Velocity / Revenge Alert",
			Description: "3 or more orders were placed within 5 minutes. Take a step back during volatile periods to avoid emotional impulse trading.",
		})
	}
	if concentrationRisk == "HIGH" {
		flags = append(flags, dto.BehavioralFlag{
			Type:        "WARNING",
			Title:       "High Portfolio Concentration",
			Description: fmt.Sprintf("A single asset (%s) accounts for over 35%% of your open positions. Diversify across uncorrelated sectors to reduce drawdown risk.", maxSymbol),
		})
	}
	if leverageRisk == "HIGH" {
		flags = append(flags, dto.BehavioralFlag{
			Type:        "WARNING",
			Title:       "High Margin Utilization (>70%)",
			Description: "More than 70% of available cash is blocked in intraday or derivatives margins, exposing the portfolio to liquidation risk.",
		})
	}
	if limitUsagePct >= 50 && totalTrades >= 2 {
		flags = append(flags, dto.BehavioralFlag{
			Type:        "POSITIVE",
			Title:       "Disciplined Price Targeting",
			Description: fmt.Sprintf("%.0f%% of your orders used Limit orders, securing controlled execution without paying bid-ask spread slippage.", limitUsagePct),
		})
	}
	if totalClosed > 0 && winRate >= 60.0 {
		flags = append(flags, dto.BehavioralFlag{
			Type:        "POSITIVE",
			Title:       "Positive Expectancy Adherence",
			Description: fmt.Sprintf("Solid closed trade win rate of %.1f%% demonstrates strong risk discipline and exit timing.", winRate),
		})
	}
	if len(flags) == 0 {
		flags = append(flags, dto.BehavioralFlag{
			Type:        "POSITIVE",
			Title:       "Balanced Risk Profile",
			Description: "No reckless or high-risk trading habits detected. Maintain systematic position sizing and predefined risk-reward targets.",
		})
	}

	metrics := dto.CritiqueMetrics{
		WinRate:                winRate,
		ConcentrationRisk:      concentrationRisk,
		LeverageRisk:           leverageRisk,
		RevengeTradingDetected: revengeDetected,
		LimitOrderUsagePct:     limitUsagePct,
		TotalTradesEvaluated:   totalTrades,
		RealizedPnlPaise:       totalRealizedPnlPaise,
	}

	critiqueText := s.buildRuleBasedCritique(score, riskRating, grade, metrics, maxSymbol)

	// If Gemini API is available, optionally synthesize an executive narrative
	if strings.TrimSpace(s.apiKey) != "" {
		uCtx := s.fetchUserAccountContext(userID)
		prompt := fmt.Sprintf("Act as an institutional risk officer. Evaluate this simulated trader:\n"+
			"%s\n"+
			"Trader Grade: %s (Discipline Score: %d/100, Rating: %s)\n"+
			"Win Rate: %.1f%% across %d evaluated trades (Realized P&L: ₹%.2f)\n"+
			"Behavioral Flags: Revenge Trading Detected: %t, Concentration Risk: %s (%s), Margin Leverage Risk: %s, Limit Order Discipline: %.0f%%\n"+
			"Provide a concise 2-to-3 paragraph professional executive critique with actionable recommendations for risk mitigation. Explicitly state that this is an educational simulation critique and not financial advice.",
			uCtx.FullContextString, grade, score, riskRating, winRate, totalTrades, float64(totalRealizedPnlPaise)/100.0,
			revengeDetected, concentrationRisk, maxSymbol, leverageRisk, limitUsagePct)
		llmCritique, err := s.callGemini(ctx, prompt)
		if err == nil && strings.TrimSpace(llmCritique) != "" {
			critiqueText = llmCritique
		}
	}

	return &dto.TradeCritiqueResponse{
		DisciplineScore: score,
		RiskRating:      riskRating,
		Grade:           grade,
		Metrics:         metrics,
		BehavioralFlags: flags,
		Critique:        critiqueText,
	}, nil
}

type UserAccountContext struct {
	AvailableBalancePaise int64
	BlockedPaise          int64
	CashBalancePaise      int64
	MarginUtilizationPct  float64
	Positions             []model.Position
	RecentOrders          []model.Order
	TopSymbol             string
	ConcentrationRatio    float64
	FullContextString     string
}

func (s *MentorService) fetchUserAccountContext(userID string) UserAccountContext {
	ctx := UserAccountContext{
		AvailableBalancePaise: 100000000, // ₹10,00,000 starting cash
		CashBalancePaise:      100000000,
	}

	userUUID, err := uuid.Parse(userID)
	if err != nil {
		ctx.FullContextString = "Account Context: Guest/unauthenticated simulator profile with default ₹10,00,000.00 virtual capital."
		return ctx
	}

	db := database.GetDB()
	if db == nil {
		ctx.FullContextString = "Account Context: Simulator database offline. Default ₹10,00,000.00 cash balance active."
		return ctx
	}

	var wallet model.Wallet
	if err := db.Where("user_uuid = ?", userUUID).First(&wallet).Error; err == nil {
		ctx.CashBalancePaise = wallet.CashBalancePaise
		ctx.BlockedPaise = wallet.BlockedPaise
		ctx.AvailableBalancePaise = wallet.AvailableBalancePaise()
		if wallet.CashBalancePaise > 0 {
			ctx.MarginUtilizationPct = (float64(wallet.BlockedPaise) / float64(wallet.CashBalancePaise)) * 100.0
		}
	}

	var positions []model.Position
	if err := db.Where("user_uuid = ? AND quantity <> 0", userUUID).Order("symbol ASC").Limit(20).Find(&positions).Error; err == nil {
		ctx.Positions = positions
	}

	var orders []model.Order
	if err := db.Where("user_uuid = ?", userUUID).Order("created_at DESC").Limit(10).Find(&orders).Error; err == nil {
		ctx.RecentOrders = orders
	}

	// Calculate top symbol concentration
	var totalVal int64 = 0
	var maxVal int64 = 0
	for _, p := range positions {
		v := p.CurrentValuePaise()
		if v == 0 {
			v = p.AveragePricePaise * mathAbs(p.Quantity)
		} else {
			v = mathAbs(v)
		}
		totalVal += v
		if v > maxVal {
			maxVal = v
			ctx.TopSymbol = p.Symbol
		}
	}
	if totalVal > 0 {
		ctx.ConcentrationRatio = (float64(maxVal) / float64(totalVal)) * 100.0
	}

	// Build human-readable structured context summary for LLM prompt and rule-based engine
	var sb strings.Builder
	sb.WriteString("ACCOUNT PORTFOLIO & RISK CONTEXT:\n")
	sb.WriteString(fmt.Sprintf("- Available Margin: ₹%.2f | Blocked Margin: ₹%.2f (%.1f%% Margin Utilization)\n",
		float64(ctx.AvailableBalancePaise)/100.0, float64(ctx.BlockedPaise)/100.0, ctx.MarginUtilizationPct))

	if len(positions) == 0 {
		sb.WriteString("- Open Positions (0): No active simulator positions (portfolio is 100% liquid cash).\n")
	} else {
		sb.WriteString(fmt.Sprintf("- Open Positions (%d):\n", len(positions)))
		for i, p := range positions {
			if i >= 6 {
				sb.WriteString(fmt.Sprintf("  ... and %d more open positions\n", len(positions)-6))
				break
			}
			side := "LONG"
			if p.Quantity < 0 {
				side = "SHORT"
			}
			unrealizedPnl := p.UnrealizedPnlPaise()
			pnlSign := "+"
			if unrealizedPnl < 0 {
				pnlSign = ""
			}
			sb.WriteString(fmt.Sprintf("  * %s: %s %d Qty (%s) | Avg: ₹%.2f | P&L: %s₹%.2f\n",
				p.Symbol, side, mathAbs(p.Quantity), p.Product, float64(p.AveragePricePaise)/100.0, pnlSign, float64(unrealizedPnl)/100.0))
		}
	}

	if len(orders) == 0 {
		sb.WriteString("- Recent Orders (0): No simulator orders placed yet.\n")
	} else {
		sb.WriteString(fmt.Sprintf("- Recent Orders (%d evaluated):\n", len(orders)))
		for i, o := range orders {
			if i >= 5 {
				break
			}
			sb.WriteString(fmt.Sprintf("  * %s %s %d Qty @ ₹%.2f [%s - %s]\n",
				o.Side, o.Symbol, o.Quantity, float64(o.PricePaise)/100.0, o.Type, o.Status))
		}
	}

	if ctx.TopSymbol != "" && ctx.ConcentrationRatio > 0 {
		sb.WriteString(fmt.Sprintf("- Concentration Risk: %.1f%% in %s\n", ctx.ConcentrationRatio, ctx.TopSymbol))
	}

	ctx.FullContextString = sb.String()
	return ctx
}

func (s *MentorService) buildRuleBasedCritique(score int, rating, grade string, metrics dto.CritiqueMetrics, topSymbol string) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("📊 **Institutional Trade Post-Mortem Assessment**\n\n"))
	b.WriteString(fmt.Sprintf("**Trader Discipline Grade: %s — %s (%d / 100)**\n\n", grade, rating, score))

	if metrics.TotalTradesEvaluated == 0 {
		b.WriteString("✅ **Clean Trading Slate:** No simulated trades recorded yet. Capital is 100% liquid (₹10,00,000.00).\n\n")
		b.WriteString("💡 **Institutional Onboarding Guidance:** Before entering your first position, establish a hard stop-loss trigger order and risk no more than 1–2% of account equity per trade.\n\n")
		b.WriteString("*Disclaimer: Educational trade simulation critique only; not financial advice.*")
		return b.String()
	}

	if metrics.RevengeTradingDetected {
		b.WriteString("⚠️ **Impulse Warning:** High-frequency clustering of orders was detected within narrow timeframes. Systematic traders pause after losing trades rather than re-entering impulsively.\n\n")
	}

	if metrics.ConcentrationRisk == "HIGH" {
		b.WriteString(fmt.Sprintf("⚠️ **Concentration Risk:** Your capital is heavily concentrated in `%s`. Consider allocating no more than 15–20%% of virtual equity to any single counter.\n\n", topSymbol))
	} else {
		b.WriteString("✅ **Position Sizing:** Portfolio concentration remains within healthy institutional risk thresholds.\n\n")
	}

	if metrics.LimitOrderUsagePct >= 50 {
		b.WriteString("✅ **Execution Discipline:** Solid utilization of Limit orders protects your portfolio against adverse market slippage.\n\n")
	} else if metrics.TotalTradesEvaluated >= 3 {
		b.WriteString("💡 **Recommendation:** You are relying predominantly on Market orders. Using Limit orders allows you to capture favorable liquidity and avoid crossing the spread.\n\n")
	}

	if metrics.WinRate >= 60.0 {
		b.WriteString(fmt.Sprintf("🎯 **Win Rate:** %.1f%% realized win rate aligns with profitable trading setups.\n\n", metrics.WinRate))
	}

	b.WriteString("Remember: Consistent profitability is driven by loss prevention, hard stops, and risk-reward asymmetry.\n\n")
	b.WriteString("*Disclaimer: Educational trade simulation critique only; not SEBI-registered financial advice.*")
	return b.String()
}

func (s *MentorService) generateRuleBasedAnswer(question string) string {
	return s.generateRuleBasedAnswerWithContext("", question, s.fetchUserAccountContext(""))
}

func (s *MentorService) generateRuleBasedAnswerWithContext(userID, question string, uCtx UserAccountContext) string {
	q := strings.ToLower(question)

	userContextNote := fmt.Sprintf("\n\n📌 **Your Live Account Context:**\n- Available Balance: ₹%.2f\n- Blocked Margin: ₹%.2f (%.1f%% Margin Utilization)\n- Open Positions: %d contracts/scrips",
		float64(uCtx.AvailableBalancePaise)/100.0, float64(uCtx.BlockedPaise)/100.0, uCtx.MarginUtilizationPct, len(uCtx.Positions))

	complianceDisclaimer := "\n\n*Educational Notice: This analysis is generated for simulator educational guidance only and does not constitute SEBI-registered financial advice or price predictions.*"

	if strings.Contains(q, "hedge") || strings.Contains(q, "hedging") || strings.Contains(q, "protective put") {
		var specificHedge string
		if uCtx.TopSymbol != "" {
			specificHedge = fmt.Sprintf("\n4. **Your Portfolio Application:** To hedge your `%s` position, buying Out-Of-The-Money (OTM) Put options on the stock or NIFTY provides asymmetric downside insulation without liquidating long equity.", uCtx.TopSymbol)
		}
		return fmt.Sprintf("🛡️ **Hedging Framework & Risk Mitigation:**\n\n1. **Protective Puts:** If holding long delivery (CNC) equities, purchasing Out-Of-The-Money (OTM) Put options (`PE`) on `NIFTY` or the underlying stock caps downward portfolio losses.\n2. **Covered Calls:** Writing OTM Call options (`CE`) against existing long delivery shares generates consistent premium income in sideways or mildly bullish markets.\n3. **Delta Neutrality:** Balancing positive equity delta with negative option delta shields your account against unexpected index swings.%s%s%s", specificHedge, userContextNote, complianceDisclaimer)
	}
	if strings.Contains(q, "risk") || strings.Contains(q, "drawdown") || strings.Contains(q, "portfolio") || strings.Contains(q, "exposure") {
		var positionNote string
		if len(uCtx.Positions) > 0 {
			positionNote = fmt.Sprintf("\n4. **Current Exposure:** You have %d active position(s) with highest concentration in `%s` (%.1f%%). Verify that your stop-loss trigger levels (`SL`/`SL-M`) are set.", len(uCtx.Positions), uCtx.TopSymbol, uCtx.ConcentrationRatio)
		} else {
			positionNote = "\n4. **Current Exposure:** You hold zero active market positions; virtual capital is 100% liquid and unexposed to overnight gap risk."
		}
		return fmt.Sprintf("🛡️ **Institutional Portfolio Risk Diagnostic:**\n\n1. **Capital Allocation:** Keep individual position sizing bounded below 15–20%% of total account equity to avoid concentration blow-ups.\n2. **Margin Utilization Guardrail:** Maintain at least a 30%% cash cushion in available balance to absorb market gap-downs and margin spikes.\n3. **Stop-Loss Discipline:** Always specify hard stop-loss trigger levels (`SL` / `SL-M`) rather than relying on manual exits during volatile sessions.%s%s%s", positionNote, userContextNote, complianceDisclaimer)
	}
	if strings.Contains(q, "news") || strings.Contains(q, "headline") || strings.Contains(q, "update") || strings.Contains(q, "market today") {
		return "📰 **Market Pulse & Short News:**\n\n1. **Benchmark Indices:** Markets closed the daily session with key leaders (Reliance, TCS, HDFC Bank) defending support zones.\n2. **Sectoral Breadth:** High liquidity in large-cap equities; derivatives expiries driving open interest shifts.\n3. **Trading Discipline:** During market-closed hours (after 15:30 IST), systematic traders review day journals, verify margin utilization, and prepare setups for the 09:15 opening bell.\n\n*Tip: Switch to the 'Market News' tab or visit `/news` for curated real-time business wire articles!*" + complianceDisclaimer
	}
	if strings.Contains(q, "mis") || strings.Contains(q, "intraday") || strings.Contains(q, "square") {
		return "📘 **MIS (Margin Intraday Square-off) Rules:**\n\n1. **Leverage:** MIS offers up to 5x leverage (20% margin required).\n2. **Mandatory Cut-off:** All open MIS positions are automatically squared off by the server at 15:20 IST.\n3. **Risk:** Unhedged intraday leverage amplifies both gains and losses. Ensure stop-loss orders are active before 15:00 IST." + complianceDisclaimer
	}
	if strings.Contains(q, "greeks") || strings.Contains(q, "black-scholes") || strings.Contains(q, "delta") || strings.Contains(q, "theta") || strings.Contains(q, "vega") {
		return "📐 **Black-Scholes Option Greeks Essentials:**\n\n1. **Delta (Δ):** Rate of change of option price per ₹1 move in spot (Calls: 0 to +1, Puts: -1 to 0).\n2. **Theta (Θ):** Daily time decay in ₹/day. Accelerates exponentially in the final 7 days before Thursday expiry.\n3. **Gamma (Γ):** Rate of change of Delta. Highest for At-The-Money (ATM) options.\n4. **Vega (ν):** Sensitivity to a 1% shift in Implied Volatility (IV).\n\n*Tip: Open the 'Option Chain' in the header to view live Black-Scholes Greeks calculated by our engine!*" + complianceDisclaimer
	}
	if strings.Contains(q, "fno") || strings.Contains(q, "derivative") || strings.Contains(q, "option") || strings.Contains(q, "future") || strings.Contains(q, "expiry") {
		return "📘 **F&O (Futures & Options) Mechanics:**\n\n1. **Lot Sizes:** NSE index contracts trade in standard lot multiples (e.g. NIFTY 50 units, BANKNIFTY 15 units).\n2. **Cash Settlement:** In this simulator, expiring options settle in cash against final underlying spot price at 15:30 IST on Thursdays.\n3. **Intrinsic Value:** ITM (In-The-Money) options payout intrinsic value automatically into your virtual wallet." + complianceDisclaimer
	}
	if strings.Contains(q, "margin") || strings.Contains(q, "leverage") || strings.Contains(q, "balance") {
		return fmt.Sprintf("📘 **Virtual Margin & Capital Management:**\n\n1. **Available Balance:** Cash available for placing new trades.\n2. **Blocked Margin:** Funds locked to guarantee open positions or active limit orders.\n3. **Golden Rule:** Never commit more than 50%% of your total wallet to active intraday margin to absorb sudden gap-downs.%s%s", userContextNote, complianceDisclaimer)
	}
	if strings.Contains(q, "cnc") || strings.Contains(q, "delivery") || strings.Contains(q, "holding") {
		return "📘 **CNC (Cash-and-Carry / Delivery) Rules:**\n\n1. **100% Margin:** CNC requires full 100% cash upfront (no leverage).\n2. **Short-Selling Forbidden:** Delivery short-selling is strictly rejected by the exchange; you can only sell shares you currently hold in your portfolio.\n3. **Holding Period:** CNC positions carry forward indefinitely without overnight auto-squareoff." + complianceDisclaimer
	}
	if strings.Contains(q, "revenge") || strings.Contains(q, "discipline") || strings.Contains(q, "psychology") || strings.Contains(q, "emotion") {
		return "🧠 **Trading Psychology & Behavioral Guardrails:**\n\n1. **Revenge Trading Trap:** Placing rapid trades immediately following a loss leads to compounding drawdowns. Take a mandatory 15-minute cool-off after any stop-out.\n2. **Loss Aversion:** Amateurs hold losers hoping for break-even while prematurely selling winners. Define your exit rules before entering the position.\n3. **Trade Journaling:** Review your trades using the 'AI Copilot Critique' to track discipline score and habit flags." + complianceDisclaimer
	}

	return fmt.Sprintf("📘 **Educational Simulator Copilot:**\n\nDisciplined trading requires three pillars:\n1. **Predefined Risk:** Risk no more than 1–2%% of total account balance per trade.\n2. **Execution Timing:** Trade during high-liquidity market hours (09:30–11:30 and 13:30–15:00 IST).\n3. **Journaling:** Track your setups, win rates, and emotional states to refine your edge over time.%s%s", userContextNote, complianceDisclaimer)
}

func (s *MentorService) callGemini(ctx context.Context, prompt string) (string, error) {
	payload := geminiRequest{
		SystemInstruction: content("You are an institutional trading risk manager. Provide concise, constructive risk critique. Do not offer formal financial advice."),
		Contents:          []geminiContent{{Role: "user", Parts: content(prompt).Parts}},
	}
	payload.GenerationConfig.MaxOutputTokens = 600
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	url := fmt.Sprintf(geminiGenerateContentURL, s.model)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", s.apiKey)
	response, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	respBody, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return "", err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", fmt.Errorf("gemini status %d", response.StatusCode)
	}
	var res geminiResponse
	if err := json.Unmarshal(respBody, &res); err != nil {
		return "", err
	}
	for _, c := range res.Candidates {
		for _, p := range c.Content.Parts {
			if strings.TrimSpace(p.Text) != "" {
				return p.Text, nil
			}
		}
	}
	return "", fmt.Errorf("no text returned")
}

func mathAbs(n int64) int64 {
	if n < 0 {
		return -n
	}
	return n
}
