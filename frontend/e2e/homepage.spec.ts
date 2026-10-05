import { test, expect } from "@playwright/test";

test("public homepage renders its purpose, products and working footer without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3100/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Practice Indian stock trading with virtual money.");
  for (const product of ["Delivery (CNC)", "Intraday (MIS)", "Futures & Options"]) await expect(page.getByRole("heading", { name: product, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start paper trading", exact: true }).first()).toHaveAttribute("href", "/signup");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByText("Illustrative preview · sample data", { exact: true })).toBeVisible();
  for (const title of ["About", "Privacy", "Terms"]) {
    await page.goto("http://127.0.0.1:3100/");
    await page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: title, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect((await page.request.get(page.url())).status()).toBe(200);
  }
  await context.close();
});

test("public homepage starts no market or private requests and adapts the authenticated CTA", async ({ page }) => {
  const apiRequests: string[] = [], sockets: string[] = [], errors: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/v1/")) apiRequests.push(request.url()); });
  page.on("websocket", socket => { if (socket.url().includes("/ws/market")) sockets.push(socket.url()); });
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("auth_token", "fixture.token"));
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toHaveAttribute("href", "/dashboard");
  await expect(page.getByRole("link", { name: "Start paper trading", exact: true }).first()).toHaveAttribute("href", "/dashboard");
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("link", { name: "See the platform", exact: true }).click();
  await expect(page.getByRole("img", { name: /Stock Simulator stock details screen/ })).toBeVisible();
  await expect.poll(() => page.getByRole("img", { name: /Stock Simulator stock details screen/ }).evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(apiRequests).toEqual([]);
  expect(sockets).toEqual([]);
  expect(errors).toEqual([]);
});
