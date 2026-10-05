import { join } from "node:path";
import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
const token = `test.${Buffer.from(JSON.stringify({ user_id: "stock-ui-trader" })).toString("base64url")}.test`;
async function setup(
  page: Page,
  options: {
    closed?: boolean;
    unavailable?: boolean;
    uncertain?: boolean;
  } = {},
) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const posts: Record<string, unknown>[] = [];
  let socket: WebSocketRoute | undefined;
  const quote = (symbol: string, price = 147250) => ({
    symbol,
    price_paise: price,
    change_paise: 1250,
    change_percent: 0.86,
    day_change_available: true,
    volume: 1500200,
    source: "angelone_live",
    updated_at: options.closed
      ? "2026-10-02T10:00:00Z"
      : new Date().toISOString(),
    is_quote_stale: !!options.closed,
    open_paise: 145000,
    high_paise: 148000,
    low_paise: 144000,
    previous_close_paise: 146000,
    week_52_high_paise: 170000,
    week_52_low_paise: 110000,
    total_buy_quantity: 200,
    total_sell_quantity: 300,
    depth: {
      bids: [
        { price_paise: 147200, quantity: 50, orders: 7 },
        { price_paise: 147100, quantity: 25 },
      ],
      asks: [{ price_paise: 147300, quantity: 100, orders: 0 }],
    },
  });
  await page.addInitScript((value) => {
    localStorage.setItem("auth_token", value);
    localStorage.setItem("stock_sim_theme", "light");
  }, token);
  await page.routeWebSocket("**/ws/market", (ws) => {
    socket = ws;
    ws.onMessage((message) => {
      if (JSON.parse(String(message)).action === "ping")
        ws.send(JSON.stringify({ type: "pong" }));
    });
  });
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.replace("/api/v1", "");
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:3100",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers":
        "authorization,content-type,idempotency-key",
    };
    if (req.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    let data: unknown = [];
    if (path === "/auth/me")
      data = {
        uuid: "stock-ui-trader",
        name: "Trader",
        email: "fixture@example.com",
      };
    else if (path === "/market/status")
      data = {
        status: options.closed ? "CLOSED" : "OPEN",
        is_open: !options.closed,
        feed_provider: "angel_one",
        feed_state: "LIVE",
        is_synthetic: false,
        last_tick: new Date().toISOString(),
      };
    else if (path.startsWith("/instruments/")) {
      const symbol = path.split("/").pop()!;
      data = {
        symbol: `${symbol}-EQ`,
        name: symbol === "RELIANCE" ? "Reliance Industries" : symbol,
        exchange: "NSE",
        token: "2885",
        instrument_type: "EQUITY",
        active: true,
        is_tradable: true,
        lot_size: 1,
      };
    } else if (path.endsWith("/fundamentals"))
      data = options.unavailable
        ? {
            symbol: "RELIANCE",
            source: "IndianAPI",
            status: "NOT_CONFIGURED",
            message: "A company fundamentals provider is not configured.",
            metrics: [],
          }
        : {
            symbol: path.split("/")[3].replace(/-EQ$/, ""),
            source: "IndianAPI",
            status: "AVAILABLE",
            retrieved_at: "2026-10-02T11:00:00Z",
            metrics: [
              { label: "P/E (TTM)", value: "25.6" },
              { label: "EPS (INR, FY2026)", value: "-12.5" },
              { label: "Dividend yield (%)", value: "0" },
            ],
          };
    else if (path.endsWith("/history")) {
      data = options.unavailable
        ? []
        : Array.from({ length: 20 }, (_, i) => ({
            timestamp: Math.floor(Date.now() / 1000) - (20 - i) * 60,
            open_paise: 146000 + i * 10,
            high_paise: 147500 + i * 10,
            low_paise: 145000 + i * 10,
            close_paise: 147000 + i * 10,
            volume: 3000,
            source: "angelone_live",
            feed_mode: "LIVE",
          }));
    } else if (
      path.startsWith("/market/quotes/") &&
      path !== "/market/quotes/batch"
    ) {
      if (options.unavailable) {
        await route.fulfill({
          status: 404,
          headers,
          json: { success: false, message: "Market quote not found" },
        });
        return;
      }
      data = quote(path.split("/")[3]);
    } else if (path === "/orders/preview")
      data = {
        required_funds_paise: 147250,
        available_balance_paise: 100000000,
        sufficient_funds: true,
        estimated_price_paise: 147250,
        quote_source: "angelone_live",
        quote_updated_at: new Date().toISOString(),
      };
    else if (path === "/orders" && req.method() === "POST") {
      posts.push(req.postDataJSON());
      if (options.uncertain) {
        await route.abort("failed");
        return;
      }
      data = { uuid: "fixture-order", status: "PENDING" };
    } else if (path === "/wallet")
      data = {
        available_balance_paise: 100000000,
        balance_paise: 100000000,
        blocked_balance_paise: 0,
      };
    else if (path === "/risk/overview") data = {};
    else if (path === "/portfolio")
      data = {
        positions: [],
        unrealized_pnl_paise: 0,
        valuation_status: "REALTIME",
      };
    await route.fulfill({ headers, json: { success: true, data } });
  });
  await page.goto("/stocks/RELIANCE");
  await expect(
    page.getByRole("heading", { name: "Reliance Industries", exact: true }),
  ).toBeVisible();
  return {
    errors,
    posts,
    tick: (price: number) =>
      socket?.send(
        JSON.stringify({ type: "quote", quote: quote("RELIANCE-EQ", price) }),
      ),
  };
}
test("stock detail restores the light desk and transports real snapshot fields and stream updates", async ({
  page,
}) => {
  const control = await setup(page);
  const header = page.locator('header[aria-label="Stock identity"]'),
    depth = page.getByRole("region", { name: "Market depth", exact: true }),
    fund = page.getByRole("region", { name: "Company fundamentals" });
  await expect(header.getByText("NSE · Equity")).toBeVisible();
  await expect(header.getByText("₹1,472.50", { exact: true })).toBeVisible();
  await expect(depth.getByRole("row")).toHaveCount(3);
  await expect(depth.getByText("7", { exact: true })).toBeVisible();
  await expect(depth.getByText("0", { exact: true })).toBeVisible();
  await expect(depth.getByText("—", { exact: true })).toHaveCount(4);
  await expect(
    page
      .getByRole("region", { name: "Price performance" })
      .getByText("₹1,700.00", { exact: true }),
  ).toBeVisible();
  await expect(fund.getByText("P/E (TTM)", { exact: true })).toBeVisible();
  await expect(fund.getByText("-12.5", { exact: true })).toBeVisible();
  await expect(
    fund.getByText("Retrieval time is not a financial reporting date.", {
      exact: false,
    }),
  ).toBeVisible();
  control.tick(148000);
  await expect(header.getByText("₹1,480.00", { exact: true })).toBeVisible();
  if (process.env.STOCK_UI_SCREENSHOTS)
    await page.evaluate(() => window.scrollTo(0, 0));
  if (process.env.STOCK_UI_SCREENSHOTS)
    await page.screenshot({
      path: join(process.env.STOCK_UI_SCREENSHOTS!, "stock-light.png"),
      fullPage: true,
    });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  const colors = await header.evaluate((e) => ({
    bg: getComputedStyle(e).backgroundColor,
    fg: getComputedStyle(e).color,
  }));
  expect(colors.bg).not.toBe(colors.fg);
  if (process.env.STOCK_UI_SCREENSHOTS)
    await page.screenshot({
      path: join(process.env.STOCK_UI_SCREENSHOTS!, "stock-dark.png"),
      fullPage: true,
    });
  expect(control.errors).toEqual([]);
});
test("closed and missing stock data stay honest and stock detail is responsive", async ({
  page,
}) => {
  const control = await setup(page, { closed: true, unavailable: true });
  await expect(
    page
      .getByRole("region", { name: "Market depth", exact: true })
      .getByText("Depth is not available", { exact: false }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Company fundamentals" })
      .getByText("A company fundamentals provider is not configured."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Place paper order", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("LIVE", { exact: true })).toHaveCount(0);
  for (const width of [1440, 1024, 768, 640, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await expect(
      page.getByRole("button", { name: "1D", exact: true }),
    ).toBeVisible();
    if (width === 390 && process.env.STOCK_UI_SCREENSHOTS)
      await page.screenshot({
        path: join(process.env.STOCK_UI_SCREENSHOTS!, "stock-mobile.png"),
        fullPage: true,
      });
  }
  expect(control.errors).toEqual([]);
});
for (const uncertain of [false, true])
  test(`cash paper order preserves ${uncertain ? "uncertain" : "pending"} outcome and locks a second POST`, async ({
    page,
  }) => {
    const control = await setup(page, { uncertain });
    await page.getByRole("checkbox", { name: /Confirm BUY/ }).check();
    const place = page.getByRole("button", {
      name: "Place paper order",
      exact: true,
    });
    await expect(place).toBeEnabled();
    await place.click();
    await expect(
      page.getByRole("region", { name: "Paper order ticket" }).getByText(
        uncertain
          ? "Order result is uncertain. Review Orders before placing another order."
          : "Order fixture-order: PENDING. Execution is not confirmed. Review Orders.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Review order result", exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel("Quantity", { exact: true })).toBeDisabled();
    expect(control.posts).toHaveLength(1);
    expect(control.posts[0].symbol).toBe("RELIANCE-EQ");
    expect(control.posts[0].product).toBe("DELIVERY");
    // A routine access-token refresh for this account must not unlock a POST.
    await page.evaluate(
      (value) => {
        localStorage.setItem("auth_token", value);
        window.dispatchEvent(new Event("auth-changed"));
      },
      `test.${Buffer.from(JSON.stringify({ user_id: "stock-ui-trader", exp: 9999999999 })).toString("base64url")}.refreshed`,
    );
    await expect(
      page.getByRole("button", { name: "Review order result", exact: true }),
    ).toBeDisabled();
    expect(control.posts).toHaveLength(1);
    await page.goto("/stocks/TCS");
    // Next.js can retain the previous route in a hidden Activity. Check the
    // visible ticket rather than labels in an inactive, retained route.
    await expect(
      page.getByRole("spinbutton", { name: "Quantity", exact: true }),
    ).toHaveValue("1");
    await expect(
      page.getByRole("checkbox", { name: /Confirm BUY/ }),
    ).not.toBeChecked();
    expect(control.errors).toEqual([]);
  });
