import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
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
  const requests: string[] = [];
  let socket: WebSocketRoute | undefined;
  let connections = 0;
  const messages: { action: string; symbols?: string[] }[] = [];
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
    document.cookie = `stocksim_session=${value}; Path=/; SameSite=Lax`;
    localStorage.setItem("stock_sim_theme", "light");
  }, token);
  await page.routeWebSocket("**/ws/market", (ws) => {
    connections++;
    socket = ws;
    ws.onMessage((message) => {
      messages.push(JSON.parse(String(message)));
      if (JSON.parse(String(message)).action === "ping")
        ws.send(JSON.stringify({ type: "pong" }));
    });
  });
  await page.route(/\/api\/(?:v1|backend)\//, async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.replace(/^\/api\/(?:v1|backend)/, "");
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:3100",
      ...(path === "/auth/login" ? {"set-cookie": "stocksim_session=browser-trader; Path=/; SameSite=Lax"} : {}),
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers":
        "authorization,content-type,idempotency-key",
    };
    if (req.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    requests.push(path);
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
    requests,
    messages,
    connectionCount: () => connections,
    disconnect: () => socket?.close({ code: 1012, reason: "Fixture reconnect" }),
    tick: (price: number, timestamp = new Date().toISOString()) =>
      socket?.send(
        JSON.stringify({ type: "quote", quote: { ...quote("RELIANCE-EQ", price), updated_at: timestamp } }),
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
  if (process.env.PLATFORM_PREVIEW_CAPTURE) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.locator("canvas").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: process.env.PLATFORM_PREVIEW_CAPTURE });
  }
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

test("original mobile stock ticket keeps its inputs locked after an uncertain order", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const control = await setup(page, { uncertain: true });
  const ticket = page.getByRole("region", { name: "Paper order ticket" });
  await ticket.getByLabel("Quantity", { exact: true }).fill("3");
  await ticket.getByLabel("Product", { exact: true }).selectOption("INTRADAY");
  await ticket.getByRole("checkbox", { name: /Confirm BUY/ }).check();
  if (process.env.STOCK_UI_SCREENSHOTS) {
    await ticket.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(process.env.STOCK_UI_SCREENSHOTS, "stock-order-mobile.png") });
  }
  await ticket.getByRole("button", { name: "Place paper order", exact: true }).click();
  await expect(ticket.getByText("Order result is uncertain. Review Orders before placing another order.", { exact: true })).toBeVisible();
  await expect(ticket.getByLabel("Quantity", { exact: true })).toBeDisabled();
  await expect(ticket.getByRole("button", { name: "Review order result", exact: true })).toBeDisabled();
  expect(control.posts).toHaveLength(1);
  expect(control.errors).toEqual([]);
});

