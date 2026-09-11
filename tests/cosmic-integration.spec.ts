import { test, expect, type Page } from "@playwright/test";

async function visit(page: Page, id: string) {
  await page.locator("#cosmic-library").click();
  await page.locator(`[data-cosmic-destination="${id}"]`).click();
  await expect(page.locator("#app")).toHaveAttribute("data-destination", id);
  await expect(page.locator("#cosmic-library-modal")).toBeHidden();
}

function errorsOn(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function renderedPixels(page: Page) {
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

test("exoplanet time, true-scale close-ups, and returning home preserve the solar journey", async ({
  page,
}) => {
  const errors = errorsOn(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  await page.locator("#date").fill("2026-09-11");
  await page.locator("#date").dispatchEvent("change");
  const solarDate = await page.locator("#date").inputValue();
  const solarSpeed = await page.locator("#speed").inputValue();
  await visit(page, "trappist-1");
  await expect(page.locator("#cosmic-dock [data-cosmic-body]")).toHaveCount(9);
  await page.locator("#cosmic-scale").selectOption("true");
  await page.locator("#speed").selectOption("10");
  await page
    .getByRole("button", { name: "Resume simulation", exact: true })
    .click();
  await expect(page.locator("#cosmic-elapsed")).not.toHaveText(
    "0 days elapsed",
  );
  await page.waitForTimeout(1000);
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  await page.waitForTimeout(600);
  const elapsed = await page.locator("#cosmic-elapsed").textContent();
  await page.waitForTimeout(700);
  await expect(page.locator("#cosmic-elapsed")).toHaveText(elapsed!);
  await page.screenshot({ path: "test-results/cosmic-trappist-system.png" });
  await page.locator('#cosmic-dock [data-cosmic-body="trappist-1-e"]').click();
  await expect(page.locator("#app")).toHaveAttribute(
    "data-cosmic-body",
    "trappist-1-e",
  );
  await page.waitForTimeout(500);
  const closeUp = await renderedPixels(page);
  expect(
    closeUp.filter((value, index) => index % 4 !== 3 && value > 45).length,
  ).toBeGreaterThan(500);
  await page.screenshot({ path: "test-results/cosmic-trappist-closeup.png" });
  await page.locator("#cosmic-scale").selectOption("readable");
  await page.waitForTimeout(500);
  const readable = await renderedPixels(page);
  let different = 0;
  for (let index = 0; index < closeUp.length; index += 4) {
    const change =
      Math.abs(closeUp[index] - readable[index]) +
      Math.abs(closeUp[index + 1] - readable[index + 1]) +
      Math.abs(closeUp[index + 2] - readable[index + 2]);
    if (change > 65) different++;
  }
  expect(
    different / (96 * 96),
    "surface shading must remain stable when a focused planet changes display scale",
  ).toBeLessThan(0.055);
  await page.locator("#cosmic-scale").selectOption("true");
  await page.locator("#zoom-in").click({ clickCount: 3 });
  await page.locator("#reset-camera").click();
  await expect(page.locator("#app")).toHaveAttribute(
    "data-cosmic-body",
    "trappist-1-e",
  );
  await page.locator("#cosmic-home").click();
  await expect(page.locator("#app")).toHaveAttribute("data-view", "system");
  await expect(page.locator("#date")).toHaveValue(solarDate);
  await expect(page.locator("#speed")).toHaveValue(solarSpeed);
  await expect(
    page.getByRole("button", { name: "Resume simulation", exact: true }),
  ).toBeVisible();
  await page.locator('[data-planet="earth"]').click();
  await expect(page.locator("#app")).toHaveAttribute("data-view", "planet");
  await expect(page.locator("#planet-name")).toHaveText("Earth");
  expect(errors).toEqual([]);
});

test("every stellar and black-hole destination renders, compares and captures", async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors = errorsOn(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  await page.locator("#cosmic-library").click();
  await page.screenshot({ path: "test-results/cosmic-library-desktop.png" });
  await page.keyboard.press("Escape");
  for (const id of [
    "sirius-a",
    "vega",
    "betelgeuse",
    "kepler-90",
    "sagittarius-a",
    "m87",
  ]) {
    await visit(page, id);
    await page.waitForTimeout(500);
    if (["sirius-a", "vega", "betelgeuse"].includes(id)) {
      await page.locator("#cosmic-comparison").check();
      await expect(
        page.locator('[data-cosmic-target="sun-comparison"]'),
      ).toBeVisible();
    }
    const pixels = await renderedPixels(page);
    expect(
      pixels.filter((value, index) => index % 4 !== 3 && value > 45).length,
      `${id} has visible rendered geometry`,
    ).toBeGreaterThan(100);
    await page.screenshot({ path: `test-results/cosmic-${id}.png` });
    expect(errors).toEqual([]);
  }
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#capture").click();
  expect((await downloadPromise).suggestedFilename()).toBe("asterion-m87.png");
  await page.locator("#cosmic-home").click();
  await expect(page.locator(".planet-dock")).toBeVisible();
  expect(errors).toEqual([]);
});
