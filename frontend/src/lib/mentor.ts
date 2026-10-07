/**
 * Pre-Trade Risk & Discipline Evaluation Helpers
 * Provides client-side fallback and evaluation logic for AI Mentor Pre-Trade Risk Lab.
 */

export function calculateDisciplineGrade(score: number): string {
  if (score >= 92) return "A+";
  if (score >= 82) return "A";
  if (score >= 72) return "B+";
  if (score >= 60) return "B";
  if (score >= 45) return "C";
  if (score >= 30) return "D";
  return "F";
}

export function calculateRiskRating(score: number): "EXCELLENT" | "MODERATE" | "HIGH_RISK" {
  if (score < 55) return "HIGH_RISK";
  if (score < 80) return "MODERATE";
  return "EXCELLENT";
}

export interface PreTradeEvaluationResult {
  score: number;
  riskLevel: "SAFE" | "MODERATE" | "HIGH_RISK";
  riskRewardRatio: number;
  marginImpactPct: number;
  requiredMarginRupees: number;
  warnings: string[];
  advice: string;
  isCircuitBreached: boolean;
  isWishfulThinking: boolean;
}

export function evaluatePreTradeRisk(params: {
  side: "BUY" | "SELL";
  product: "DELIVERY" | "INTRADAY" | "FNO";
  price: number;
  stopLoss?: number;
  target?: number;
  quantity: number;
  availableCapital: number;
  symbol?: string;
}): PreTradeEvaluationResult {
  const { side, product, price, stopLoss, target, quantity, availableCapital, symbol = "COUNTER" } = params;
  const isBuy = side === "BUY";
  const warnings: string[] = [];
  let score = 100;
  let circuitBreached = false;
  let wishfulThinking = false;
  let rr = 0;

  // Margin requirement
  let marginMultiplier = 1.0;
  if (product === "INTRADAY") marginMultiplier = 0.2; // 5x leverage
  else if (product === "FNO") marginMultiplier = 0.2;

  const turnover = price * quantity;
  const requiredMargin = turnover * marginMultiplier;
  const marginImpactPct = availableCapital > 0 ? (requiredMargin / availableCapital) * 100 : (requiredMargin > 0 ? 100 : 0);

  if (requiredMargin > availableCapital && availableCapital > 0 && !(side === "SELL" && product === "DELIVERY")) {
    score -= 40;
    warnings.push(`Insufficient Margin: Required ₹${requiredMargin.toFixed(0)} exceeds available balance.`);
  } else if (marginImpactPct >= 50) {
    score -= 25;
    warnings.push("Excessive Margin Commitment (>50%)");
  } else if (marginImpactPct >= 25) {
    score -= 15;
    warnings.push("Elevated Margin Commitment (>25%)");
  }

  if (stopLoss && target) {
    const risk = isBuy ? price - stopLoss : stopLoss - price;
    const reward = isBuy ? target - price : price - target;

    if (risk <= 0) {
      warnings.push("Invalid Stop-Loss Order");
      score -= 40;
    }
    if (reward <= 0) {
      warnings.push("Invalid Target Order");
      score -= 40;
    }

    if (risk > 0 && reward > 0) {
      rr = Number((reward / risk).toFixed(2));
      const targetMovePct = (reward / price) * 100;

      if (product === "INTRADAY" && targetMovePct > 20) {
        circuitBreached = true;
        score = 25;
        warnings.push("Circuit Limit Breach (+20%)");
      }

      if (circuitBreached || (rr > 8.0 && targetMovePct > 8)) {
        wishfulThinking = true;
        warnings.push("Wishful Thinking Bias");
      }

      if (rr < 1.0) {
        warnings.push("Unfavorable Risk/Reward (R:R < 1.0)");
        score -= 20;
      }
    }
  } else {
    if (product === "INTRADAY" || product === "FNO") {
      warnings.push("No Stop-Loss Defined");
      score -= 25;
    }
  }

  const clampedScore = Math.max(10, Math.min(100, score));
  const riskLevel: "SAFE" | "MODERATE" | "HIGH_RISK" =
    circuitBreached || clampedScore < 55 ? "HIGH_RISK" : clampedScore >= 80 ? "SAFE" : "MODERATE";

  let advice = "";
  if (riskLevel === "SAFE") {
    advice = `Disciplined trade geometry on ${symbol}. Healthy margin allocation (${marginImpactPct.toFixed(1)}%) with positive risk-reward expectancy.`;
  } else if (riskLevel === "MODERATE") {
    advice = `Trade parameters acceptable but monitor capital sizing on ${symbol}. Ensure stop-loss is placed at exchange on fill.`;
  } else {
    advice = `High-risk order configuration on ${symbol}. Re-evaluate sizing, stop-loss placement, or circuit boundaries before placing.`;
  }

  return {
    score: clampedScore,
    riskLevel,
    riskRewardRatio: rr,
    marginImpactPct,
    requiredMarginRupees: requiredMargin,
    warnings,
    advice,
    isCircuitBreached: circuitBreached,
    isWishfulThinking: wishfulThinking,
  };
}
