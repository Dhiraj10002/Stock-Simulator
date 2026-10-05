import { join } from "node:path";
import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
const token = `test.${Buffer.from(JSON.stringify({ user_id: "ui-trader" })).toString("base64url")}.test`;
const future = (
  underlying: string,
  kind = "FUTIDX",
  expiry = "27OCT2099",
  exchange = "NFO",
  lot = 65,
) => ({
  symbol: `${underlying}${expiry}FUT`,
  display_symbol: `${underlying} FUT`,
  name: underlying,
  underlying,
  exchange,
  token: `${exchange}-${underlying}-${expiry}`,
  instrument_type: kind,
  lot_size: lot,
  expiry,
  segment: "FUTURES",
  active: true,
  is_tradable: true,
});
const universe = [
  ...[
    "NIFTY",
    "BANKNIFTY",
    ...Array.from(
      { length: 14 },
      (_, i) => `NIFTY${String(i + 1).padStart(2, "0")}`,
    ),
  ].flatMap((name) => [future(name), future(name, "FUTIDX", "24NOV2099")]),
  future("SENSEX", "FUTIDX", "27OCT2099", "BFO"),
  future("TCS", "FUTSTK", "27OCT2099", "NFO", 225),
  future("TCS", "FUTSTK", "24NOV2099", "NFO", 225),
  future("RELIANCE", "FUTSTK", "27OCT2099", "NFO", 500),
  future("HDFCBANK", "FUTSTK", "27OCT2099", "NFO", 550),
  future("DYNAMIC", "FUTSTK"),
  future("BROKEN", "FUTSTK", "27OCT2099", "NFO", 0),
  future("011NSETEST", "FUTSTK"),
  future("OLD", "FUTIDX", "01JAN2000"),
  { ...future("RETIRED"), is_tradable: false },
];
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
    catalogError?: boolean;
    catalogHang?: boolean;
    empty?: boolean;
    uncertainOrder?: boolean;
    chartError?: boolean;
    equityCount?: number;
    compactView?: boolean;
  } = {},
) {
  const posts: Record<string, unknown>[] = [],
    requests: string[] = [],
    batches: string[][] = [],
    subscriptions: string[][] = [];
  const state = {
    quoteError: false,
    statusError: false,
    catalogError: !!options.catalogError,
    price: 207640,
    volumes: {} as Record<string, number>,
    stockCatalogError: false,
  };
  let socket: WebSocketRoute | undefined;
  const quote = (symbol: string) => ({
    symbol,
    price_paise: state.price,
    change_paise: symbol === "HDFCBANK-EQ" ? -2640 : 2640,
    change_percent:
      symbol === "HDFCBANK-EQ" ? -1.08 : symbol === "TCS-EQ" ? 2.16 : 1.08,
    day_change_available: !symbol.includes("DYNAMIC"),
    volume: state.volumes[symbol] ?? 2745450,
    source: symbol === "SYNTHETIC-EQ" ? "synthetic_gbm" : "angelone_live",
    updated_at: options.closed
      ? "2026-10-02T10:00:00Z"
      : new Date().toISOString(),
    is_quote_stale: !!options.closed,
    open_interest: 949500,
    open_interest_available: !symbol.includes("DYNAMIC"),
  });
  await page.addInitScript((value) => {
    localStorage.setItem("auth_token", value);
    localStorage.setItem("stock_sim_theme", "light");
  }, token);
  await page.routeWebSocket("**/ws/market", (ws) => {
    socket = ws;
    ws.onMessage((message) => {
      const body = JSON.parse(String(message));
      if (body.action === "subscribe") subscriptions.push(body.symbols);
      if (body.action === "ping") ws.send(JSON.stringify({ type: "pong" }));
    });
  });
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
    requests.push(path);
    const fail = async () =>
      route.fulfill({
        status: 503,
        headers,
        json: { success: false, message: "Provider unavailable" },
      });
    let data: unknown;
    if (path === "/auth/me")
      data = { uuid: "ui-trader", name: "Trader", email: "ui@example.com" };
    else if (path === "/market/status") {
      if (state.statusError) {
        await fail();
        return;
      }
      data = {
        status: options.closed ? "CLOSED" : "OPEN",
        is_open: !options.closed,
        feed_provider: "angel_one",
        feed_state: "LIVE",
        is_synthetic: false,
        last_tick: new Date().toISOString(),
      };
    } else if (path === "/instruments/futures") {
      if (options.catalogHang) return;
      if (state.catalogError) {
        await fail();
        return;
      }
      data = options.empty ? [] : universe;
    } else if (path === "/instruments/derivative-stocks") {
      if (state.stockCatalogError) {
        await fail();
        return;
      }
      data = [
        "RELIANCE",
        "HDFCBANK",
        "TCS",
        "DYNAMIC",
        "MISSING",
        "SYNTHETIC",
        "011NSETEST",
        ...Array.from(
          { length: options.equityCount || 0 },
          (_, i) => `STOCK${i}`,
        ),
      ].map((name) => ({
        symbol: `${name}-EQ`,
        name,
        token: name,
        exchange: "NSE",
        instrument_type: "EQUITY",
        lot_size: 1,
        active: true,
        is_tradable: true,
      }));
    } else if (path === "/instruments") data = [];
    else if (path === "/market/quotes/batch") {
      const symbols = (url.searchParams.get("symbols") || "").split(",");
      batches.push(symbols);
      if (state.quoteError) {
        await fail();
        return;
      }
      data = options.unavailable
        ? {}
        : Object.fromEntries(
            symbols.filter((s) => s !== "MISSING-EQ").map((s) => [s, quote(s)]),
          );
    } else if (path.endsWith("/history")) {
      if (options.chartError) {
        await fail();
        return;
      }
      expect(url.searchParams.get("interval")).toBe("ONE_DAY");
      data = Array.from({ length: 5 }, (_, i) => ({
        timestamp: Math.floor(Date.now() / 1000) - (5 - i) * 86400,
        open_paise: 205000 + i * 1000,
        high_paise: 210000 + i * 1000,
        low_paise: 203000 + i * 1000,
        close_paise: 207000 + i * 1000,
        volume: 3000,
        source: "angelone_live",
        feed_mode: "LIVE",
      }));
    } else if (path.startsWith("/market/quotes/")) {
      if (state.quoteError || options.unavailable) {
        await fail();
        return;
      }
      data = quote(path.split("/").at(-1)!);
    } else if (path === "/wallet" && !options.accountError)
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
            symbol: "TCS27OCT2099FUT",
            product: "INTRADAY",
            instrument_type: "FUTSTK",
            quantity: 225,
            average_price_paise: 200000,
            current_price_paise: 207640,
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
        estimated_price_paise: state.price,
      };
    else if (path === "/orders" && req.method() === "POST") {
      const body = req.postDataJSON();
      posts.push(body);
      if (options.uncertainOrder) {
        await route.abort("failed");
        return;
      }
      data = { ...body, uuid: "paper-1", status: "PENDING" };
    } else if (["/watchlist", "/news", "/orders", "/trades"].includes(path))
      data = [];
    else {
      await fail();
      return;
    }
    await route.fulfill({ headers, json: { success: true, data } });
  });
  await page.goto("/options");
  await expect(
    page.getByRole("heading", { name: "Popular stocks", exact: true }),
  ).toBeVisible();
  if (!options.compactView)
    await page
      .getByRole("button", { name: "Browse all futures", exact: true })
      .click();
  return {
    posts,
    requests,
    batches,
    subscriptions,
    state,
    tick: (symbol: string, price: number) => {
      socket?.send(
        JSON.stringify({
          type: "quote",
          quote: {
            ...quote(symbol),
            price_paise: price,
            updated_at: new Date(Date.now() + 500).toISOString(),
          },
        }),
      );
    },
  };
}
const card = (page: Page, symbol = "BANKNIFTY27OCT2099FUT") =>
  page.getByRole("article", { name: `${symbol} futures card`, exact: true });
