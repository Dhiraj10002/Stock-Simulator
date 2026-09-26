import test from "node:test";
import assert from "node:assert/strict";

// Helper functions matching backend and frontend AI mentor logic
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

export function evaluatePreTradeRisk(params: {
  side: "BUY" | "SELL";
  product: "DELIVERY" | "INTRADAY" | "FNO";
  price: number;
  stopLoss?: number;
  target?: number;
  quantity: number;
  availableCapital: number;
}) {
  const { side, product, price, stopLoss, target, quantity, availableCapital } = params;
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
  const marginImpactPct = availableCapital > 0 ? (requiredMargin / availableCapital) * 100 : 100;

  if (marginImpactPct >= 50) {
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
    }
  }

  const clampedScore = Math.max(10, Math.min(100, score));
  const riskLevel = circuitBreached || clampedScore < 55 ? "HIGH_RISK" : clampedScore >= 80 ? "SAFE" : "MODERATE";

  return {
    score: clampedScore,
    riskLevel,
    riskRewardRatio: rr,
    marginImpactPct,
    warnings,
    isCircuitBreached: circuitBreached,
    isWishfulThinking: wishfulThinking,
  };
}

test("calculateDisciplineGrade maps scores accurately across institutional scale", () => {
  assert.equal(calculateDisciplineGrade(98), "A+");
  assert.equal(calculateDisciplineGrade(92), "A+");
  assert.equal(calculateDisciplineGrade(85), "A");
  assert.equal(calculateDisciplineGrade(75), "B+");
  assert.equal(calculateDisciplineGrade(65), "B");
  assert.equal(calculateDisciplineGrade(50), "C");
  assert.equal(calculateDisciplineGrade(35), "D");
  assert.equal(calculateDisciplineGrade(20), "F");
});

test("calculateRiskRating assigns EXCELLENT, MODERATE, or HIGH_RISK thresholds", () => {
  assert.equal(calculateRiskRating(90), "EXCELLENT");
  assert.equal(calculateRiskRating(80), "EXCELLENT");
  assert.equal(calculateRiskRating(79), "MODERATE");
  assert.equal(calculateRiskRating(55), "MODERATE");
  assert.equal(calculateRiskRating(54), "HIGH_RISK");
  assert.equal(calculateRiskRating(25), "HIGH_RISK");
});

test("evaluatePreTradeRisk correctly detects favorable asymmetric risk setups", () => {
  const result = evaluatePreTradeRisk({
    side: "BUY",
    product: "INTRADAY",
    price: 3000,
    stopLoss: 2950, // Risk: ₹50
    target: 3125,   // Reward: ₹125 -> R:R = 2.5
    quantity: 20,
    availableCapital: 1000000, // Margin: 3000 * 20 * 0.2 = ₹12,000 (1.2% impact)
  });

  assert.equal(result.riskLevel, "SAFE");
  assert.equal(result.riskRewardRatio, 2.5);
  assert.equal(result.isCircuitBreached, false);
  assert.equal(result.isWishfulThinking, false);
  assert.equal(result.warnings.length, 0);
  assert.ok(result.score >= 85);
});

test("evaluatePreTradeRisk catches circuit limit violations and wishful thinking bias", () => {
  const result = evaluatePreTradeRisk({
    side: "BUY",
    product: "INTRADAY",
    price: 1000,
    stopLoss: 980,  // Risk: ₹20 (2%)
    target: 2000,   // Reward: ₹1000 (+100% intraday move!) -> Breaches 20% limit!
    quantity: 50,
    availableCapital: 1000000,
  });

  assert.equal(result.riskLevel, "HIGH_RISK");
  assert.equal(result.isCircuitBreached, true);
  assert.equal(result.isWishfulThinking, true);
  assert.ok(result.score <= 30);
  assert.ok(result.warnings.some((w) => w.includes("Circuit Limit Breach")));
});

test("evaluatePreTradeRisk flags directional order parameter errors", () => {
  const result = evaluatePreTradeRisk({
    side: "BUY",
    product: "DELIVERY",
    price: 2500,
    stopLoss: 2600, // Defensively invalid (higher than entry on BUY)
    target: 2400,   // Favourably invalid (lower than entry on BUY)
    quantity: 10,
    availableCapital: 1000000,
  });

  assert.ok(result.warnings.includes("Invalid Stop-Loss Order"));
  assert.ok(result.warnings.includes("Invalid Target Order"));
  assert.ok(result.score <= 50);
});
