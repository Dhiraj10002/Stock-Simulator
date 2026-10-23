package service

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/ai/dto"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/database"
	"github.com/Dhiraj10002/Stock-Simulator/backend/internal/model"
	orderDTO "github.com/Dhiraj10002/Stock-Simulator/backend/internal/order/dto"
	"github.com/google/uuid"
)

// Analyze preserves the internal string API; HTTP callers use the explicit source metadata.
func (s *MentorService) Analyze(ctx context.Context, userID, question string) (string, error) {
	result := s.AnalyzeDetailed(ctx, userID, question)
	return result.Answer, nil
}

func (s *MentorService) AnalyzeDetailed(ctx context.Context, userID, question string) dto.MentorResponse {
	account := s.fetchUserAccountContext(userID)
	prompt := account.FullContextString + "\n\nUser question: " + strings.TrimSpace(question)
	answer, err := s.callGemini(ctx, prompt)
	if err == nil {
		return dto.MentorResponse{Answer: answer, Source: "gemini", Model: s.model}
	}
	reason := geminiFailureReason(err)
	log.Printf("event=gemini_fallback reason=%s", reason)
	return dto.MentorResponse{Answer: s.generateRuleBasedAnswerWithContext(userID, question, account),
		Source: "rule_based", FallbackReason: reason}
}

