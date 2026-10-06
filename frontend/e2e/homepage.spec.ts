import { test, expect } from "@playwright/test";

test("original cinematic homepage renders without JavaScript and its footer links work", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3100/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ZERO FINANCIAL RISK.");
  await expect(page.locator("#hero")).toContainText("₹10,00,000 virtual capital");
  for (const id of ["platform", "how", "features", "testimonials", "portal"]) await expect(page.locator(`#${id}`)).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Log In", exact: true })).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", { name: "Sign Up", exact: true })).toHaveAttribute("href", "/signup");
  await expect(page.getByText("SAMPLE DATA", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for (const title of ["About Paper Trading", "Privacy Policy", "Terms of Service"]) {
    await page.goto("http://127.0.0.1:3100/");
    await page.locator("footer").getByRole("link", { name: title, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect((await page.request.get(page.url())).status()).toBe(200);
  }
  await context.close();
});

test("cinematic homepage starts no private requests or market socket for a signed-in visitor", async ({ page }) => {
  const apiRequests: string[] = [], sockets: string[] = [], errors: string[] = [];
  page.on("request", request => { if (request.url().includes("/api/v1/")) apiRequests.push(request.url()); });
  page.on("websocket", socket => { if (socket.url().includes("/ws/market")) sockets.push(socket.url()); });
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("auth_token", "fixture.token"));
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Open Dashboard", exact: true })).toHaveAttribute("href", "/dashboard");
  await page.getByRole("link", { name: "Explore Platform ↓", exact: true }).click();
  await expect(page.locator("#platform")).toBeInViewport();
  await expect(page.locator(".landing-experience")).toHaveAttribute("data-motion-ready", "true");
  expect(apiRequests).toEqual([]);
  expect(sockets).toEqual([]);
  expect(errors).toEqual([]);
});

test("original login modal loads on demand and reduced-motion particles stay still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Close auth modal" })).toHaveCount(0);
  await expect(page.locator(".landing-experience")).toHaveAttribute("data-motion-ready", "true");
  const pixels = await page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.waitForTimeout(150);
  expect(await page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(pixels);
  await page.getByRole("link", { name: "Log In", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Stock Simulator", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close auth modal" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Stock Simulator", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Sign Up", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Create Your Trading Desk", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
