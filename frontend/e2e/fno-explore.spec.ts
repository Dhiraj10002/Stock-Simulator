import { test, expect, type Page } from "@playwright/test";
const token = `test.${Buffer.from(JSON.stringify({ user_id: "ui-trader" })).toString("base64url")}.test`;
const equity = (symbol: string, name: string) => ({
  symbol: `${symbol}-EQ`,
  name,
  display_symbol: symbol,
  exchange: "NSE",
  token: symbol,
  instrument_type: "EQUITY",
  underlying: symbol,
  active: true,
  lot_size: 1,
});
const stocks = [
  equity("RELIANCE", "Reliance Industries"),
  equity("HDFCBANK", "HDFC Bank"),
  equity("TCS", "Tata Consultancy Services"),
  equity("DYNAMIC", "New Eligible Stock"),
];
const future = (symbol: string, type = "FUTSTK") => ({
  ...equity(symbol, symbol),
  symbol: `${symbol}27OCT2026FUT`,
  display_symbol: `${symbol} OCT FUT`,
  exchange: "NFO",
  instrument_type: type,
  lot_size: 225,
  expiry: "27OCT2026",
  segment: "FUTURES",
});
const indices = [future("NIFTY", "FUTIDX"), future("BANKNIFTY", "FUTIDX")];
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on("pageerror", (e) => list.push(e.message));
});
test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
async function setup(
  page: Page,
  options: {
    closed?: boolean;
    unavailable?: boolean;
    accountError?: boolean;
  } = {},
) {
  const posts: Record<string, unknown>[] = [];
  let price = 207640;
  await page.addInitScript((value) => {
    localStorage.setItem("auth_token", value);
    localStorage.setItem("stock_sim_theme", "light");
  }, token);
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.replace("/api/v1", "");
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:3100",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers":
        "authorization,content-type,idempotency-key,x-request-id",
    };
    if (req.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const quote = (symbol: string) => ({
      symbol,
      price_paise: price,
      change_paise: symbol.includes("HDFCBANK") ? -1800 : 2640,
      change_percent: symbol.includes("HDFCBANK") ? -2.52 : 1.08,
      day_change_available: !symbol.includes("DYNAMIC"),
      volume: 2745450,
      source: "angelone_live",
      updated_at: options.closed
        ? "2026-10-02T10:00:00Z"
        : new Date().toISOString(),
      is_quote_stale: !!options.closed,
      open_interest: 949500,
      open_interest_available: true,
    });
    let data: unknown;
    if (path === "/auth/me")
      data = { uuid: "ui-trader", name: "Trader", email: "ui@example.com" };
    else if (path === "/market/status")
      data = {
        status: options.closed ? "CLOSED" : "OPEN",
        is_open: !options.closed,
        feed_provider: "angel_one",
        feed_state: "LIVE",
        is_synthetic: false,
        last_tick: new Date().toISOString(),
      };
    else if (path === "/instruments/derivative-stocks") data = stocks;
    else if (path === "/instruments/derivative-underlyings")
      data = ["NIFTY", "BANKNIFTY", "RELIANCE", "HDFCBANK", "TCS", "DYNAMIC"];
    else if (path === "/instruments")
      data =
        url.searchParams.get("instrument_type") === "FUTIDX"
          ? indices
          : url.searchParams.get("instrument_type") === "FUTSTK" &&
              stocks.some(
                (s) => s.underlying === url.searchParams.get("underlying"),
              )
            ? [future(url.searchParams.get("underlying")!)]
            : [];
    else if (path.startsWith("/instruments/"))
      data = future(path.split("/").at(-1)!);
    else if (path === "/market/quotes/batch")
      data = options.unavailable
        ? {}
        : Object.fromEntries(
            (url.searchParams.get("symbols") || "")
              .split(",")
              .map((s) => [s, quote(s)]),
          );
    else if (path.endsWith("/history") && !options.unavailable)
      data = [0, 1, 2, 3, 4].map((i) => ({
        timestamp: Math.floor(Date.now() / 1000) - (5 - i) * 86400,
        open_paise: 205000 + i * 100,
        high_paise: 208000 + i * 100,
        low_paise: 204000,
        close_paise: 207000 + i * 100,
        volume: 2500,
      }));
    else if (path.startsWith("/market/quotes/") && !options.unavailable)
      data = quote(path.split("/").at(-1)!);
    else if (path === "/wallet" && !options.accountError)
      data = {
        available_balance_paise: 90000000,
        cash_balance_paise: 100000000,
        blocked_paise: 10000000,
      };
    else if (path === "/portfolio" && !options.accountError)
      data = {
        valuation_status: "REALTIME",
        unrealized_pnl_paise: 75000,
        positions: [
          {
            uuid: "cash",
            symbol: "CASH",
            product: "INTRADAY",
            instrument_type: "EQUITY",
            quantity: 10,
            unrealized_pnl_paise: 70000,
          },
          {
            uuid: "fno",
            symbol: "TCS27OCT2026FUT",
            product: "INTRADAY",
            instrument_type: "FUTSTK",
            quantity: 225,
            unrealized_pnl_paise: 5000,
            margin_blocked_paise: 10000000,
            is_quote_available: true,
            quote_status: "FRESH",
          },
        ],
      };
    else if (path === "/orders/preview")
      data = {
        required_funds_paise: 10000000,
        available_balance_paise: 90000000,
        sufficient_funds: true,
        estimated_price_paise: price,
      };
    else if (path === "/orders" && req.method() === "POST") {
      const body = req.postDataJSON();
      posts.push(body);
      data = { ...body, uuid: "paper-1", status: "PENDING" };
    } else if (["/watchlist", "/news", "/orders", "/trades"].includes(path))
      data = [];
    else {
      await route.fulfill({
        status: 503,
        headers,
        json: { success: false, message: "Provider unavailable" },
      });
      return;
    }
    await route.fulfill({ headers, json: { success: true, data } });
  });
  await page.goto("/options");
  await expect(
    page.getByRole("heading", { name: "F&O Stocks", exact: true }),
  ).toBeVisible();
  return {
    posts,
    move: () => {
      price = 211500;
    },
  };
}
test("restored cards/table show canonical metadata, native candles and price refresh", async ({
  page,
}) => {
  const control = await setup(page),
    card = page.getByRole("article", { name: "TCS stock card", exact: true });
  await expect(card.getByText("₹2,076.40", { exact: true })).toBeVisible();
  await expect(card.getByText("Futures lot: 225")).toBeVisible();
  await expect(
    card.getByRole("img", { name: "TCS-EQ daily candle preview" }),
  ).toBeVisible();
  const table = page.getByRole("region", { name: "F&O stocks", exact: true });
  await page.getByRole("button", { name: "Gainers", exact: true }).click();
  await expect(
    table.getByText("Reliance Industries", { exact: true }),
  ).toBeVisible();
  await expect(table.getByText("HDFC Bank", { exact: true })).toHaveCount(0);
  await expect(
    table.getByText("New Eligible Stock", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Losers", exact: true }).click();
  await expect(table.getByText("HDFC Bank", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "All stocks", exact: true }).click();
  control.move();
  await expect(card.getByText("₹2,115.00", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  const summary = page.getByRole("region", { name: "F&O margin summary" });
  await expect(
    summary.getByText("₹9,00,000.00", { exact: true }),
  ).toBeVisible();
  await expect(summary.getByText("1 open", { exact: true })).toBeVisible();
  await expect(summary.getByText("₹50.00", { exact: true })).toBeVisible();
});
test("stock trade selects canonical future and submits lot quantity once", async ({
  page,
}) => {
  const { posts } = await setup(page);
  await page
    .getByRole("article", { name: "TCS stock card", exact: true })
    .getByRole("button", { name: "Trade", exact: true })
    .click();
  const section = page.getByRole("region", {
    name: "Selected underlying futures",
  });
  await expect(
    section.getByRole("heading", { name: "TCS · Current futures" }),
  ).toBeVisible();
  await section
    .getByRole("button", { name: "Buy TCS27OCT2026FUT", exact: true })
    .click();
  await expect(page.getByText("FUTURES", { exact: true })).toBeVisible();
  const submit = page.getByRole("button", {
    name: "BUY 225 TCS27OCT2026FUT (1 LOT)",
    exact: true,
  });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText(/Order paper-1: PENDING/)).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0].quantity).toBe(225);
  expect(posts[0].symbol).toBe("TCS27OCT2026FUT");
  await expect(submit).toBeDisabled();
});
test("closed session keeps last prices visible and disables futures execution", async ({
  page,
}) => {
  const { posts } = await setup(page, { closed: true });
  await expect(
    page
      .getByRole("article", { name: "TCS stock card", exact: true })
      .getByText("Last available", { exact: false }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: "Buy NIFTY27OCT2026FUT", exact: true })
      .first(),
  ).toBeDisabled();
  expect(posts).toHaveLength(0);
});
test("missing data stays unavailable without demo charts or account balances", async ({
  page,
}) => {
  await setup(page, { unavailable: true, accountError: true });
  const card = page.getByRole("article", {
    name: "TCS stock card",
    exact: true,
  });
  await expect(
    card.getByText("Chart unavailable", { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText("Day change unavailable", { exact: true }),
  ).toBeVisible();
  await expect(card.getByRole("img")).toHaveCount(0);
  const summary = page.getByRole("region", { name: "F&O margin summary" });
  await expect(
    summary.getByText("Portfolio unavailable. Exposure cannot be confirmed."),
  ).toBeVisible();
  await expect(summary.getByText("₹0.00", { exact: true })).toHaveCount(0);
  await expect(summary.getByText("₹10,00,000.00", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "View Derivative Holdings" }).click();
  await expect(
    page
      .getByRole("status")
      .getByText("Portfolio unavailable. Exposure cannot be confirmed."),
  ).toBeVisible();
});
test("light/dark contrast and mobile sizing preserve readable restored panels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await setup(page, { closed: true });
  const summary = page.getByRole("region", { name: "F&O margin summary" });
  await expect(summary).toBeVisible();
  const light = await summary.evaluate((e) => ({
    background: getComputedStyle(e).backgroundColor,
    color: getComputedStyle(e).color,
  }));
  expect(light.background).toContain("255");
  expect(light.color).not.toBe(light.background);
  if (process.env.FNO_UI_SCREENSHOTS)
    await page.screenshot({
      path: "/tmp/stock-ui-tools/fno-light.png",
      fullPage: true,
    });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  const dark = await summary.evaluate((e) => ({
    background: getComputedStyle(e).backgroundColor,
    color: getComputedStyle(e).color,
  }));
  expect(dark.background).not.toBe(light.background);
  expect(dark.color).not.toBe(dark.background);
  if (process.env.FNO_UI_SCREENSHOTS)
    await page.screenshot({
      path: "/tmp/stock-ui-tools/fno-dark.png",
      fullPage: true,
    });
  await page.setViewportSize({ width: 390, height: 844 });
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  if (process.env.FNO_UI_SCREENSHOTS)
    await page.screenshot({
      path: "/tmp/stock-ui-tools/fno-mobile.png",
      fullPage: true,
    });
  expect(width.content).toBeLessThanOrEqual(width.viewport);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
});