func (s *MentorService) PreTradeCheck(ctx context.Context, userID string, req dto.PreTradeCheckRequest) (*dto.PreTradeCheckResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID")
	}

	if s.OrderPreview == nil {
		return nil, fmt.Errorf("order preview unavailable")
	}
	orderType := req.Type
	price := req.PricePaise
	if (req.Type == model.OrderTypeMarket || req.Type == model.OrderTypeSLM) && price > 0 {
		orderType = model.OrderTypeLimit
	} else if req.Type == model.OrderTypeMarket || req.Type == model.OrderTypeSLM {
		price = 0
	}
	preview, err := s.OrderPreview(userID, orderDTO.CreateOrderRequest{Symbol: req.Symbol, Side: req.Side, Product: req.Product, Type: orderType, Quantity: req.Quantity, PricePaise: price, TriggerPricePaise: req.StopLossPaise})
	var availablePaise, requiredMarginPaise int64
	var orderPreviewWarning string
	if err != nil {
		orderPreviewWarning = err.Error()
		unitPrice := price
		notional := unitPrice * req.Quantity
		switch req.Product {
		case model.OrderProductIntraday:
			requiredMarginPaise = notional / 5
		default:
			requiredMarginPaise = notional
		}
		var w model.Wallet
		if db := database.GetDB(); db != nil {
			if wErr := db.Where("user_uuid = ?", userUUID).First(&w).Error; wErr == nil {
				availablePaise = w.AvailableBalancePaise()
			}
		}
	} else {
		availablePaise, requiredMarginPaise = preview.AvailableBalancePaise, preview.RequiredFundsPaise
	}
	var positions []model.Position
	if db := database.GetDB(); db != nil {
		if err := db.Where("user_uuid = ? AND quantity <> 0", userUUID).Find(&positions).Error; err != nil {
			return nil, err
		}
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

	if orderPreviewWarning != "" {
		riskLevel = "HIGH_RISK"
		warnings = append(warnings, fmt.Sprintf("Exchange Rule Alert: %s", orderPreviewWarning))
	}

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
	if db == nil {
		return nil, fmt.Errorf("account snapshot unavailable")
	}
	db = db.WithContext(ctx)
	if db.Where("user_uuid = ?", userUUID).First(&wallet).Error != nil ||
		db.Where("user_uuid = ? AND quantity <> 0", userUUID).Find(&positions).Error != nil ||
		db.Where("user_uuid = ?", userUUID).Find(&allPositions).Error != nil ||
		db.Where("user_uuid = ?", userUUID).Order("created_at DESC").Limit(50).Find(&orders).Error != nil {
		return nil, fmt.Errorf("account snapshot unavailable")
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

	winRate := 0.0 // No invented baseline when there are no realized outcomes.
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
			Title:       "Rapid order activity",
			Description: "3 or more orders were placed within 5 minutes. Take a step back during volatile periods to avoid emotional impulse trading.",
		})
	}
	if concentrationRisk == "HIGH" {
		flags = append(flags, dto.BehavioralFlag{
			Type:        "WARNING",
			Title:       "High Portfolio Concentration",
			Description: fmt.Sprintf("A single asset (%s) accounts for over 35%% of gross marked open-position value (excluding cash). This does not measure total account-equity allocation or full derivative exposure.", maxSymbol),
		})
	}
	if leverageRisk == "HIGH" {
		flags = append(flags, dto.BehavioralFlag{
			Type:        "WARNING",
			Title:       "High Margin Utilization (>70%)",
			Description: "More than 70% of cash balance is blocked in intraday or derivatives margins, exposing the portfolio to liquidation risk.",
		})
	}
	if limitUsagePct >= 50 && totalTrades >= 2 {
		flags = append(flags, dto.BehavioralFlag{
			Type:        "POSITIVE",
			Title:       "Disciplined Price Targeting",
			Description: fmt.Sprintf("%.0f%% of sampled orders used limit prices. Limit orders control price but may remain unfilled.", limitUsagePct),
		})
	}
	if totalClosed > 0 && winRate >= 60.0 {
		flags = append(flags, dto.BehavioralFlag{
			Type:        "POSITIVE",
			Title:       "Realized outcome summary",
			Description: fmt.Sprintf("%.1f%% of positions with non-zero cumulative realized P&L are positive. This is not a per-trade win rate or proof of profitability.", winRate),
		})
	}
	if len(flags) == 0 {
		flags = append(flags, dto.BehavioralFlag{
			Type:        "POSITIVE",
			Title:       "Balanced Risk Profile",
			Description: "No heuristic flags triggered in the available records. This does not establish that the account is safe.",
		})
	}

	metrics := dto.CritiqueMetrics{
		RealizedPositionsEvaluated: totalClosed,
		WinRate:                    winRate,
		ConcentrationRisk:          concentrationRisk,
		LeverageRisk:               leverageRisk,
		RevengeTradingDetected:     revengeDetected,
		LimitOrderUsagePct:         limitUsagePct,
		TotalTradesEvaluated:       totalTrades,
		RealizedPnlPaise:           totalRealizedPnlPaise,
	}

	critiqueText := s.buildRuleBasedCritique(score, riskRating, grade, metrics, maxSymbol)

	source, fallbackReason := "rule_based", "not_configured"
	if totalTrades == 0 {
		fallbackReason = "insufficient_history"
	}
	// The numeric score is always calculated by Go; Gemini only writes a narrative.
	if strings.TrimSpace(s.apiKey) != "" && totalTrades > 0 {
		uCtx := s.fetchUserAccountContext(userID)
		prompt := fmt.Sprintf("Act as an institutional risk officer. Evaluate this simulated trader:\n"+
			"%s\n"+
			"Trader Grade: %s (Discipline Score: %d/100, Rating: %s)\n"+
			"Positive share of positions with non-zero cumulative realized P&L: %.1f%%; %d sampled orders (Realized P&L: ₹%.2f)\n"+
			"Behavioral Flags: Rapid Order Activity: %t, Concentration Risk: %s (%s), Margin Leverage Risk: %s, Limit Order Discipline: %.0f%%\n"+
			"Provide a concise 2-to-3 paragraph professional executive critique with actionable recommendations for risk mitigation. Explicitly state that this is an educational simulation critique and not financial advice.",
			uCtx.FullContextString, grade, score, riskRating, winRate, totalTrades, float64(totalRealizedPnlPaise)/100.0,
			revengeDetected, concentrationRisk, maxSymbol, leverageRisk, limitUsagePct)
		llmCritique, err := s.callGemini(ctx, prompt)
		if err == nil && strings.TrimSpace(llmCritique) != "" {
			critiqueText = llmCritique
			source, fallbackReason = "gemini", ""
		} else {
			fallbackReason = geminiFailureReason(err)
			log.Printf("event=gemini_fallback reason=%s", fallbackReason)
		}
	}

	return &dto.TradeCritiqueResponse{
		DisciplineScore: score,
		RiskRating:      riskRating,
		Grade:           grade,
		Metrics:         metrics,
		BehavioralFlags: flags,
		Critique:        critiqueText,
		Source:          source,
		FallbackReason:  fallbackReason,
	}, nil
}