async function refresh(page: Page) {
  const button = page.getByRole("button", {
    name: "Refresh data",
    exact: true,
  });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(button).toBeEnabled();
}

test("restored market layout excludes All stocks, option chain and test scrips; futures filters and requests remain dynamic", async ({
  page,
}) => {
  const control = await setup(page);
  await expect(
    card(page).getByText("₹2,076.40", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "All stocks", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Option Chain", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "F&O stocks", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Futures market", exact: true })
      .getByRole("article"),
  ).toHaveCount(12);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Showing 13–17 of 17")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Futures market", exact: true })
      .getByRole("article"),
  ).toHaveCount(5);
  await page
    .getByLabel("Futures exchange", { exact: true })
    .selectOption("BFO");
  await expect(card(page, "SENSEX27OCT2099FUT")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Futures market", exact: true })
      .getByRole("article"),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Stock futures", exact: true })
    .click();
  await page
    .getByLabel("Futures underlying", { exact: true })
    .selectOption("TCS");
  await expect(
    card(page, "TCS27OCT2099FUT").getByText("Lot 225"),
  ).toBeVisible();
  await page.getByLabel("Futures expiry", { exact: true }).selectOption("");
  await expect(
    page
      .getByRole("region", { name: "Futures market", exact: true })
      .getByRole("article"),
  ).toHaveCount(2);
  await page.getByLabel("Search futures contracts").fill("24NOV");
  await expect(card(page, "TCS24NOV2099FUT")).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Futures market", exact: true })
      .getByRole("article"),
  ).toHaveCount(1);
  await page.getByLabel("Search futures contracts").fill("missing");
  await expect(
    page.getByRole("heading", { name: "No matching futures" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await expect(page.getByText(/011NSETEST/)).toHaveCount(0);
  expect(
    control.requests.filter((path) =>
      /derivative-underlyings|option-chain/.test(path),
    ),
  ).toEqual([]);
  expect(
    control.batches.every((batch) =>
      batch.every((symbol) => symbol.endsWith("FUT"))
        ? batch.length <= 100
        : batch.length <= 100,
    ),
  ).toBe(true);
  expect(
    control.subscriptions.flat().filter((symbol) => symbol.endsWith("FUT")),
  ).not.toContain("011NSETEST27OCT2099FUT");
});

test("stream updates prices; REST and exchange failures disable execution until recovery", async ({
  page,
}) => {
  const control = await setup(page);
  const view = card(page),
    buy = view.getByRole("button", {
      name: "Buy BANKNIFTY27OCT2099FUT",
      exact: true,
    });
  await expect(buy).toBeEnabled();
  control.tick("BANKNIFTY27OCT2099FUT", 211500);
  await expect(view.getByText("₹2,115.00", { exact: true })).toBeVisible();
  control.state.quoteError = true;
  await refresh(page);
  await expect(
    view.getByText("Angel One · Last available", { exact: true }),
  ).toBeVisible();
  await expect(buy).toBeDisabled();
  await expect(view.getByText("₹2,115.00", { exact: true })).toBeVisible();
  control.state.quoteError = false;
  control.state.statusError = true;
  await refresh(page);
  await expect(
    page.getByText(
      "Exchange status cannot be confirmed. Paper trading is paused.",
    ),
  ).toBeVisible();
  await expect(buy).toBeDisabled();
  control.state.statusError = false;
  await refresh(page);
  await expect(buy).toBeEnabled();
  control.state.price = 218000;
  await refresh(page);
  await expect(view.getByText("₹2,180.00", { exact: true })).toBeVisible();
});

test("paper buy and sell use canonical lots, preserve pending and block invalid lot", async ({
  page,
}) => {
  const { posts } = await setup(page);
  await page
    .getByRole("button", { name: "Stock futures", exact: true })
    .click();
  await expect(
    card(page, "BROKEN27OCT2099FUT").getByRole("button", {
      name: "Buy BROKEN27OCT2099FUT",
    }),
  ).toBeDisabled();
  await card(page, "TCS27OCT2099FUT")
    .getByRole("button", { name: "Buy TCS27OCT2099FUT", exact: true })
    .click();
  const submit = page.getByRole("button", {
    name: "BUY 225 TCS27OCT2099FUT (1 LOT)",
    exact: true,
  });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole("dialog", { name: "Paper order ticket" }).getByText(/Order paper-1: PENDING/)).toBeVisible();
  await expect(submit).toBeDisabled();
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    quantity: 225,
    symbol: "TCS27OCT2099FUT",
    side: "BUY",
    product: "FNO",
  });
  await page.getByRole("button", { name: "Close paper order ticket" }).click();
  await card(page, "TCS27OCT2099FUT")
    .getByRole("button", { name: "Sell TCS27OCT2099FUT", exact: true })
    .click();
  const sell = page.getByRole("button", {
    name: "SELL 225 TCS27OCT2099FUT (1 LOT)",
    exact: true,
  });
  await expect(sell).toBeEnabled();
  await sell.click();
  expect(posts).toHaveLength(2);
  expect(posts[1]).toMatchObject({ quantity: 225, side: "SELL" });
});

