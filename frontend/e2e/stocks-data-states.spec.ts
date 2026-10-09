import { test, expect, type Page } from "@playwright/test";

async function stocksMocks(page: Page, mode: "refresh" | "unavailable" | "degraded") {
  let failed = mode === "unavailable";
  let rotations = 0;
  const portfolioTokens: string[] = [];
  await page.addInitScript(() => {
    document.cookie = `stocksim_session=${"expired-token"}; Path=/; SameSite=Lax`;
  });
  await page.routeWebSocket("**/ws/market", (ws) => ws.onMessage(() => {}));
  await page.route(/\/api\/(?:v1|backend)\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/(?:v1|backend)/, "");
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:3100",
      ...(path === "/auth/login" ? {"set-cookie": "stocksim_session=browser-trader; Path=/; SameSite=Lax"} : {}),
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "authorization,content-type,idempotency-key",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const auth = request.headers().cookie?.includes("stocksim_session=renewed-scope") ? "renewed-scope" : "expired-scope";
    expect(request.headers().authorization).toBeUndefined();
    if (path === "/auth/refresh") {
      rotations++;
      await route.fulfill({ headers: { ...headers, "set-cookie": "stocksim_session=renewed-scope; Path=/; SameSite=Lax" }, json: { success: true, data: { authenticated: true } } });
      return;
    }
    if (path === "/portfolio") {
      portfolioTokens.push(auth || "");
      if (failed) {
        await route.fulfill({ status: 503, headers, json: { success: false, message: "Portfolio offline" } });
        return;
      }
      if (mode === "refresh" && auth === "expired-scope") {
        await route.fulfill({ status: 401, headers, json: { success: false, message: "Token expired" } });
        return;
      }
    }
    const quote = (symbol: string) => ({ symbol, price_paise: 10000, change_paise: 0, change_percent: 0, day_change_available: false, source: "angelone_live", updated_at: new Date().toISOString() });
    let data: unknown = [];
    if (path === "/auth/me") data = { uuid: "stocks-trader", name: "Trader" };
    else if (path === "/wallet") data = { cash_balance_paise: 100000000, available_balance_paise: 100000000, blocked_paise: 0 };
    else if (path === "/portfolio") data = { positions: [{ symbol: "RELIANCE", quantity: 1 }], unrealized_pnl_paise: 12345, valuation_status: mode === "degraded" ? "DEGRADED" : "REALTIME" };
    else if (path === "/market/status") data = { status: "OPEN", is_open: true, feed_provider: "angel_one", feed_state: "LIVE", last_tick: new Date().toISOString() };
    else if (path === "/market/quotes/batch") {
      const rawSymbols = request.method() === "POST" ? request.postDataJSON()?.symbols : new URL(request.url()).searchParams.get("symbols")?.split(",");
      const symbols: string[] = Array.isArray(rawSymbols) ? rawSymbols : [];
      data = Object.fromEntries(symbols.map((symbol: string) => [symbol, quote(symbol)]));
    } else if (path === "/market/quotes") {
      const symbols = new URL(request.url()).searchParams.get("symbols")?.split(",") || [];
      data = Object.fromEntries(symbols.map((symbol) => [symbol, quote(symbol)]));
    } else if (path.startsWith("/market/quotes/")) data = quote(path.split("/").at(-1)!);
    else if (path === "/market/movers") data = { gainers: [], losers: [], most_traded: [], trending: [] };
    await route.fulfill({ headers, json: { success: true, data } });
  });
  return { portfolioTokens, rotations: () => rotations, failPortfolio: (value: boolean) => { failed = value; } };
}

test("Stocks portfolio renews expired authentication and subsequent polling uses the renewed token", async ({ page }) => {
  const mock = await stocksMocks(page, "refresh");
  await page.goto("/stocks");
  const navbar = page.getByRole("group", { name: "Portfolio unrealized P&L", exact: true });
  await expect(navbar.getByText("₹123.45", { exact: true })).toBeVisible();
  await expect.poll(mock.rotations).toBe(1);
  const count = mock.portfolioTokens.length;
  await expect.poll(() => mock.portfolioTokens.length, { timeout: 12000 }).toBeGreaterThan(count);
  expect(mock.portfolioTokens.slice(count)).toEqual(expect.arrayContaining(["renewed-scope"]));
  expect(mock.portfolioTokens.slice(count)).not.toContain("expired-scope");
  mock.failPortfolio(true);
  await expect(page.getByText("Portfolio network update failed: valuation may be stale.")).toBeVisible();
  await expect(navbar.getByText("Unrealized P&L · Last available")).toBeVisible();
  await expect(navbar.getByText("₹123.45", { exact: true })).toBeVisible();
  mock.failPortfolio(false);
  await page.getByRole("button", { name: "Retry", exact: true }).first().click();
  await expect(page.getByText("Portfolio network update failed: valuation may be stale.")).toHaveCount(0);
});

test("Stocks missing portfolio and unknown day movement stay unavailable while genuine prices remain visible", async ({ page }) => {
  const mock = await stocksMocks(page, "unavailable");
  await page.goto("/stocks");
  await expect(page.getByText("Portfolio Unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Portfolio unrealized P&L", exact: true }).getByText("Unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Portfolio unrealized P&L", exact: true }).getByText("₹0.00", { exact: true })).toHaveCount(0);
  const reliance = page.locator('a[href="/stocks/RELIANCE"]').filter({ hasText: "Reliance Industries Ltd" }).first();
  await expect(reliance.getByText("₹100.00", { exact: true })).toBeVisible();
  await expect(reliance.getByText("Day movement unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("+0.00%", { exact: true })).toHaveCount(0);
  await expect(page.getByText("+0.00 (0.00%)", { exact: true })).toHaveCount(0);
  mock.failPortfolio(false);
  await page.getByRole("button", { name: "Retry", exact: true }).first().click();
  await expect(page.getByRole("group", { name: "Portfolio unrealized P&L", exact: true }).getByText("₹123.45", { exact: true })).toBeVisible();
});

test("Stocks degraded valuation cannot present a partial P&L as an authoritative balance", async ({ page }) => {
  await stocksMocks(page, "degraded");
  await page.goto("/stocks");
  await expect(page.getByText("Valuation unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Portfolio unrealized P&L", exact: true }).getByText("Unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Portfolio unrealized P&L", exact: true }).getByText("₹123.45", { exact: true })).toHaveCount(0);
});
