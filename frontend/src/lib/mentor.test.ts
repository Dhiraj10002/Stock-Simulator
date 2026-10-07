import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateDisciplineGrade,
  calculateRiskRating,
  evaluatePreTradeRisk,
} from "./mentor";

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
