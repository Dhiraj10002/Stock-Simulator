import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const scope = "00000000-0000-0000-0000-000000000001";
async function privateStream(page: Page) {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const encoder = new TextEncoder();
    const state = window as typeof window & {
      accountFrame: (kind: string, revision?: string) => void;
      accountDisconnect: () => void;
      accountConnections: number;
    };
    state.accountConnections = 0;
    window.fetch = async (input, init) => {
      if (typeof input === "string" && input.startsWith("/api/backend/account/events")) {
        state.accountConnections++;
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            state.accountFrame = (kind, revision = "0") => controller.enqueue(encoder.encode("data: " + JSON.stringify({ kind, revision }) + "\n\n"));
            state.accountDisconnect = () => controller.error(new Error("offline"));
            init?.signal?.addEventListener("abort", () => { try { controller.close(); } catch { /* Already cancelled. */ } });
            state.accountFrame("ready");
          },
        }), { headers: { "Content-Type": "text/event-stream" } });
      }
      return original(input, init);
    };
  });
}
async function mocks(page: Page, positions = false) {
  const counts = { wallet: 0, portfolio: 0 };
  await page.routeWebSocket("**/ws/market", ws => ws.onMessage(() => {}));
  await page.route(/\/api\/(?:v1|backend)\//, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/(?:v1|backend)/, "");
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: {
      "access-control-allow-origin": "http://127.0.0.1:3100", "access-control-allow-headers": "content-type",
    } });
    let data: unknown = [];
    if (path === "/auth/me") data = { uuid: scope, name: "Trader" };
    if (path === "/wallet") { counts.wallet++; data = { cash_balance_paise: 100000000, available_balance_paise: 100000000, blocked_paise: 0 }; }
    if (path === "/portfolio") { counts.portfolio++; data = { positions: positions ? [{ symbol: "RELIANCE", quantity: 1 }] : [], unrealized_pnl_paise: 0, valuation_status: "REALTIME" }; }
    if (path === "/market/status") data = { status: "OPEN", is_open: true, feed_state: "LIVE", feed_provider: "angel_one", last_tick: new Date().toISOString() };
    if (path === "/market/quotes/batch") data = Object.fromEntries((request.postDataJSON().symbols || []).map((symbol: string) => [symbol, { symbol, price_paise: 10000, source: "angelone_live", updated_at: new Date().toISOString() }]));
    if (path === "/market/movers") data = { gainers: [], losers: [], most_traded: [], trending: [] };
    await route.fulfill({ json: { success: true, data }, headers: { "access-control-allow-origin": "http://127.0.0.1:3100" } });
  });
  return counts;
}
test("healthy private events reduce account polling and server changes reconcile immediately", async ({ page, context }) => {
  await context.addCookies([{ name: "stocksim_session", value: scope, url: "http://127.0.0.1:3100" }]);
  await privateStream(page);
  const counts = await mocks(page);
  await page.goto("/stocks");
  await expect.poll(() => page.evaluate(() => (window as typeof window & { accountConnections: number }).accountConnections)).toBe(1);
  await expect.poll(() => counts.wallet).toBeGreaterThan(0);
  await page.waitForTimeout(1500); // Settle the first authenticated handshake.
  const initial = { ...counts };
  await page.waitForTimeout(11_000);
  expect(counts.wallet - initial.wallet).toBe(0);
  expect(counts.portfolio - initial.portfolio).toBe(0);
  await page.evaluate(() => (window as typeof window & { accountFrame: (kind: string, revision: string) => void }).accountFrame("change", "00000000-0000-0000-0000-000000000002"));
  await expect.poll(() => counts.wallet).toBeGreaterThan(initial.wallet);
  await expect.poll(() => counts.portfolio).toBeGreaterThan(initial.portfolio);
  if (process.env.POLLING_PROFILE_OUTPUT) {
    mkdirSync(process.env.POLLING_PROFILE_OUTPUT, { recursive: true });
    writeFileSync(process.env.POLLING_PROFILE_OUTPUT + "/account-polling.json", JSON.stringify({ observation_seconds: 11, private_stream_healthy: true, measured_wallet_requests: counts.wallet - initial.wallet - 1, measured_empty_portfolio_requests: counts.portfolio - initial.portfolio - 1, fixture: "Browser protocol; not production user traffic" }, null, 2));
  }
});
test("active positions retain five-second valuation polling and another tab's acceptance refetches wallet", async ({ page, context }) => {
  await context.addCookies([{ name: "stocksim_session", value: scope, url: "http://127.0.0.1:3100" }]);
  await privateStream(page);
  const counts = await mocks(page, true);
  await page.goto("/stocks");
  await expect.poll(() => counts.portfolio).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  const initial = { ...counts };
  await expect.poll(() => counts.portfolio, { timeout: 12_000 }).toBeGreaterThan(initial.portfolio);
  const other = await context.newPage();
  await mocks(other);
  await other.goto("/login");
  await other.evaluate(account => {
    const channel = new BroadcastChannel("stock-simulator-account");
    channel.postMessage({ scope: account });
    channel.close();
  }, scope);
  await expect.poll(() => counts.wallet).toBeGreaterThan(initial.wallet);
  // Logout marker removal and cross-tab storage notification stop private polling.
  await other.evaluate(() => {
    document.cookie = "stocksim_session=; Path=/; Max-Age=0";
    localStorage.setItem("auth-session-change", crypto.randomUUID());
  });
  await page.waitForTimeout(1000);
  const afterLogout = { ...counts };
  await page.waitForTimeout(6000);
  expect(counts).toEqual(afterLogout);
});
test("a broken private stream keeps five-second polling available", async ({ page, context }) => {
  await context.addCookies([{ name: "stocksim_session", value: scope, url: "http://127.0.0.1:3100" }]);
  const counts = await mocks(page);
  await page.goto("/stocks"); // JSON instead of SSE deliberately exercises fallback.
  await expect.poll(() => counts.wallet).toBeGreaterThan(0);
  const initial = counts.wallet;
  await expect.poll(() => counts.wallet, { timeout: 12_000 }).toBeGreaterThan(initial);
});

