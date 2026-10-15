import { test, expect } from "@playwright/test";

for (const intent of ["hover", "focus", "touch"] as const) {
  test(`${intent} warms the original auth modal without mounting it or sending private requests`, async ({ page }, testInfo) => {
    const privateRequests: string[] = [];
    page.on("request", request => {
      if (/\/api\/(backend|v1\/auth)/.test(request.url())) privateRequests.push(request.url());
    });
    await page.goto("/");
    await expect(page.locator(".landing-experience")).toHaveAttribute("data-motion-ready", "true");
    await page.waitForLoadState("networkidle");
    const requests: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(/\/_next\/static\/.*\.js/, async route => {
      requests.push(route.request().url());
      await gate;
      await route.continue();
    });
    const login = page.getByRole("link", { name: "Log In", exact: true });
    if (intent === "hover") await login.hover();
    else if (intent === "focus") await login.focus();
    else await login.dispatchEvent("pointerdown", { pointerType: "touch" });
    try {
      await expect.poll(() => requests.length).toBeGreaterThan(0);
      await expect(page.getByRole("button", { name: "Close auth modal" })).toHaveCount(0);
      expect(privateRequests).toEqual([]);
    } finally { release(); }
    await page.waitForLoadState("networkidle");
    const warmedRequests = requests.length;
    const start = performance.now();
    await login.click();
    await expect(page.getByRole("heading", { name: "Welcome to Stock Simulator", exact: true })).toBeVisible();
    await testInfo.attach("warmed-modal-open", { body: JSON.stringify({ intent, elapsedMs: performance.now() - start, warmedChunkRequests: warmedRequests }), contentType: "application/json" });
    await page.getByRole("button", { name: "Close auth modal" }).click();
    await page.getByRole("link", { name: "Sign Up", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Create Your Trading Desk", exact: true })).toBeVisible();
    expect(requests.length).toBe(warmedRequests);
    expect(privateRequests).toEqual([]);
  });
}

test("both existing particle backgrounds keep animating behind the original login and signup card", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".landing-experience")).toHaveAttribute("data-motion-ready", "true");
  await page.getByRole("link", { name: "Log In", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Stock Simulator", exact: true })).toBeVisible();
  const canvases = page.locator("canvas");
  await expect(canvases).toHaveCount(2);
  for (const canvas of [canvases.first(), canvases.last()]) {
    const before = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
    await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).not.toBe(before);
  }
  await page.getByRole("button", { name: "Sign Up", exact: true }).click();
  await expect(page.getByPlaceholder("Minimum 8 characters")).toBeVisible();
  await page.getByRole("button", { name: "Close auth modal" }).click();
  await expect(canvases).toHaveCount(1);
  expect(errors).toEqual([]);
});
