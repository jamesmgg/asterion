import { test, expect, type Page } from "@playwright/test";

function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function pixels(page: Page) {
  return page
    .locator("#universe canvas")
    .evaluate((canvas: HTMLCanvasElement) => {
      const sample = document.createElement("canvas");
      sample.width = sample.height = 128;
      const context = sample.getContext("2d")!;
      context.drawImage(canvas, 0, 0, 128, 128);
      return Array.from(context.getImageData(0, 0, 128, 128).data);
    });
}

function changedFraction(before: number[], after: number[]) {
  let changed = 0;
  for (let i = 0; i < before.length; i += 4) {
    if (
      Math.abs(before[i] - after[i]) +
        Math.abs(before[i + 1] - after[i + 1]) +
        Math.abs(before[i + 2] - after[i + 2]) >
      45
    )
      changed++;
  }
  return changed / (before.length / 4);
}

async function seek(page: Page, percent: number) {
  await page
    .getByLabel("Impact timeline", { exact: true })
    .fill(String(percent));
}

async function prepareEarth(page: Page) {
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  await page.getByLabel("Simulation date", { exact: true }).fill("2026-09-11");
  await page.getByLabel("Simulation date", { exact: true }).press("Tab");
  await page.getByRole("button", { name: "Impact lab", exact: true }).click();
  await page.getByRole("button", { name: "Chicxulub", exact: false }).click();
}

test("Earth impact surface remains stable through close-up zoom and a second overlapping crater", async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await prepareEarth(page);
  await page
    .getByRole("button", { name: "Launch asteroid", exact: true })
    .click();
  await seek(page, 12);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "test-results/impact-earth-approach.png" });
  await seek(page, 26);
  await page.getByLabel("Impact camera", { exact: true }).selectOption("site");
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "test-results/impact-earth-contact.png" });
  await seek(page, 100);
  await expect(page.locator("#event-status")).toContainText("Impact complete");
  await expect(page.locator("#impact-result")).toContainText("crater");
  await page
    .getByRole("button", { name: "Explore aftermath", exact: true })
    .click();
  await page.getByLabel("Impact camera", { exact: true }).selectOption("site");
  await page.waitForTimeout(6000);
  await page.screenshot({ path: "test-results/impact-earth-aftermath.png" });
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await page.waitForTimeout(1500);
  const before = await pixels(page);
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(3500);
  const after = await pixels(page);
  await page.screenshot({ path: "test-results/impact-earth-zoom-return.png" });
  expect(
    changedFraction(before, after),
    "settled crater surface must not rearrange after a reversible camera zoom",
  ).toBeLessThan(0.04);

  // Returning to the lab preserves the target; a second impact exercises
  // overlapping crater ownership instead of only an isolated surface patch.
  await page
    .getByRole("button", { name: "Launch asteroid", exact: true })
    .click();
  await seek(page, 100);
  await page
    .getByRole("button", { name: "Explore aftermath", exact: true })
    .click();
  await page.getByLabel("Impact camera", { exact: true }).selectOption("site");
  await page.waitForTimeout(5000);
  const overlapping = await pixels(page);
  await page.waitForTimeout(1500);
  const overlappingSettled = await pixels(page);
  expect(
    changedFraction(overlapping, overlappingSettled),
    "paused overlapping crater layers must remain steady",
  ).toBeLessThan(0.025);
  await page.screenshot({ path: "test-results/impact-earth-overlap.png" });
  expect(errors).toEqual([]);
});

test("mobile Earth crater aftermath retains terrain, playback controls, and a working WebGL scene", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: process.env.BASE_URL || "http://localhost:8787",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = captureErrors(page);
  await prepareEarth(page);
  await page
    .getByRole("button", { name: "Launch asteroid", exact: true })
    .tap();
  await seek(page, 100);
  await page
    .getByRole("button", { name: "Explore aftermath", exact: true })
    .tap();
  await page.getByLabel("Impact camera", { exact: true }).selectOption("site");
  await page.waitForTimeout(5000);
  await expect(page.getByLabel("Impact camera", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Impact timeline", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const image = await pixels(page);
  let illuminated = 0;
  for (let i = 0; i < image.length; i += 4)
    if (image[i] + image[i + 1] + image[i + 2] > 30) illuminated++;
  expect(
    illuminated / (128 * 128),
    "the aftermath should contain visible terrain",
  ).toBeGreaterThan(0.1);
  await page.screenshot({ path: "test-results/impact-earth-mobile.png" });
  expect(errors).toEqual([]);
  await context.close();
});

for (const mobile of [false, true]) {
  test(`${mobile ? "mobile" : "desktop"} small Earth crater remains visible at the impact-site camera`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: process.env.BASE_URL || "http://localhost:8787",
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = captureErrors(page);
    await prepareEarth(page);
    // Keep the preset's 20 km/s, 60-degree stony entry, but reduce the body
    // to 100 m. The resulting crater is much smaller than a terrain tile.
    await page
      .getByLabel("Asteroid diameter in meters", { exact: true })
      .fill("100");
    await page
      .getByRole("button", { name: "Launch asteroid", exact: true })
      .click();
    await seek(page, 100);
    await expect(page.locator("#impact-result")).toContainText(
      "Surface crater",
    );
    await page
      .getByRole("button", { name: "Explore aftermath", exact: true })
      .click();
    await page
      .getByLabel("Impact camera", { exact: true })
      .selectOption("site");
    await page.waitForTimeout(5000);
    const image = await pixels(page);
    let centerBrightness = 0;
    for (let y = 56; y < 72; y++) {
      for (let x = 56; x < 72; x++) {
        const index = (y * 128 + x) * 4;
        centerBrightness += image[index] + image[index + 1] + image[index + 2];
      }
    }
    expect(
      centerBrightness / (16 * 16),
      "small-crater framing must retain visible ground at the camera target",
    ).toBeGreaterThan(25);
    const darkGround = new Set<number>();
    for (let y = 14; y < 114; y++) {
      for (let x = 14; x < 114; x++) {
        const index = (y * 128 + x) * 4;
        // Missing ground reveals blue-black space through the atmospheric
        // layer. Shadowed rock inside the bowl is dark but remains neutral.
        const red = image[index],
          green = image[index + 1],
          blue = image[index + 2];
        if (red + green + blue < 65 && blue > red * 1.65 && blue > green * 1.25)
          darkGround.add(y * 128 + x);
      }
    }
    // A misplaced patch exposes one continuous crescent. Isolated dark
    // fragments in the shadowed crater wall are valid lighting, not gaps.
    let largestGap = 0;
    while (darkGround.size) {
      const queue = [darkGround.values().next().value!];
      darkGround.delete(queue[0]);
      for (let i = 0; i < queue.length; i++) {
        const x = queue[i] % 128,
          y = Math.floor(queue[i] / 128);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const neighbor = (y + dy) * 128 + x + dx;
            if (darkGround.delete(neighbor)) queue.push(neighbor);
          }
      }
      largestGap = Math.max(largestGap, queue.length);
    }
    expect(
      largestGap,
      "the close-up ground must not expose a black crescent around the replacement patch",
    ).toBeLessThan(12);
    await page.screenshot({
      path: `test-results/impact-earth-small-${mobile ? "mobile" : "desktop"}.png`,
    });
    expect(errors).toEqual([]);
    await context.close();
  });
}
