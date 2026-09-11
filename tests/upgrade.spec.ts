import { test, expect } from "@playwright/test";
test("streamed detail, measured terrain, moons, eclipses and orbital overview", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const tileRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/tiles/") && r.url().endsWith(".webp"))
      tileRequests.push(r.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 30000 });
  await expect(page.locator("#detail-readout")).toContainText("detail", {
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Visit Moon", exact: true }).click();
  await expect(page.locator("#planet-name")).toHaveText("Moon");
  await page
    .getByRole("button", { name: "Zoom in", exact: true })
    .click({ clickCount: 5, delay: 100 });
  await expect(page.locator("#detail-readout")).toContainText("K detail", {
    timeout: 30000,
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "test-results/upgrade-moon-close.png" });
  await page
    .getByRole("button", { name: "Visit Jupiter", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Moons & orbits", exact: true })
    .click();
  await expect(page.locator("#app")).toHaveAttribute("data-view", "moons");
  await page.waitForTimeout(1300);
  await page.screenshot({ path: "test-results/upgrade-jovian-system.png" });
  await page.getByRole("button", { name: "Visit Europa", exact: true }).click();
  await expect(page.locator("#planet-name")).toHaveText("Europa");
  await page
    .getByRole("button", { name: "Eclipse demonstration", exact: true })
    .click();
  await expect(page.locator("#eclipse-banner")).toBeVisible();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "test-results/upgrade-eclipse.png" });
  await page.getByRole("button", { name: "Solar system", exact: true }).click();
  await page.getByLabel("Orbit camera").selectOption("top");
  await page.getByLabel("Simulation speed").selectOption("10");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/upgrade-system.png" });
  expect(tileRequests.length).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});
test("impact playback exposes ballistic mass and controllable aftermath", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 30000 });
  await page.getByRole("button", { name: "Visit Moon", exact: true }).click();
  await page.getByRole("button", { name: "Impact lab", exact: true }).click();
  await page.getByRole("button", { name: "Chicxulub", exact: false }).click();
  await page
    .getByRole("button", { name: "Launch asteroid", exact: true })
    .click();
  await expect(page.locator("#impact-playback")).toBeVisible();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: "Pause impact", exact: true }).click();
  await page.getByLabel("Impact timeline").fill("8");
  await page.getByLabel("Impact camera").selectOption("approach");
  await page.waitForTimeout(600);
  await page.screenshot({ path: "test-results/upgrade-asteroid-close.png" });
  await page.getByLabel("Impact timeline").fill("35");
  await expect(page.locator("#debris-readout")).toContainText("kg");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "test-results/upgrade-impact-close.png" });
  await page.getByLabel("Impact camera").selectOption("debris");
  await page.getByLabel("Impact timeline").fill("70");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/upgrade-ejecta-orbits.png" });
  await page.getByLabel("Impact timeline").fill("100");
  await expect(page.locator("#event-status")).toContainText("Impact complete");
  await page
    .getByRole("button", { name: "Explore aftermath", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Resume impact", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resume simulation", exact: true })
    .click();
  await expect(page.locator("#impact-playback")).toBeHidden();
  await expect(page.locator("#review-aftermath")).toBeHidden();
  await expect(page.locator("#physics-status")).toHaveText("9-body gravity");
  await page.getByRole("button", { name: "Solar system", exact: true }).click();
  await expect(page.locator("#impact-playback")).toBeHidden();
  expect(errors).toEqual([]);
});
test("mobile keeps system, moon and impact controls reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 30000 });
  await expect(
    page.getByRole("button", { name: "Solar system", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await page.getByRole("button", { name: "Visit Moon", exact: true }).click();
  await page
    .getByRole("button", { name: "Collapse panel", exact: true })
    .click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/upgrade-mobile-moon.png" });
  await page.getByRole("button", { name: "Solar system", exact: true }).click();
  await expect(page.getByLabel("Orbit camera")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
