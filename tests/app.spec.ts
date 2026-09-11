import { test, expect } from "@playwright/test";

test("desktop: textured planets, solar map, impact launch, replay and sources", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const failed: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(r.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Earth", exact: true }),
  ).toBeVisible({ timeout: 5000 });
  await expect(page.locator("#universe canvas")).toBeVisible();
  await expect(page.locator("#loading")).toBeHidden({ timeout: 30000 });
  await expect(page.locator("#error")).toBeHidden();
  await page.screenshot({ path: "test-results/desktop-earth.png" });
  for (const planet of [
    "Mercury",
    "Venus",
    "Mars",
    "Jupiter",
    "Saturn",
    "Uranus",
    "Neptune",
    "Sun",
    "Earth",
  ]) {
    await page
      .getByRole("button", { name: `Visit ${planet}`, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: planet, exact: true }),
    ).toBeVisible();
    if (planet === "Saturn") {
      await page.waitForTimeout(1200);
      await page.screenshot({ path: "test-results/desktop-saturn.png" });
    }
  }
  await page.getByRole("button", { name: "Solar system", exact: true }).click();
  await expect(page.locator("#app")).toHaveAttribute("data-view", "system");
  await page.getByLabel("Distance scale").selectOption("true");
  await page.screenshot({ path: "test-results/desktop-system.png" });
  await page.getByRole("button", { name: "Visit Earth", exact: true }).click();
  await page.getByRole("button", { name: "Impact lab", exact: true }).click();
  await page.getByRole("button", { name: "Chicxulub", exact: false }).click();
  await page
    .getByRole("button", { name: "Launch asteroid", exact: true })
    .click();
  await expect(page.locator("#event-status")).toContainText("Impact complete", {
    timeout: 25000,
  });
  await expect(page.locator("#impact-result")).toContainText("crater");
  await page.screenshot({ path: "test-results/desktop-impact.png" });
  await page
    .getByRole("button", { name: "Replay impact", exact: true })
    .click();
  await expect(page.locator("#event-status")).toContainText("Incoming");
  await expect(page.locator("#event-status")).toContainText("Impact complete", {
    timeout: 25000,
  });
  await page
    .getByRole("button", { name: "Science & sources", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Newtonian");
  await page
    .getByRole("button", { name: "Close science", exact: true })
    .click();
  expect(errors).toEqual([]);
  expect(failed).toEqual([]);
});

test("mobile: navigation and launch remain accessible without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 30000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile-earth.png" });
  await page.getByRole("button", { name: "Visit Mars", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mars", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Impact lab", exact: true }).click();
  await page.getByRole("button", { name: "Tunguska", exact: false }).click();
  await page
    .getByRole("button", { name: "Launch asteroid", exact: true })
    .click();
  await expect(page.locator("#event-status")).toContainText("Impact complete", {
    timeout: 25000,
  });
  await page.screenshot({ path: "test-results/mobile-impact.png" });
  await page
    .getByRole("button", { name: "Visit Jupiter", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Launch asteroid", exact: true })
    .click();
  await expect(page.locator("#event-status")).toContainText("Impact complete", {
    timeout: 25000,
  });
  await expect(page.locator("#impact-result")).toContainText(
    "Atmospheric plume",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("reset camera during an encounter cancels it and allows another launch", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 30000 });
  await page.getByRole("button", { name: "Impact lab", exact: true }).click();
  await page
    .getByRole("button", { name: "Launch asteroid", exact: true })
    .click();
  await page.getByRole("button", { name: "Reset camera", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Launch asteroid", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("#event-status")).toContainText("Ready");
});

test("mobile Explore opens physical details", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 30000 });
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A closer look", exact: true }),
  ).toBeVisible();
});

test("touch controls can aim, pinch to zoom, launch an airburst, and export an encounter", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(process.env.BASE_URL || "http://localhost:8787");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 30000 });
  await expect(page.locator("#error")).toBeHidden();
  await page.getByRole("button", { name: "Impact lab", exact: true }).tap();
  await page.getByRole("button", { name: "Chelyabinsk", exact: false }).tap();
  await page.locator("#aim").tap();
  const canvas = page.locator("#universe canvas");
  await page.waitForTimeout(250);
  const bounds = (await canvas.boundingBox())!;
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + bounds.height / 2;
  await page.touchscreen.tap(x, y);
  await expect(page.locator("#target-label")).toContainText("°");
  await page.getByRole("button", { name: "Collapse panel", exact: true }).tap();
  const before = await canvas.screenshot();
  const cdp = await context.newCDPSession(page);
  const gestureBounds = (await canvas.boundingBox())!;
  const cx = gestureBounds.x + gestureBounds.width / 2,
    cy = gestureBounds.y + gestureBounds.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: cx - 35, y: cy },
      { x: cx + 35, y: cy },
    ],
  });
  for (let i = 1; i <= 8; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: cx - 35 - i * 5, y: cy },
        { x: cx + 35 + i * 5, y: cy },
      ],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(300);
  const after = await canvas.screenshot();
  expect(after.equals(before)).toBe(false);
  await page.getByRole("button", { name: "Impact lab", exact: true }).tap();
  await page
    .getByRole("button", { name: "Launch asteroid", exact: true })
    .tap();
  await expect(page.locator("#event-status")).toContainText("Impact complete", {
    timeout: 20000,
  });
  await expect(page.locator("#impact-result")).toContainText("Airburst");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export encounters", exact: true })
    .tap();
  expect((await download).suggestedFilename()).toBe("asterion-encounters.json");
  await page.reload();
  await page.getByRole("button", { name: "Impact lab", exact: true }).tap();
  await expect(page.locator("#history-list")).toContainText("Earth");
  await context.close();
});
