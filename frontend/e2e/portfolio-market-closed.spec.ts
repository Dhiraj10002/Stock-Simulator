import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const holiday = "market is closed for Dussehra; regular trading hours are Monday to Friday 09:15 to 15:30 IST";
async function setup(page: Page, context: BrowserContext, product: "DELIVERY" | "INTRADAY", failure = { status: 400, code: "SQUAREOFF_FAILED", message: holiday }) {
  await context.addCookies([{ name: "stocksim_session", value: "portfolio-notice-test", url: "http://127.0.0.1:3100" }]);
  const keys: (string | undefined)[] = [];
  const position = { uuid: "open-position", symbol: "APARINDS", product, quantity: 2, average_price_paise: 10000, current_price_paise: 10100, current_value_paise: 20200, unrealized_pnl_paise: 200, is_quote_available: true, is_quote_stale: false };
  await page.routeWebSocket("**/ws/market", ws => ws.onMessage(message => {
    if (JSON.parse(String(message)).action === "ping") ws.send(JSON.stringify({ type: "pong" }));
  }));
  await page.route(/\/api\/(?:backend|v1)\//, async route => {
    const request = route.request(), url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/(?:backend|v1)/, "");
    const headers = { "access-control-allow-origin": "http://127.0.0.1:3100", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type,idempotency-key,x-requested-with" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (path.endsWith("/squareoff") || path === "/orders/squareoff-mis") {
      keys.push(request.headers()["idempotency-key"]);
      return route.fulfill({ status: failure.status, headers, json: { success: false, code: failure.code, message: failure.message } });
    }
    let data: unknown = [];
    if (path === "/auth/me") data = { uuid: "portfolio-notice-test", name: "Trader" };
    if (path === "/wallet") data = { cash_balance_paise: 100000000, available_balance_paise: 100000000, blocked_paise: 0 };
    if (path === "/portfolio") data = { positions: [position], invested_value_paise: 20000, current_value_paise: 20200, unrealized_pnl_paise: 200, realized_pnl_paise: 0, valuation_status: "REALTIME" };
    if (path === "/market/status") data = { status: "HOLIDAY", is_open: false, server_time: new Date().toISOString(), feed_state: "LIVE", feed_provider: "angel_one", holiday_name: "Dussehra" };
    if (path === "/market/feed-status") data = { feed_state: "LIVE", feed_provider: "angel_one", is_synthetic: false };
    if (path === "/market/quotes/batch") {
      const symbols = request.method() === "POST" ? request.postDataJSON()?.symbols || [] : (url.searchParams.get("symbols") || "").split(",");
      data = Object.fromEntries(symbols.map((symbol: string) => [symbol, { symbol, price_paise: 10100, source: "angelone_live", updated_at: new Date().toISOString() }]));
    }
    await route.fulfill({ headers, json: { success: true, data } });
  });
  await page.goto("/portfolio");
  if (product === "INTRADAY") await page.getByRole("button", { name: /Positions · Intraday/ }).click();
  return { keys, exit: product === "DELIVERY" ? page.getByTitle("Sell / Exit Holding") : page.getByRole("button", { name: "Exit APARINDS position", exact: true }) };
}

test("closed-market position exit shows a dismissible notice and preserves the open position and retry key", async ({ page, context }) => {
  const { keys, exit } = await setup(page, context, "INTRADAY");
  await exit.click();
  const notice = page.getByRole("status").filter({ hasText: "Market closed" });
  await expect(notice).toContainText("APARINDS: Market is closed for Dussehra.");
  await expect(notice).toContainText("Please try again during the next trading session.");
  await expect(page.getByText("Stable diagnostic details & error tracing")).toHaveCount(0);
  await expect(exit).toBeEnabled();
  expect(keys).toHaveLength(1);
  expect(keys[0]).toBeTruthy();
  await page.getByRole("button", { name: "Dismiss Market closed notification" }).click();
  await expect(notice).toHaveCount(0);
  await exit.click();
  await expect(notice).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
});

test("holding exits show the same notification within a mobile viewport", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { exit } = await setup(page, context, "DELIVERY");
  await exit.click();
  const notice = page.getByRole("status").filter({ hasText: "Market closed" });
  await expect(notice).toContainText("Market is closed for Dussehra");
  const box = await notice.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await expect(page.getByText("Stable diagnostic details & error tracing")).toHaveCount(0);
  await expect(exit).toBeEnabled();
});

test("explicit market-closed rejections use the notification for bulk MIS actions", async ({ page, context }) => {
  await setup(page, context, "INTRADAY", { status: 400, code: "MARKET_CLOSED", message: holiday });
  await page.getByRole("button", { name: "Square Off All MIS", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Market closed" })).toContainText("Market is closed for Dussehra");
  await expect(page.getByText("Stable diagnostic details & error tracing")).toHaveCount(0);
});

for (const failure of [
  { status: 500, code: "SQUAREOFF_FAILED", message: "Unable to check whether market is closed" },
  { status: 400, code: "QUOTE_STALE", message: "Market quote is stale; cannot square off position" },
]) test(`${failure.code} HTTP ${failure.status} retains error diagnostics`, async ({ page, context }) => {
  const { exit } = await setup(page, context, "INTRADAY", failure);
  await exit.click();
  await expect(page.getByText("Stable diagnostic details & error tracing")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Market closed" })).toHaveCount(0);
  await expect(page.getByText(failure.message, { exact: true })).toBeVisible();
});