test("paper ticket retains virtual funds while preview refreshes and blocks failed estimates", async ({
  page,
}) => {
  const { posts } = await setup(page);
  let hold = false;
  let release: (() => void) | undefined;
  await page.route("**/api/v1/orders/preview", async (route) => {
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:3100",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
    };
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (hold) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.fulfill({
        status: 503,
        headers,
        json: { success: false, message: "Market quote is stale" },
      });
      return;
    }
    await route.fulfill({
      headers,
      json: {
        success: true,
        data: {
          required_funds_paise: 10000000,
          available_balance_paise: 90000000,
          estimated_price_paise: 207640,
          sufficient_funds: true,
        },
      },
    });
  });
  await page
    .getByRole("button", { name: "Stock futures", exact: true })
    .click();
  await card(page, "TCS27OCT2099FUT")
    .getByRole("button", { name: "Buy TCS27OCT2099FUT", exact: true })
    .click();
  const ticket = page.getByRole("dialog", { name: "Paper order ticket" });
  const submit = ticket.getByRole("button", {
    name: "BUY 225 TCS27OCT2099FUT (1 LOT)",
    exact: true,
  });
  await expect(submit).toBeEnabled();
  hold = true;
  await expect(
    ticket.getByRole("button", { name: "Intraday (MIS)" }),
  ).toBeDisabled();
  await expect(
    ticket.getByText("Not charged by simulator", { exact: true }),
  ).toBeVisible();
  await expect(
    ticket.getByText("Refreshing server estimate…", { exact: true }),
  ).toBeVisible();
  await expect(ticket.getByText("₹1,00,000.00", { exact: true })).toBeVisible();
  await expect(ticket.getByText("₹9,00,000.00", { exact: true })).toBeVisible();
  await expect(submit).toBeDisabled();
  await expect.poll(() => typeof release).toBe("function");
  release?.();
  await expect(
    ticket.getByText("Preview unavailable: Market quote is stale", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(ticket.getByText("₹9,00,000.00", { exact: true })).toBeVisible();
  await expect(submit).toBeDisabled();
  expect(posts).toHaveLength(0);
});