test("expired cookie refresh is coordinated across two tabs; logout removes the private session", async ({ page, context }) => {
  await context.addCookies([
    { name: "stocksim_session", value: scope, url: "http://127.0.0.1:3100" },
    { name: "stocksim_access", value: "expired-fixture", httpOnly: true, url: "http://127.0.0.1:3100" },
  ]);
  let refreshes = 0;
  let privateSuccesses = 0;
  let loggedOut = false;
  await context.routeWebSocket("**/ws/market", ws => ws.onMessage(() => {}));
  await context.route(/\/api\/(?:v1|backend)\//, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/(?:v1|backend)/, "");
    const headers: Record<string, string> = {};
    if (path === "/auth/refresh") {
      refreshes++;
      await new Promise(resolve => setTimeout(resolve, 100));
      headers["set-cookie"] = "stocksim_access=fresh-fixture; Path=/; HttpOnly; SameSite=Lax";
      return route.fulfill({ headers, json: { success: true, data: { authenticated: true } } });
    }
    if (path === "/auth/logout") {
      loggedOut = true;
      headers["set-cookie"] = "stocksim_access=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax";
      return route.fulfill({ headers, json: { success: true } });
    }
    if (["/wallet", "/portfolio", "/orders", "/trades"].includes(path)) {
      if (loggedOut || !request.headers().cookie?.includes("stocksim_access=fresh-fixture")) return route.fulfill({ status: 401, json: { success: false, message: "Session expired" } });
      privateSuccesses++;
    }
    let data: unknown = [];
    if (path === "/auth/me") data = { uuid: scope, name: "Trader" };
    if (path === "/wallet") data = { cash_balance_paise: 100000000, available_balance_paise: 100000000, blocked_paise: 0 };
    if (path === "/portfolio") data = { positions: [], unrealized_pnl_paise: 0, valuation_status: "REALTIME" };
    await route.fulfill({ json: { success: true, data } });
  });
  const second = await context.newPage();
  await Promise.all([page.goto("/orders"), second.goto("/orders")]);
  await expect.poll(() => privateSuccesses).toBeGreaterThanOrEqual(8);
  expect(refreshes).toBe(1);
  expect(await page.evaluate(() => document.cookie)).not.toContain("stocksim_access");
  expect(await second.evaluate(() => document.cookie)).not.toContain("stocksim_access");
  await second.evaluate(async () => {
    await fetch("/api/backend/auth/logout", { method: "POST", headers: { "X-Requested-With": "stocksim" } });
    document.cookie = "stocksim_session=; Path=/; Max-Age=0";
    localStorage.setItem("auth-session-change", crypto.randomUUID());
    window.dispatchEvent(new Event("auth-changed"));
  });
  const status = await page.evaluate(async () => (await fetch("/api/backend/wallet")).status);
  expect(status).toBe(401);
  await page.waitForTimeout(1000);
  const afterLogout = privateSuccesses;
  await page.waitForTimeout(6000);
  expect(privateSuccesses).toBe(afterLogout);
});
