import { test, expect, type Page } from "@playwright/test";

async function scrollChapter(page: Page, selector: string, progress: number) {
  await page.locator(selector).evaluate((section, progress) => {
    const pin = section.querySelector<HTMLElement>(".scroll-pin")!;
    const offset = parseFloat(getComputedStyle(section.closest(".landing-scroll-sections")!).getPropertyValue("--scroll-top"));
    window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY - offset + (section.clientHeight - pin.offsetHeight) * progress, behavior: "instant" });
  }, progress);
}

test("desktop native scrolling changes the three How it works chapters and preserves pinned controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [], writes: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (request.method() === "POST") writes.push(request.url()); });
  await page.goto("/");
  await expect(page.locator(".landing-scroll-sections")).toHaveClass(/scroll-enhanced/);
  for (const [index, title] of ["YOUR VIRTUAL WALLET", "YOUR FIRST PAPER ORDER", "YOUR NEXT LESSON"].entries()) {
    await scrollChapter(page, "#how", (index + 0.5) / 3);
    await expect(page.locator("#step-title")).toHaveText(title);
    await expect(page.locator(`[data-step="${index}"]`)).toHaveAttribute("aria-selected", "true");
    const top = await page.locator("#how .scroll-pin").evaluate(node => node.getBoundingClientRect().top);
    const offset = await page.locator(".landing-scroll-sections").evaluate(node => parseFloat(getComputedStyle(node).getPropertyValue("--scroll-top")));
    expect(Math.abs(top - offset)).toBeLessThan(2);
  }
  await page.locator("#next-step").click();
  await expect(page.locator("#step-title")).toHaveText("YOUR VIRTUAL WALLET");
  expect(writes).toEqual([]); expect(errors).toEqual([]);
});

test("desktop features and illustrative stories advance with scrolling and the navbar follows nested sections", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator(".landing-scroll-sections")).toHaveClass(/scroll-enhanced/);
  for (let i = 0; i < 5; i++) {
    await scrollChapter(page, "#features", (i + 0.5) / 5);
    await expect(page.locator(`[data-feature="${i}"]`)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(`#feature-panel-${i}`)).toBeVisible();
    await expect(page.locator('[data-landing-nav="features"]')).toHaveAttribute("aria-current", "location");
  }
  for (const [i, role] of ["First-time market learner", "Strategy explorer", "Market educator"].entries()) {
    await scrollChapter(page, "#testimonials", (i + 0.5) / 3);
    await expect(page.locator("#story-role")).toHaveText(role);
    await expect(page.locator('[data-landing-nav="testimonials"]')).toHaveAttribute("aria-current", "location");
    await expect(page.getByText("Illustrative stories · not verified reviews")).toBeVisible();
  }
});

test("mobile tap and keyboard chapters work; preview quantity validation never submits an order", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes: string[] = [];
  page.on("request", request => { if (request.method() === "POST") writes.push(request.url()); });
  await page.goto("/");
  await page.locator('[data-step="1"]').click();
  await expect(page.locator("#step-panel-1")).toBeVisible();
  await page.locator("#demo-quantity").fill("3");
  await expect(page.locator("#demo-funds")).toHaveText("₹3,679.20");
  await page.locator("#demo-order").click();
  await expect(page.locator("#order-result")).toContainText("No order was sent.");
  await page.locator("#demo-quantity").fill("0");
  await expect(page.locator("#demo-order")).toBeDisabled();
  await page.locator('[data-feature="0"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#feature-panel-1")).toBeVisible();
  await page.locator('[data-ai="orders"]').click();
  await expect(page.locator("#ai-question")).toHaveText("How does a limit order work?");
  await page.locator('[data-story="educator"]').click();
  await expect(page.locator("#story-role")).toHaveText("Market educator");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(writes).toEqual([]);
});

test("reduced motion uses local chapters without scroll hijacking or 3D transforms", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator('[data-step="2"]').click();
  const before = await page.evaluate(() => window.scrollY);
  await page.locator("#next-step").click();
  await expect(page.locator("#step-panel-0")).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  expect(await page.locator(".step-window").evaluate(node => getComputedStyle(node).transform)).toBe("none");
  expect(await page.locator("#how .scroll-pin").evaluate(node => getComputedStyle(node).position)).not.toBe("sticky");
});

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1040, height: 820 }]) {
  test(`scroll sections fill the ${viewport.width}×${viewport.height} desktop canvas without clipped content`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator(".landing-scroll-sections")).toHaveClass(/scroll-enhanced/);
    for (const [selector, count] of [["#how", 3], ["#features", 5], ["#testimonials", 3]] as const) {
      for (let i = 0; i < count; i++) {
        await scrollChapter(page, selector, (i + 0.5) / count);
        await expect(page.locator(`${selector} .scene-count`)).toHaveText(`0${i + 1} / 0${count}`);
        // Allow the short content-entry animation to finish before measuring geometry.
        await page.locator(selector).evaluate(async section => {
          await Promise.all(section.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined)));
        });
        const bounds = await page.locator(selector).evaluate(section => {
          const pin = section.querySelector<HTMLElement>(".scroll-pin")!;
          const wrap = pin.querySelector<HTMLElement>(".wrap")!;
          const card = section.querySelector<HTMLElement>(section.id === "how" ? ".step-window" : section.id === "features" ? ".scroll-feature-panel:not([hidden])" : ".story-shell")!;
          const offset = parseFloat(getComputedStyle(section.closest(".landing-scroll-sections")!).getPropertyValue("--scroll-top"));
          const content = section.querySelector<HTMLElement>(section.id === "how" ? ".how-panel:not([hidden])" : section.id === "features" ? ".scroll-feature-panel:not([hidden])" : ".story-shell")!;
          return { wrap: wrap.getBoundingClientRect().toJSON(), card: card.getBoundingClientRect().toJSON(), offset, overflow: content.scrollHeight - content.clientHeight, pinBottom: pin.getBoundingClientRect().bottom };
        });
        expect(bounds.wrap.width).toBeGreaterThan(viewport.width * 0.92);
        expect(bounds.wrap.top - bounds.offset).toBeLessThan(25);
        expect(bounds.pinBottom).toBeLessThanOrEqual(viewport.height + 1);
        expect(bounds.card.height).toBeGreaterThan((viewport.height - bounds.offset) * 0.45);
        expect(bounds.card.bottom).toBeLessThanOrEqual(viewport.height + 1);
        expect(bounds.overflow).toBeLessThanOrEqual(2);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