type UserAccountContext struct {
	Available             bool
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
	ctx := UserAccountContext{FullContextString: "Account context unavailable. Do not infer balances, holdings, or trade history."}

	userUUID, err := uuid.Parse(userID)
	if err != nil {
		ctx.FullContextString = "Account context unavailable for this session. Do not infer balances or holdings."
		return ctx
	}

	db := database.GetDB()
	if db == nil {
		ctx.FullContextString = "Account context unavailable: database could not be read. Do not infer balances or holdings."
		return ctx
	}

	var wallet model.Wallet
	if err := db.Where("user_uuid = ?", userUUID).First(&wallet).Error; err != nil {
		return ctx
	} else {
		ctx.Available = true
		ctx.CashBalancePaise = wallet.CashBalancePaise
		ctx.BlockedPaise = wallet.BlockedPaise
		ctx.AvailableBalancePaise = wallet.AvailableBalancePaise()
		if wallet.CashBalancePaise > 0 {
			ctx.MarginUtilizationPct = (float64(wallet.BlockedPaise) / float64(wallet.CashBalancePaise)) * 100.0
		}
	}

	var positions []model.Position
	if err := db.Where("user_uuid = ? AND quantity <> 0", userUUID).Order("symbol ASC").Find(&positions).Error; err != nil {
		return UserAccountContext{FullContextString: "Account context unavailable: positions could not be read."}
	}
	ctx.Positions = positions

	var orders []model.Order
	if err := db.Where("user_uuid = ?", userUUID).Order("created_at DESC").Limit(10).Find(&orders).Error; err != nil {
		return UserAccountContext{FullContextString: "Account context unavailable: recent orders could not be read."}
	}
	ctx.RecentOrders = orders

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
	sb.WriteString("SIMULATOR ACCOUNT SNAPSHOT (stored marks; not a live price/risk guarantee):\n")
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
		sb.WriteString(fmt.Sprintf("- Largest position share of gross open-position marked value: %.1f%% in %s (excludes cash; not account-equity allocation)\n", ctx.ConcentrationRatio, ctx.TopSymbol))
	}

	ctx.FullContextString = sb.String()
	return ctx
}

func (s *MentorService) buildRuleBasedCritique(score int, rating, grade string, metrics dto.CritiqueMetrics, topSymbol string) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("📊 **Institutional Trade Post-Mortem Assessment**\n\n"))
	if metrics.TotalTradesEvaluated == 0 {
		b.WriteString("**Insufficient order history:** No sampled orders were found. No discipline grade can be established from that sample. Existing positions and cash must be checked separately.\n\n")
		b.WriteString("*Disclaimer: Educational trade simulation critique only; not financial advice.*")
		return b.String()
	}
	b.WriteString(fmt.Sprintf("**Trader Discipline Grade: %s — %s (%d / 100)**\n\n", grade, rating, score))

	if metrics.RevengeTradingDetected {
		b.WriteString("⚠️ **Impulse Warning:** High-frequency clustering of orders was detected within narrow timeframes. Order clustering alone cannot establish a loss, motivation, or revenge trading.\n\n")
	}

	if metrics.ConcentrationRisk == "HIGH" {
		b.WriteString(fmt.Sprintf("⚠️ **Concentration Risk:** Your capital is heavily concentrated in `%s`. Review its share of gross open-position marked value; this excludes cash and is not a total-account risk measure.\n\n", topSymbol))
	} else {
		b.WriteString("✅ **Position Sizing:** No high concentration flag was triggered by this heuristic; this is not a complete risk assessment.\n\n")
	}

	if metrics.LimitOrderUsagePct >= 50 {
		b.WriteString("✅ **Execution Discipline:** Sampled limit orders specify an execution price but do not guarantee a fill.\n\n")
	} else if metrics.TotalTradesEvaluated >= 3 {
		b.WriteString("💡 **Recommendation:** You are relying predominantly on Market orders. Limit orders specify an acceptable execution price but do not guarantee a fill.\n\n")
	}

	if metrics.WinRate >= 60.0 {
		b.WriteString(fmt.Sprintf("🎯 **Realized position outcomes:** %.1f%% of positions with non-zero cumulative realized P&L are positive; this is not a per-trade win rate.\n\n", metrics.WinRate))
	}

	b.WriteString("This heuristic review cannot establish profitability or future returns. Check quote freshness, execution constraints and your recorded trading plan.\n\n")
	b.WriteString("*Disclaimer: Educational trade simulation critique only; not SEBI-registered financial advice.*")
	return b.String()
}

func (s *MentorService) generateRuleBasedAnswer(question string) string {
	return s.generateRuleBasedAnswerWithContext("", question, s.fetchUserAccountContext(""))
}

