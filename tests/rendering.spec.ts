import { test, expect, type Page } from "@playwright/test";

async function canvasPixels(page: Page) {
  return page
    .locator("#universe canvas")
    .evaluate((canvas: HTMLCanvasElement) => {
      const sample = document.createElement("canvas");
      sample.width = sample.height = 96;
      const context = sample.getContext("2d")!;
      context.drawImage(canvas, 0, 0, 96, 96);
      return Array.from(context.getImageData(0, 0, 96, 96).data);
    });
}

test("Earth stays continuous across slow detail loading, zoom reversals, and minimum altitude", async ({
  page,
}) => {
  const errors: string[] = [],
    requests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.route("**/tiles/earth/**/*.webp", async (route) => {
    requests.push(route.request().url());
    await new Promise((resolve) => setTimeout(resolve, 180));
    await route.continue();
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Zoom in", exact: true })
    .click({ clickCount: 6, delay: 150 });
  await expect(page.locator("#detail-readout")).toContainText("16K detail", {
    timeout: 30000,
  });
  await page.waitForTimeout(3500);
  const before = await canvasPixels(page);
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await page.waitForTimeout(250);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(1000);
  const after = await canvasPixels(page);
  let changed = 0;
  for (let i = 0; i < before.length; i += 4) {
    if (
      Math.abs(before[i] - after[i]) +
        Math.abs(before[i + 1] - after[i + 1]) +
        Math.abs(before[i + 2] - after[i + 2]) >
      30
    )
      changed++;
  }
  expect(
    changed / (96 * 96),
    "settled zoom round-trip must preserve the rendered surface",
  ).toBeLessThan(0.025);
  // A wider horizon can reveal new tiles. Retention means loaded URLs are
  // never fetched again, not that every neighboring tile was already visible.
  expect(requests.length, "zoom reversals must not reload resident tiles").toBe(
    new Set(requests).size,
  );
  await page.screenshot({ path: "test-results/earth-continuous-detail.png" });
  await page
    .getByRole("button", { name: "Zoom in", exact: true })
    .click({ clickCount: 8, delay: 100 });
  await page.waitForTimeout(2000);
  const close = await canvasPixels(page);
  const center = (48 * 96 + 48) * 4;
  expect(
    close[center] + close[center + 1] + close[center + 2],
    "near clipping must not remove the ground",
  ).toBeGreaterThan(30);
  await page.screenshot({ path: "test-results/earth-minimum-altitude.png" });
  expect(errors).toEqual([]);
});

test("true sizes and orbits explains subpixel planets and retains desktop and mobile destinations", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  await page.getByRole("button", { name: "Solar system", exact: true }).click();
  await page
    .getByLabel("Distance scale")
    .selectOption({ label: "True sizes & orbits" });
  await expect(page.locator("#scale-note")).toContainText("one physical scale");
  await page.getByLabel("Orbit camera").selectOption("inner");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "test-results/true-scale-inner.png" });
  await page.setViewportSize({ width: 1280, height: 720 });
  const heading = await page.locator(".observation").boundingBox();
  const settings = await page.locator("#system-settings").boundingBox();
  expect(
    heading!.y + heading!.height,
    "scale controls must not overlap the heading on a laptop",
  ).toBeLessThanOrEqual(settings!.y);
  await page.screenshot({ path: "test-results/true-scale-laptop.png" });
  await page
    .locator(".world-label")
    .filter({ hasText: /^Earth$/ })
    .click();
  await expect(page.locator("#app")).toHaveAttribute("data-view", "planet");
  await expect(page.locator("#planet-name")).toHaveText("Earth");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Solar system", exact: true }).click();
  await page.getByLabel("Orbit camera").selectOption("inner");
  await expect(page.getByLabel("Distance scale")).toHaveValue("true");
  await expect(page.locator("#scale-note")).toBeVisible();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "test-results/true-scale-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Visit Earth", exact: true }).click();
  await expect(page.locator("#app")).toHaveAttribute("data-view", "planet");
  expect(errors).toEqual([]);
});