test("trading navigation updates subscriptions on one socket and reconnect replays current targets", async ({ page }) => {
  const control = await setup(page);
  await expect.poll(() => control.messages.some(m => m.action === "subscribe" && m.symbols?.includes("RELIANCE-EQ"))).toBe(true);
  const initialConnections = control.connectionCount();
  await page.getByRole("link", { name: "Stocks", exact: true }).first().click();
  await expect(page).toHaveURL(/\/stocks$/);
  await expect.poll(() => control.messages.some(m => m.action === "unsubscribe" && m.symbols?.includes("RELIANCE-EQ"))).toBe(true);
  expect(control.connectionCount()).toBe(initialConnections);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Reliance Industries", exact: true })).toBeVisible();
  expect(control.connectionCount()).toBe(initialConnections);
  const beforeReconnect = control.messages.length;
  await control.disconnect();
  await expect.poll(control.connectionCount).toBe(initialConnections + 1);
  await expect.poll(() => control.messages.slice(beforeReconnect).some(m => m.action === "subscribe" && m.symbols?.includes("RELIANCE-EQ"))).toBe(true);
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
        document.cookie = `stocksim_session=${value}; Path=/; SameSite=Lax`;
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

// Browser clock advances every timer; HTTP responses are awaited between ticks.
// This measures request counts in a controlled window, not network latency.
test("display polling profile: healthy stream then silent stall", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  const control = await setup(page);
  await expect.poll(() => control.messages.some(m => m.symbols?.includes("RELIANCE-EQ"))).toBe(true);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const count = (path: string) => control.requests.filter(p => p === path).length;
  const quotePath = "/market/quotes/RELIANCE-EQ";
  const initial = count(quotePath);
  let ticks = 0;
  const tick = async () => {
    const price = 148000 + ticks++ * 100;
    control.tick(price, await page.evaluate(() => new Date().toISOString()));
    await page.clock.runFor(100);
    await expect(page.locator('header[aria-label="Stock identity"]').getByText(`₹${(price / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, { exact: true })).toBeVisible();
  };
  await tick();
  for (let i = 0; i < 6; i++) {
    await page.clock.runFor(5000);
    await tick();
  }
  const healthyDisplayRequests = count(quotePath) - initial;
  expect(healthyDisplayRequests).toBe(0);
  const previewRequests = count("/orders/preview");
  await page.clock.runFor(35000);
  await expect.poll(() => count(quotePath)).toBeGreaterThan(initial + healthyDisplayRequests);
  const stalledDisplayRequests = count(quotePath) - initial - healthyDisplayRequests;
  // A resumed stream stops display timers again, while account invalidation
  // remains immediate after a successful order POST.
  await tick();
  const walletBefore = count("/wallet");
  await page.getByRole("checkbox", { name: /Confirm BUY/ }).check();
  await page.getByRole("button", { name: "Place paper order", exact: true }).click();
  await expect.poll(() => count("/wallet")).toBeGreaterThan(walletBefore);
  expect(control.posts).toHaveLength(1);
  if (process.env.POLLING_PROFILE_OUTPUT) {
    mkdirSync(process.env.POLLING_PROFILE_OUTPUT, { recursive: true });
    writeFileSync(join(process.env.POLLING_PROFILE_OUTPUT, "polling.json"), JSON.stringify({ conditions: "Local production, mobile 390x844; real browser with API/WS fixtures and controlled clock. 30s stream ticks each 5s, then 35s silent socket.", healthyDisplayRequests, stalledDisplayRequests, previewRequests, errors: control.errors }, null, 2) + "\n");
  }
  expect(previewRequests).toBeGreaterThan(1);
  expect(control.errors).toEqual([]);
});

test("closed-session display uses a minute cadence while account queries remain authoritative", async ({ page }) => {
  await page.clock.install();
  const control = await setup(page, { closed: true });
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const count = () => control.requests.filter(path => path === "/market/quotes/RELIANCE-EQ").length;
  const initial = count();
  for (let i = 0; i < 6; i++) await page.clock.runFor(5000);
  expect(count()).toBe(initial);
  for (let i = 0; i < 8; i++) await page.clock.runFor(5000);
  await expect.poll(count).toBeGreaterThan(initial);
  await expect(page.getByRole("button", { name: "Place paper order", exact: true })).toBeDisabled();
  expect(control.requests.filter(path => path === "/wallet").length).toBeGreaterThan(1);
});

test("socket disconnect restores display polling and reconnect cannot reuse earlier stream health", async ({ page }) => {
  await page.clock.install();
  const control = await setup(page);
  await expect.poll(() => control.messages.some(m => m.symbols?.includes("RELIANCE-EQ"))).toBe(true);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  control.tick(148000, await page.evaluate(() => new Date().toISOString()));
  await page.clock.runFor(100);
  await expect(page.locator('header[aria-label="Stock identity"]').getByText("₹1,480.00", { exact: true })).toBeVisible();
  const initial = control.requests.filter(path => path === "/market/quotes/RELIANCE-EQ").length;
  control.disconnect();
  for (let i = 0; i < 3; i++) await page.clock.runFor(5000);
  await expect.poll(() => control.requests.filter(path => path === "/market/quotes/RELIANCE-EQ").length).toBeGreaterThan(initial);
  expect(control.connectionCount()).toBe(2);
});

test("mobile touch ticket and chart stay usable under CPU throttling", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.addInitScript(() => {
      (window as unknown as { mobileEvents: number[] }).mobileEvents = [];
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) if ((entry as PerformanceEventTiming & { interactionId?: number }).interactionId) (window as unknown as { mobileEvents: number[] }).mobileEvents.push(entry.duration);
      }).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const control = await setup(page);
    await page.getByRole("button", { name: "1D", exact: true }).tap();
    const quantity = page.getByRole("spinbutton", { name: "Quantity", exact: true });
    await quantity.tap();
    await quantity.fill("2");
    await page.getByRole("checkbox", { name: /Confirm BUY/ }).tap();
    await expect(page.getByRole("button", { name: "Place paper order", exact: true })).toBeEnabled();
    expect(control.posts).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    if (process.env.MOBILE_PROFILE_OUTPUT) {
      mkdirSync(process.env.MOBILE_PROFILE_OUTPUT, { recursive: true });
      await page.screenshot({ path: join(process.env.MOBILE_PROFILE_OUTPUT, "stock-ticket-mobile.png"), fullPage: true });
      writeFileSync(join(process.env.MOBILE_PROFILE_OUTPUT, "stock-interactions.json"), JSON.stringify({ conditions: "Local production mobile touch, CPU 4x, fixed REST/WS fixtures; chart timeframe, quantity edit, confirmation toggle; no order submitted. Scripted Event Timing, not field INP.", eventDurationsMs: await page.evaluate(() => (window as unknown as { mobileEvents: number[] }).mobileEvents), errors: control.errors }, null, 2) + "\n");
    }
    expect(control.errors).toEqual([]);
  } finally { await context.close(); }
});
