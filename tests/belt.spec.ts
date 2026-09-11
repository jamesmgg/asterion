import { test, expect, type Page } from "@playwright/test";

async function pixels(page: Page) {
  return page
    .locator("#universe canvas")
    .evaluate((canvas: HTMLCanvasElement) => {
      const sample = document.createElement("canvas");
      sample.width = 320;
      sample.height = 240;
      const context = sample.getContext("2d")!;
      context.drawImage(canvas, 0, 0, 320, 240);
      return Array.from(context.getImageData(0, 0, 320, 240).data);
    });
}
test("asteroid belt is visible in both scales, can be hidden, and has a mobile camera view", async ({
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
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  await page.getByRole("button", { name: "Solar system", exact: true }).click();
  const toggle = page.getByRole("checkbox", {
    name: "Asteroid belt",
    exact: true,
  });
  await expect(toggle).toBeChecked();
  await page.getByLabel("Orbit camera").selectOption("belt");
  for (const scale of ["readable", "true"]) {
    await page.getByLabel("Distance scale").selectOption(scale);
    await page.waitForTimeout(3500);
    await expect(page.locator("#belt-label")).toBeVisible();
    const withBelt = await pixels(page);
    await page.screenshot({ path: `test-results/belt-${scale}.png` });
    await toggle.uncheck();
    await page.waitForTimeout(600);
    await expect(page.locator("#belt-label")).toBeHidden();
    const withoutBelt = await pixels(page);
    let changed = 0;
    for (let i = 0; i < withBelt.length; i += 4)
      if (
        Math.abs(withBelt[i] - withoutBelt[i]) +
          Math.abs(withBelt[i + 1] - withoutBelt[i + 1]) +
          Math.abs(withBelt[i + 2] - withoutBelt[i + 2]) >
        24
      )
        changed++;
    expect(changed).toBeGreaterThan(80);
    await toggle.check();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toggle).toBeVisible();
  await page.getByLabel("Orbit camera").selectOption("belt");
  await page.waitForTimeout(2500);
  const beltLabel = await page.locator("#belt-label").boundingBox();
  expect(beltLabel).not.toBeNull();
  expect(beltLabel!.x).toBeGreaterThanOrEqual(0);
  expect(beltLabel!.x + beltLabel!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/belt-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Planet view", exact: true }).click();
  await expect(page.locator("#belt-label")).toBeHidden();
  expect(errors).toEqual([]);
});
