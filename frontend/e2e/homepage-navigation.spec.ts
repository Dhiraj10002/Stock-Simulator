import { test, expect, type Page } from "@playwright/test";

async function ready(page: Page) {
  await expect(page.locator("[data-navigation-ready]")).toHaveAttribute("data-navigation-ready", "true");
}

async function scrollSection(page: Page, id: string, progress = 0) {
  await page.locator(`#${id}`).evaluate((section, progress) => {
    const offset = document.querySelector("[data-landing-ticker]")!.getBoundingClientRect().bottom;
    const pin = section.querySelector<HTMLElement>(".scroll-pin");
    const travel = Math.max(0, section.clientHeight - (pin?.offsetHeight ?? innerHeight - offset));
    window.scrollTo({ top: section.getBoundingClientRect().top + scrollY - offset + travel * progress, behavior: "instant" });
  }, progress);
  await expect(page).toHaveURL(new RegExp(`#${id}$`));
  await expect(page.locator(`[data-landing-nav="${id}"]`)).toHaveAttribute("aria-current", "location");
}

test("passive desktop scroll keeps the URL and navbar in sync without adding history entries", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?from=homepage#hero");
  await ready(page);
  const length = await page.evaluate(() => {
    history.replaceState({ ...history.state, unrelated: "preserve-me" }, "");
    return history.length;
  });
  for (const id of ["platform", "how", "features", "testimonials", "portal", "hero"]) {
    await scrollSection(page, id, 0.5);
    expect(new URL(page.url()).search).toBe("?from=homepage");
    expect(await page.evaluate(() => history.length)).toBe(length);
    expect(await page.evaluate(() => history.state.unrelated)).toBe("preserve-me");
  }
});

test("refresh restores the current desktop chapter after delayed hydration instead of jumping to the footer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route(/\/_next\/static\/.*\.js/, async route => {
    await new Promise(resolve => setTimeout(resolve, 150));
    await route.continue();
  });
  await page.goto("/#hero");
  await ready(page);
  for (const [id, progress, selected, text] of [
    ["how", 0.85, "#step-title", "YOUR NEXT LESSON"],
    ["features", 0.7, "#feature-panel-3", null],
    ["testimonials", 0.5, "#story-role", "Strategy explorer"],
  ] as const) {
    await scrollSection(page, id, progress);
    if (text) await expect(page.locator(selected)).toHaveText(text);
    else await expect(page.locator(selected)).toBeVisible();
    const before = await page.evaluate(() => scrollY);
    await page.reload();
    await ready(page);
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect(page.locator(`[data-landing-nav="${id}"]`)).toHaveAttribute("aria-current", "location");
    await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(before, -1);
    if (text) await expect(page.locator(selected)).toHaveText(text);
    else await expect(page.locator(selected)).toBeVisible();
  }
});

test("direct anchors and navbar Back/Forward remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#features");
  await ready(page);
  await expect(page.locator('[data-landing-nav="features"]')).toHaveAttribute("aria-current", "location");
  await expect(page.locator("#feature-panel-0")).toBeVisible();
  await page.locator('[data-landing-nav="how"]').click();
  await expect(page).toHaveURL(/#how$/);
  await expect(page.locator('[data-landing-nav="how"]')).toHaveAttribute("aria-current", "location");
  await page.goBack();
  await expect(page).toHaveURL(/#features$/);
  await expect(page.locator('[data-landing-nav="features"]')).toHaveAttribute("aria-current", "location");
  await page.goForward();
  await expect(page).toHaveURL(/#how$/);
  await expect(page.locator('[data-landing-nav="how"]')).toHaveAttribute("aria-current", "location");
});

for (const mode of ["mobile", "reduced-motion"] as const) {
  test(`${mode} scroll and refresh keep the current section`, async ({ page }) => {
    await page.setViewportSize(mode === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    if (mode === "reduced-motion") await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/#how");
    await ready(page);
    await scrollSection(page, "testimonials");
    const before = await page.evaluate(() => scrollY);
    await page.reload();
    await ready(page);
    await expect(page).toHaveURL(/#testimonials$/);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(before, -1);
  });
}
