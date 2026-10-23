import { test, expect, type Page, type BrowserContext } from "@playwright/test";

async function setup(page: Page, context: BrowserContext, options: { fail?: boolean; delay?: number; fallback?: boolean; missingSource?: boolean } = {}) {
  await context.addCookies([{ name: "stocksim_session", value: "00000000-0000-0000-0000-000000000051", url: "http://127.0.0.1:3100" }]);
  await page.routeWebSocket("**/ws/market", ws => ws.onMessage(() => {}));
  const calls = { chat: 0, audit: 0 };
  await page.route(/\/api\/(?:v1|backend)\//, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/(?:v1|backend)/, "");
    const headers = { "access-control-allow-origin": "http://127.0.0.1:3100", "access-control-allow-headers": "content-type,authorization" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    let data: unknown = [];
    if (path === "/auth/me") data = { uuid: "copilot-browser-test", name: "Trader" };
    if (path === "/wallet") data = { cash_balance_paise: 100000000, available_balance_paise: 100000000, blocked_paise: 0 };
    if (path === "/portfolio") data = { positions: [], unrealized_pnl_paise: 0, valuation_status: "UNAVAILABLE" };
    if (path === "/market/status") data = { status: "CLOSED", is_open: false };
    if (path === "/ai/analyze-trade") {
      calls.chat++;
      if (options.fail) return route.fulfill({ status: 503, headers, json: { success: false, message: "unavailable" } });
      if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));
      data = { answer: "**Explore stocks**\n\n1. Compare `NSE` quotes and timestamps.", source: options.missingSource ? undefined : options.fallback ? "rule_based" : "gemini", fallback_reason: options.fallback ? "rate_limited" : undefined };
    }
    if (path === "/ai/trade-critique") {
      calls.audit++;
      data = { discipline_score: 70, risk_rating: "MODERATE", grade: "B", source: "rule_based", fallback_reason: "not_configured",
        metrics: { win_rate: 0, realized_positions_evaluated: 0, concentration_risk: "LOW", leverage_risk: "SAFE", revenge_trading_detected: false, limit_order_usage_pct: 50, total_trades_evaluated: 2, realized_pnl_paise: 0 }, behavioral_flags: [], critique: "**Audit summary**\n\nTwo orders sampled. No realized outcomes are available." };
    }
    return route.fulfill({ headers, json: { success: true, data } });
  });
  await page.goto("/mentor");
  await expect(page.getByPlaceholder(/Ask Copilot/)).toBeVisible();
  return calls;
}

test("chat renders Markdown and labels rate-limited fallback", async ({ page, context }) => {
  const calls = await setup(page, context, { fallback: true });
  await page.getByPlaceholder(/Ask Copilot/).fill("stocks");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Rule-based fallback · AI quota reached", { exact: true })).toBeVisible();
  await expect(page.locator("strong").filter({ hasText: "Explore stocks" })).toBeVisible();
  await expect(page.locator("code").filter({ hasText: "NSE" })).toBeVisible();
  expect(calls).toEqual({ chat: 1, audit: 0 });
});

test("audit chip makes one audit request and no general chat request", async ({ page, context }) => {
  const calls = await setup(page, context);
  await page.getByRole("button", { name: "Audit my trading discipline & errors", exact: true }).click();
  await expect(page.getByText(/Your audit scorecard is shown above/)).toBeVisible();
  await expect(page.locator("strong").filter({ hasText: "Audit summary" })).toBeVisible();
  await expect(page.getByText("N/A", { exact: true })).toBeVisible();
  expect(calls).toEqual({ chat: 0, audit: 1 });
});

test("a Gemini response after the former 10s deadline is displayed", async ({ page, context }) => {
  await setup(page, context, { delay: 10_500 });
  await page.getByPlaceholder(/Ask Copilot/).fill("Explain stocks");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Gemini response", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/temporarily unreachable/)).toHaveCount(0);
});

test("network/API failure never invents an assessment", async ({ page, context }) => {
  await setup(page, context, { fail: true });
  await page.getByPlaceholder(/Ask Copilot/).fill("Analyze risk");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(/Your account was not analyzed/)).toBeVisible();
  await expect(page.getByText(/1.5% of account margin/)).toHaveCount(0);
});

test("local welcome and reset messages have no response-source badge or API calls", async ({ page, context }) => {
  const calls = await setup(page, context);
  await expect(page.getByText("Response source unavailable", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Gemini response", { exact: true })).toHaveCount(0);
  await page.getByTitle("Clear Chat History").click();
  await expect(page.getByText(/Conversation thread refreshed/)).toBeVisible();
  await expect(page.getByText("Response source unavailable", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Gemini response", { exact: true })).toHaveCount(0);
  expect(calls).toEqual({ chat: 0, audit: 0 });
});

test("a server response with missing metadata still shows source unavailable", async ({ page, context }) => {
  await setup(page, context, { missingSource: true });
  await page.getByPlaceholder(/Ask Copilot/).fill("Explain stocks");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Response source unavailable", { exact: true })).toBeVisible();
});
