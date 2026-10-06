import { test, expect } from "@playwright/test";

const headers = {
  "access-control-allow-origin": "http://127.0.0.1:3100",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "authorization,content-type",
};

test("dashboard calendar fits content and index history recovers from provider rejection", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let historyReady = false;
  let calendarRequests = 0;
  const requests: URL[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "test.dashboard.test");
    localStorage.setItem("stock_sim_theme", "light");
  });
  await page.routeWebSocket("**/ws/market", (ws) => {
    ws.onMessage(() => {});
  });
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const path = url.pathname.replace("/api/v1", "");
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    let data: unknown = [];
    if (path === "/auth/me")
      data = {
        uuid: "dashboard",
        name: "Trader",
        email: "fixture@example.com",
      };
    else if (path === "/market/status")
      data = {
        status: "OPEN",
        is_open: true,
        feed_provider: "angel_one",
        feed_state: "LIVE",
        is_synthetic: false,
        last_tick: new Date().toISOString(),
      };
    else if (path === "/wallet")
      data = {
        available_balance_paise: 100000000,
        cash_balance_paise: 100000000,
        blocked_paise: 0,
      };
    else if (path === "/portfolio")
      data = {
        positions: [],
        valuation_status: "REALTIME",
        total_pnl_paise: 0,
      };
    else if (path === "/market/calendar") {
      calendarRequests++;
      data = {
        year: 2026,
        available: true,
        exchange: "NSE cash and equity derivatives",
        version: "fixture",
        source_url: "https://www.nseindia.com",
        holidays: [
          {
            date: "2026-01-26",
            occasion: "Republic Day",
            session_status: "CLOSED",
          },
          {
            date: "2026-12-25",
            occasion: "Christmas",
            session_status: "CLOSED",
          },
        ],
      };
    }
    else if (path.endsWith("/history")) {
      requests.push(url);
      if (!historyReady) {
        await route.fulfill({
          status: 503,
          headers,
          json: {
            success: false,
            message:
              "Angel One historical candles unavailable: broker request failed",
            code: "HISTORY_UNAVAILABLE",
          },
        });
        return;
      }
      data = [2, 1, 0].map((i) => ({
        timestamp: Math.floor(Date.now() / 60000) * 60 - i * 60,
        open_paise: 10000,
        high_paise: 10200,
        low_paise: 9900,
        close_paise: 10100 + i,
        volume: 0,
        source: "angelone_live",
        feed_mode: "LIVE",
      }));
    }
    await route.fulfill({ headers, json: { success: true, data } });
  });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
  const desk = page.getByRole("region", { name: "Market desk" });
  expect(calendarRequests).toBe(0);
  await expect(desk.getByRole("button", { name: "IPOs", exact: true })).toHaveCount(0);
  await desk.getByRole("button", { name: "Holiday Calendar" }).click();
  await expect(desk.getByText("Christmas", { exact: true })).toBeVisible();
  expect(calendarRequests).toBe(1);
  await expect(desk.getByText("Republic Day", { exact: true })).toHaveCount(0);
  await expect(desk).toHaveCSS("align-self", "flex-start");
  await desk.getByRole("button", { name: "Show full year" }).click();
  await expect(desk.getByText("Republic Day", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "SENSEX", exact: true }).click();
  await expect(
    page.getByText("Index Chart Unavailable", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "broker request failed" }),
  ).toBeVisible();
  historyReady = true;
  await page
    .getByRole("button", { name: "Retry history", exact: true })
    .click();
  await expect(page.getByText(/Last plotted bar:/)).toBeVisible();
  await expect(
    page.getByText("Index Chart Unavailable", { exact: true }),
  ).toHaveCount(0);
  expect(
    requests.some(
      (url) =>
        url.pathname.includes("/SENSEX/history") &&
        url.searchParams.get("interval") === "ONE_MINUTE",
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