func (s *MentorService) generateRuleBasedAnswerWithContext(userID, question string, account UserAccountContext) string {
	q := strings.ToLower(question)
	notice := "\n\n*Educational paper-trading guidance. Account figures use stored marks and may be stale.*"
	snapshot := "\n\n**Account snapshot unavailable.** I cannot verify balances, exposure or order history."
	if account.Available {
		snapshot = fmt.Sprintf("\n\n**Account snapshot:** Available cash ₹%.2f; blocked ₹%.2f (%.1f%% of cash balance); %d open positions. Stored marks may be stale.", float64(account.AvailableBalancePaise)/100, float64(account.BlockedPaise)/100, account.MarginUtilizationPct, len(account.Positions))
	}
	switch {
	case strings.Contains(q, "hedg") || strings.Contains(q, "protective put"):
		return "**Hedging Framework:** A matching-underlying protective put can limit downside below its strike for the covered quantity until expiry, at a premium cost. An OTM put leaves losses above the strike unprotected. An index put is an imperfect hedge for an individual stock; correlation, contract size and expiry matter. Covered calls collect premium but retain stock downside and cap upside. Delta hedges change as prices and time change; none guarantees protection. Specify the position and horizon to explore paper examples; I cannot select a suitable contract from this snapshot alone." + snapshot + notice
	case strings.Contains(q, "risk") || strings.Contains(q, "portfolio") || strings.Contains(q, "exposure") || strings.Contains(q, "drawdown"):
		detail := ""
		if account.Available && account.TopSymbol != "" {
			detail = fmt.Sprintf(" **%s is %.1f%% of gross open-position marked value**, excluding cash. This is not its share of total account equity. Derivative premiums, notional exposure and margin are different measures; this is not a complete risk assessment.", account.TopSymbol, account.ConcentrationRatio)
		}
		return "**Portfolio Risk Snapshot:** Review concentration, leverage, liquidity and potential losses together. A stop order can slip or remain unfilled; blocked margin is not maximum possible loss." + detail + snapshot + notice
	case strings.Contains(q, "news") || strings.Contains(q, "headline") || strings.Contains(q, "market today"):
		return "**Market news:** I cannot verify current headlines in this fallback. Open News Desk and check each article's source and publication time. I will not invent a market summary." + notice
	case strings.Contains(q, "mis") || strings.Contains(q, "intraday") || strings.Contains(q, "square"):
		return "**MIS (Margin Intraday Square-off) Rules:** The simulator blocks new MIS orders and cancels pending MIS orders from 15:20 IST. It attempts square-off until 15:30 using executable quotes; missing quotes can leave a pending or failed square-off. This is simulator policy, not a universal broker cutoff. Use order preview for current margin requirements; execution is not guaranteed." + notice
	case strings.Contains(q, "greek") || strings.Contains(q, "delta") || strings.Contains(q, "theta") || strings.Contains(q, "black-scholes"):
		return "**Option Greeks:** Delta estimates sensitivity to the underlying price; gamma measures changes in delta; theta measures time sensitivity; vega measures sensitivity to implied volatility. These are model estimates, not guaranteed price changes. Check the actual contract expiry; do not assume a weekday or an available option-chain feature." + notice
	case strings.Contains(q, "fno") || strings.Contains(q, "derivative") || strings.Contains(q, "option") || strings.Contains(q, "future") || strings.Contains(q, "expiry"):
		return "**F&O (Futures & Options) Mechanics:** Contract lot size and expiry come from instrument metadata and can change. The simulator uses its expiry-settlement workflow and validated settlement references; unavailable references must not produce invented fills. Real exchange settlement rules can differ from this educational simulation. Open the contract details for its actual lot size and expiry." + notice
	case strings.Contains(q, "margin") || strings.Contains(q, "leverage") || strings.Contains(q, "balance"):
		return "**Virtual Margin & Capital Management:** Available cash, blocked margin and maximum possible loss are different measures. Use the order preview for the selected product's required funds; do not assume a universal derivatives leverage multiplier." + snapshot + notice
	case strings.Contains(q, "cnc") || strings.Contains(q, "delivery") || strings.Contains(q, "holding"):
		return "**CNC (Cash-and-Carry / Delivery) Rules:** This simulator requires full funds for delivery purchases and only allows delivery sells against available holdings. Delivery positions are not subject to its MIS square-off. Review the order preview and holdings before placing a paper order." + notice
	case strings.Contains(q, "audit") || strings.Contains(q, "critique") || strings.Contains(q, "discipline") || strings.Contains(q, "psychology") || strings.Contains(q, "revenge"):
		return "**Trading discipline:** Use Audit My Trades to inspect the available account records. Rapid order activity alone does not establish revenge trading; a win rate alone does not establish profitability. Review losses, sizing and exits against your own recorded plan. A cooling-off interval is a personal practice choice, not an exchange-mandated rule." + notice
	case strings.Contains(q, "stock") || strings.Contains(q, "scrip") || strings.Contains(q, "watchlist") || strings.Contains(q, "share"):
		return "**Explore stocks for paper practice:** Are you exploring delivery or intraday trading? Open Stocks to compare available NSE quotes and their timestamps, then add candidates to Watchlist. I cannot verify a current stock ranking or recommend a purchase from this fallback." + notice
	default:
		return "**Educational Simulator Copilot:** I can explain order types, MIS rules, margin, option mechanics, or your account snapshot. Which topic or symbol would you like to explore? For a trade-history review, use Audit My Trades." + notice
	}
}

func mathAbs(n int64) int64 {
	if n < 0 {
		return -n
	}
	return n
}