test("mobile order ticket stays within viewport and pauses when exchange status fails", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const control = await setup(page);
  await expect(
    page
      .getByRole("region", { name: "Futures market", exact: true })
      .getByRole("article"),
  ).toHaveCount(6);
  await card(page)
    .getByRole("button", { name: "Buy BANKNIFTY27OCT2099FUT", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Paper order ticket" });
  await expect(dialog).toBeVisible();
  for (const label of ["Expiry", "Lot size", "Total quantity"]) await expect(dialog.getByText(label, { exact: true })).toBeVisible();
  await expect(dialog.locator("details")).not.toHaveAttribute("open");
  const box = await dialog.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(360);
  expect(box!.height).toBeLessThanOrEqual(800);
  expect(await dialog.evaluate((e) => e.scrollWidth)).toBeLessThanOrEqual(
    Math.ceil(box!.width),
  );
  const submit = dialog.getByRole("button", { name: "BUY 65 BANKNIFTY27OCT2099FUT (1 LOT)", exact: true });
  await expect(submit).toBeInViewport();
  await expect(dialog.getByText("Required additional funds:", { exact: true })).toBeInViewport();
  if (process.env.STOCK_UI_SCREENSHOTS) await page.screenshot({ path: join(process.env.STOCK_UI_SCREENSHOTS, "fno-ticket-mobile.png") });
  control.state.statusError = true;
  await expect(
    dialog.getByText("Exchange status unavailable. Trading paused.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    dialog.getByRole("button", {
      name: "BUY 65 BANKNIFTY27OCT2099FUT (1 LOT)",
      exact: true,
    }),
  ).toBeDisabled();
  expect(control.posts).toHaveLength(0);
  await dialog.getByRole("button", { name: "Close paper order ticket", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.locator("summary")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog.locator("details")).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("uncertain order response never permits resubmission from the ticket", async ({
  page,
}) => {
  const { posts } = await setup(page, { uncertainOrder: true });
  await card(page)
    .getByRole("button", { name: "Buy BANKNIFTY27OCT2099FUT", exact: true })
    .click();
  const submit = page.getByRole("button", {
    name: "BUY 65 BANKNIFTY27OCT2099FUT (1 LOT)",
    exact: true,
  });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(
    page.getByText(/Review Orders before placing another order/),
  ).toBeVisible();
  await expect(submit).toBeDisabled();
  expect(posts).toHaveLength(1);
});

test("closed session retains real last prices, unavailable fields and honest account state", async ({
  page,
}) => {
  const { posts } = await setup(page, { closed: true, accountError: true });
  await expect(
    card(page).getByText("Angel One · Last available", { exact: true }),
  ).toBeVisible();
  await expect(
    card(page).getByRole("button", {
      name: "Buy BANKNIFTY27OCT2099FUT",
      exact: true,
    }),
  ).toBeDisabled();
  const summary = page.getByRole("region", { name: "F&O margin summary" });
  await expect(
    summary.getByText("Portfolio unavailable. Exposure cannot be confirmed."),
  ).toBeVisible();
  await expect(summary.getByText("₹0.00", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Stock futures", exact: true })
    .click();
  const dynamic = card(page, "DYNAMIC27OCT2099FUT");
  await expect(
    dynamic.getByText("Day change unavailable", { exact: true }),
  ).toBeVisible();
  await expect(dynamic.getByText("Unavailable", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View derivative positions" }).click();
  await expect(
    page
      .getByRole("tabpanel")
      .getByText("Portfolio unavailable. Exposure cannot be confirmed."),
  ).toBeVisible();
  expect(posts).toHaveLength(0);
});

test("unavailable quotes and catalog recover without fake prices", async ({
  page,
}) => {
  const control = await setup(page, { unavailable: true, catalogError: true });
  await expect(
    page.getByText(
      "Futures catalog unavailable. Check backend and instrument master health.",
    ),
  ).toBeVisible();
  control.state.catalogError = false;
  await page.getByRole("button", { name: "Retry futures catalog" }).click();
  await expect(
    card(page).getByText("Quote unavailable", { exact: true }),
  ).toBeVisible();
  await expect(
    card(page).getByRole("button", {
      name: "Buy BANKNIFTY27OCT2099FUT",
      exact: true,
    }),
  ).toBeDisabled();
});

test("hanging master request becomes an actionable error rather than an infinite loader", async ({
  page,
}) => {
  await setup(page, { catalogHang: true });
  await expect(
    page.getByRole("button", { name: "Retry futures catalog" }),
  ).toBeVisible({ timeout: 12000 });
  await expect(
    page.getByText("Loading current futures contracts…", { exact: true }),
  ).toHaveCount(0);
});

test("empty master and signed-out account stay explicit", async ({ page }) => {
  await setup(page, { empty: true });
  await expect(
    page.getByRole("heading", {
      name: "No current futures in the instrument master",
    }),
  ).toBeVisible();
  await page.evaluate(() => {
    localStorage.removeItem("auth_token");
    window.dispatchEvent(new Event("auth-changed"));
  });
  await expect(
    page.getByText("Sign in to view your paper account."),
  ).toBeVisible();
  await page.getByRole("button", { name: "View derivative positions" }).click();
  await expect(
    page.getByText("Sign in to view derivative positions."),
  ).toBeVisible();
});

test("light/dark and mobile/tablet layouts have readable cards and no overlapping margin panel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await setup(page, { closed: true });
  const view = card(page),
    summary = page.getByRole("region", { name: "F&O margin summary" });
  await expect(view.getByText("₹2,076.40", { exact: true })).toBeVisible();
  expect(
    await view
      .getByText("₹2,076.40", { exact: true })
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(24);
  const color = async () =>
    summary.evaluate((e) => ({
      background: getComputedStyle(e).backgroundColor,
      color: getComputedStyle(e).color,
    }));
  const light = await color();
  expect(light.background).toBe("rgb(255, 255, 255)");
  expect(light.color).not.toBe(light.background);
  expect(
    await summary.locator("..").evaluate((e) => getComputedStyle(e).position),
  ).toBe("static");
  if (process.env.STOCK_UI_SCREENSHOTS)
    await page.screenshot({
      path: join(process.env.STOCK_UI_SCREENSHOTS!, "fno-light.png"),
      fullPage: true,
    });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  const dark = await color();
  expect(dark.background).not.toBe(light.background);
  expect(dark.color).not.toBe(dark.background);
  if (process.env.STOCK_UI_SCREENSHOTS)
    await page.screenshot({
      path: join(process.env.STOCK_UI_SCREENSHOTS!, "fno-dark.png"),
      fullPage: true,
    });
  for (const width of [1024, 768, 640, 390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    if (width === 390 && process.env.STOCK_UI_SCREENSHOTS)
      await page.screenshot({
        path: join(process.env.STOCK_UI_SCREENSHOTS!, "fno-mobile.png"),
        fullPage: true,
      });
    await page
      .getByRole("button", { name: "View derivative positions" })
      .click();
    await expect(
      page.getByRole("heading", { name: "TCS27OCT2099FUT", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.getByRole("button", { name: /Back to F&O Explore/i }).click();
  }
});

test("featured native candles and canonical lots lead to current futures; gainers and losers use real available movement", async ({
  page,
}) => {
  const control = await setup(page);
  const featured = page.getByRole("region", { name: "Featured F&O stocks" });
  await expect(featured.getByRole("article")).toHaveCount(3);
  for (const symbol of ["RELIANCE", "HDFCBANK", "TCS"])
    await expect(
      featured.getByRole("img", {
        name: `${symbol}-EQ provider daily candles`,
      }),
    ).toBeVisible();
  await expect(
    featured
      .getByRole("article", { name: "TCS stock card" })
      .getByText("Futures lot: 225"),
  ).toBeVisible();
  const movers = page.getByRole("region", { name: "F&O stocks", exact: true });
  await expect(
    movers.getByRole("heading", { name: "F&O stocks" }),
  ).toBeVisible();
  await expect(movers.getByRole("row").nth(1).getByRole("link")).toContainText(
    "TCS",
  );
  await expect(movers.getByRole("row")).toHaveCount(3);
  control.tick("RELIANCE-EQ", 211500);
  await expect(
    featured
      .getByRole("article", { name: "RELIANCE stock card" })
      .getByText("₹2,115.00", { exact: true }),
  ).toBeVisible();
  await expect(
    movers
      .getByRole("row")
      .filter({ hasText: "RELIANCE" })
      .getByText("₹2,115.00", { exact: true }),
  ).toBeVisible();
  await movers.getByRole("button", { name: "Losers", exact: true }).click();
  await expect(movers.getByRole("row")).toHaveCount(2);
  await expect(movers.getByRole("row").nth(1)).toContainText("HDFCBANK");
  await expect(movers.getByRole("row").nth(1)).toContainText("-26.40 (-1.08%)");
  await featured
    .getByRole("button", { name: "Trade futures for TCS", exact: true })
    .click();
  await expect(
    page.getByLabel("Futures underlying", { exact: true }),
  ).toHaveValue("TCS");
  await expect(card(page, "TCS27OCT2099FUT")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Chain", exact: true }),
  ).toHaveCount(0);
});

test("failed archives and missing quotes stay explicit; eligible catalog retries recover", async ({
  page,
}) => {
  const control = await setup(page, { chartError: true, unavailable: true });
  const featured = page.getByRole("region", { name: "Featured F&O stocks" });
  await expect(
    featured.getByText("Chart unavailable", { exact: true }),
  ).toHaveCount(3);
  await expect(featured.getByRole("img")).toHaveCount(0);
  await expect(featured.getByText("₹0.00", { exact: true })).toHaveCount(0);
  const movers = page.getByRole("region", { name: "F&O stocks", exact: true });
  await expect(
    movers.getByText("No gainers with available provider day movement.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(movers.getByRole("row")).toHaveCount(0);
  control.state.stockCatalogError = true;
  await refresh(page);
  await expect(
    movers.getByRole("button", { name: "Retry stock catalog" }),
  ).toBeVisible();
  control.state.stockCatalogError = false;
  await movers.getByRole("button", { name: "Retry stock catalog" }).click();
  await expect(
    movers.getByText("No gainers with available provider day movement.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("complete eligible stock universe uses batches of at most 100 and only visible movers receive stream subscriptions", async ({
  page,
}) => {
  const control = await setup(page, { equityCount: 205 });
  const movers = page.getByRole("region", { name: "F&O stocks", exact: true });
  await expect(
    movers.getByRole("heading", { name: "F&O stocks" }),
  ).toBeVisible();
  const equityBatches = control.batches.filter((batch) =>
    batch.some((s) => s.endsWith("-EQ")),
  );
  expect(
    equityBatches.map((batch) => batch.length).sort((a, b) => b - a),
  ).toEqual([100, 100, 11]);
  const equitySubscriptions = new Set(
    control.subscriptions.flat().filter((s) => s.endsWith("-EQ")),
  );
  expect(equitySubscriptions.size).toBeLessThanOrEqual(9);
  expect(equitySubscriptions.has("STOCK204-EQ")).toBe(false);
  expect(
    control.requests.filter(
      (path) =>
        path.startsWith("/market/quotes/") &&
        !path.endsWith("/history") &&
        path !== "/market/quotes/batch",
    ),
  ).toEqual([]);
});

test("compact F&O discovery follows the requested headings and dynamically ranks real index volume", async ({
  page,
}) => {
  const control = await setup(page, { compactView: true });
  for (const name of [
    "Popular stocks",
    "F&O stocks",
    "Top traded index futures",
  ])
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Futures market", exact: true }),
  ).toBeHidden();
  const top = page.getByRole("region", {
    name: "Top traded index futures",
    exact: true,
  });
  await expect(top.getByRole("article")).toHaveCount(4);
  // Top cards must trade without requiring the full browser to be opened.
  await top
    .getByRole("button", { name: /^Trade / })
    .first()
    .click();
  const topTicket = page.getByRole("dialog");
  await expect(
    topTicket.getByRole("button", { name: /Buy .*lot/i }),
  ).toBeEnabled();
  await topTicket.getByRole("button", { name: /close/i }).click();
  for (const card of await page
    .getByRole("region", { name: "Featured F&O stocks" })
    .getByRole("article")
    .all()) {
    const box = await card.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(190);
  }
  control.state.volumes["NIFTY1427OCT2099FUT"] = 9999999;
  await page
    .getByRole("button", { name: "Browse all futures", exact: true })
    .click();
  await refresh(page);
  await expect(top.getByRole("article").first()).toHaveAttribute(
    "aria-label",
    "NIFTY1427OCT2099FUT top traded card",
  );
  control.tick("NIFTY1427OCT2099FUT", 215000);
  await expect(
    top.getByRole("article").first().getByText("₹2,150.00", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Hide futures browser", exact: true })
    .click();
  if (process.env.STOCK_UI_SCREENSHOTS)
    await page.evaluate(() => window.scrollTo(0, 0));
  if (process.env.STOCK_UI_SCREENSHOTS)
    await page.screenshot({
      path: join(process.env.STOCK_UI_SCREENSHOTS!, "fno-compact-light.png"),
      fullPage: true,
    });
  for (const width of [1024, 768, 640, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  if (process.env.STOCK_UI_SCREENSHOTS)
    await page.screenshot({
      path: join(process.env.STOCK_UI_SCREENSHOTS!, "fno-compact-mobile.png"),
      fullPage: true,
    });
});

test("Gemini compact cards never invent contracts when the master is empty", async ({
  page,
}) => {
  const control = await setup(page, { compactView: true, empty: true });
  const top = page.getByRole("region", {
    name: "Top traded index futures",
    exact: true,
  });
  await expect(top.getByRole("article")).toHaveCount(0);
  await expect(
    top.getByText("No current index futures available.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("NIFTY-OCT-FUT", { exact: true })).toHaveCount(0);
  expect(control.posts).toEqual([]);
});

test("compact Buy and Sell controls block closed-session paper orders and ticker labels cached data", async ({
  page,
}) => {
  const control = await setup(page, { compactView: true, closed: true });
  const top = page.getByRole("region", {
    name: "Top traded index futures",
    exact: true,
  });
  await expect(top.getByRole("article")).toHaveCount(4);
  const buttons = top.getByRole("button");
  await expect(buttons).toHaveCount(8);
  for (const button of await buttons.all()) await expect(button).toBeDisabled();
  const strip = page.getByRole("region", { name: "Market index strip" });
  await expect(strip.getByText("₹2,076.40", { exact: true })).toHaveCount(5);
  await expect(strip.getByText("Last available", { exact: false })).toHaveCount(
    5,
  );
  await expect(strip.getByText("22,421.95", { exact: false })).toHaveCount(0);
  expect(control.posts).toEqual([]);
});
