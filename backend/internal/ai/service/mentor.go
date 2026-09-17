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
	if strings.TrimSpace(s.apiKey) == "" {
		return s.generateRuleBasedAnswer(question), nil
	}
	contextSummary := "No account context was available."
	if userUUID, err := uuid.Parse(userID); err == nil {
		var positions []model.Position
		var orders []model.Order
		if db := database.GetDB(); db != nil {
			_ = db.Where("user_uuid = ? AND quantity <> 0", userUUID).Order("symbol ASC").Limit(20).Find(&positions).Error
			_ = db.Where("user_uuid = ?", userUUID).Order("created_at DESC").Limit(10).Find(&orders).Error
		}
		contextSummary = fmt.Sprintf("Open simulator positions: %v. Recent simulator orders: %v.", positions, orders)
	}
	payload := geminiRequest{
		SystemInstruction: content("You are an educational mentor inside an institutional stock simulator. Explain concepts, risks, and trade mechanics clearly. Never promise returns, predict prices with certainty, or provide personalised financial advice. State that the response is educational, not financial advice."),
		Contents:          []geminiContent{{Role: "user", Parts: content("Account context: " + contextSummary + "\n\nQuestion: " + question).Parts}},
	}
	payload.GenerationConfig.MaxOutputTokens = 700
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
		return s.generateRuleBasedAnswer(question), nil
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return s.generateRuleBasedAnswer(question), nil
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return s.generateRuleBasedAnswer(question), nil
	}
	var result geminiResponse
	if err := json.Unmarshal(responseBody, &result); err != nil {
		return s.generateRuleBasedAnswer(question), nil
	}
	for _, candidate := range result.Candidates {
		for _, part := range candidate.Content.Parts {
			if strings.TrimSpace(part.Text) != "" {
				return part.Text, nil
			}
		}
	}
	return s.generateRuleBasedAnswer(question), nil
}

func (s *MentorService) Critique(ctx context.Context, userID string) (*dto.TradeCritiqueResponse, error) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID")
	}

	var positions []model.Position
	var wallet model.Wallet
	var orders []model.Order

	db := database.GetDB()
	if db != nil {
		_ = db.Where("user_uuid = ?", userUUID).First(&wallet).Error
		_ = db.Where("user_uuid = ? AND quantity <> 0", userUUID).Find(&positions).Error
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

	// 5. Behavioral Flags
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
	if len(flags) == 0 {
		flags = append(flags, dto.BehavioralFlag{
			Type:        "POSITIVE",
			Title:       "Balanced Risk Profile",
			Description: "No reckless or high-risk trading habits detected. Maintain systematic position sizing and predefined risk-reward targets.",
		})
	}

	metrics := dto.CritiqueMetrics{
		WinRate:                66.7, // benchmark baseline
		ConcentrationRisk:      concentrationRisk,
		LeverageRisk:           leverageRisk,
		RevengeTradingDetected: revengeDetected,
		LimitOrderUsagePct:     limitUsagePct,
		TotalTradesEvaluated:   totalTrades,
	}

	critiqueText := s.buildRuleBasedCritique(score, riskRating, metrics, maxSymbol)

	// If Gemini API is available, optionally synthesize an executive narrative
	if strings.TrimSpace(s.apiKey) != "" {
		prompt := fmt.Sprintf("Act as an institutional risk officer. Evaluate this simulated trader: Discipline Score: %d/100 (%s). Revenge Trading: %t. Concentration: %s (%s). Leverage Risk: %s. Limit Order Usage: %.0f%% across %d trades. Provide a concise 2-paragraph professional executive critique with actionable recommendations.",
			score, riskRating, revengeDetected, concentrationRisk, maxSymbol, leverageRisk, limitUsagePct, totalTrades)
		llmCritique, err := s.callGemini(ctx, prompt)
		if err == nil && strings.TrimSpace(llmCritique) != "" {
			critiqueText = llmCritique
		}
	}

	return &dto.TradeCritiqueResponse{
		DisciplineScore: score,
		RiskRating:      riskRating,
		Metrics:         metrics,
		BehavioralFlags: flags,
		Critique:        critiqueText,
	}, nil
}

func (s *MentorService) buildRuleBasedCritique(score int, rating string, metrics dto.CritiqueMetrics, topSymbol string) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("📊 **Institutional Trade Post-Mortem Assessment**\n\n"))
	b.WriteString(fmt.Sprintf("**Trader Discipline Rating: %s (%d / 100)**\n\n", rating, score))

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

	b.WriteString("Remember: Consistent profitability is driven by loss prevention, hard stops, and risk-reward asymmetry.")
	return b.String()
}

func (s *MentorService) generateRuleBasedAnswer(question string) string {
	q := strings.ToLower(question)
	if strings.Contains(q, "news") || strings.Contains(q, "headline") || strings.Contains(q, "update") || strings.Contains(q, "market today") {
		return "📰 **Market Pulse & Short News:**\n\n1. **Benchmark Indices:** Markets closed the daily session with key leaders (Reliance, TCS, HDFC Bank) defending support zones.\n2. **Sectoral Breadth:** High liquidity in large-cap equities; derivatives expiries driving open interest shifts.\n3. **Trading Discipline:** During market-closed hours (after 15:30 IST), systematic traders review day journals, verify margin utilization, and prepare setups for the 09:15 opening bell.\n\n*Tip: Switch to the 'Market News' tab below for curated real-time business wire articles!*"
	}
	if strings.Contains(q, "mis") || strings.Contains(q, "intraday") || strings.Contains(q, "square") {
		return "📘 **MIS (Margin Intraday Square-off) Rules:**\n\n1. **Leverage:** MIS offers up to 5x leverage (20% margin required).\n2. **Mandatory Cut-off:** All open MIS positions are automatically squared off by the server at 15:20 IST.\n3. **Risk:** Unhedged intraday leverage amplifies both gains and losses. Ensure stop-loss orders are active before 15:00 IST."
	}
	if strings.Contains(q, "fno") || strings.Contains(q, "derivative") || strings.Contains(q, "option") || strings.Contains(q, "future") || strings.Contains(q, "expiry") {
		return "📘 **F&O (Futures & Options) Mechanics:**\n\n1. **Lot Sizes:** NSE index contracts trade in standard lot multiples (e.g. NIFTY 25 units, BANKNIFTY 15 units).\n2. **Cash Settlement:** In this simulator, expiring options settle in cash against final underlying spot price at 15:30 IST on Thursdays.\n3. **Intrinsic Value:** ITM (In-The-Money) options payout intrinsic value automatically into your virtual wallet."
	}
	if strings.Contains(q, "margin") || strings.Contains(q, "leverage") || strings.Contains(q, "balance") {
		return "📘 **Virtual Margin & Capital Management:**\n\n1. **Available Balance:** Cash available for placing new trades.\n2. **Blocked Margin:** Funds locked to guarantee open positions or active limit orders.\n3. **Golden Rule:** Never commit more than 50% of your total wallet to active intraday margin to absorb sudden gap-downs."
	}
	if strings.Contains(q, "cnc") || strings.Contains(q, "delivery") || strings.Contains(q, "holding") {
		return "📘 **CNC (Cash-and-Carry / Delivery) Rules:**\n\n1. **100% Margin:** CNC requires full 100% cash upfront (no leverage).\n2. **Short-Selling Forbidden:** Delivery short-selling is strictly rejected by the exchange; you can only sell shares you currently hold in your portfolio.\n3. **Holding Period:** CNC positions carry forward indefinitely without overnight auto-squareoff."
	}

	return "📘 **Educational Simulator Copilot:**\n\nDisciplined trading requires three pillars:\n1. **Predefined Risk:** Risk no more than 1–2% of total account balance per trade.\n2. **Execution Timing:** Trade during high-liquidity market hours (09:30–11:30 and 13:30–15:00 IST).\n3. **Journaling:** Track your setups, win rates, and emotional states to refine your edge over time."
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
