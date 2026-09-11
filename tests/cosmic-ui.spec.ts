import { test, expect } from "@playwright/test";

test("the destination library filters, searches and restores keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Explore beyond", exact: true })
    .click();
  const library = page.getByRole("dialog", {
    name: "A little further into the cosmos",
  });
  await expect(library).toBeVisible();
  await expect(library.locator("[data-cosmic-destination]")).toHaveCount(8);
  await library.getByRole("button", { name: "Stars", exact: true }).click();
  await expect(library.locator("[data-cosmic-destination]")).toHaveCount(3);
  await library
    .getByRole("button", { name: "Planetary systems", exact: true })
    .click();
  await expect(library.locator("[data-cosmic-destination]")).toHaveCount(3);
  await library
    .getByRole("button", { name: "Black holes", exact: true })
    .click();
  await expect(library.locator("[data-cosmic-destination]")).toHaveCount(2);
  await library.getByRole("button", { name: "All", exact: true }).click();
  await library
    .getByRole("searchbox", { name: "Find a destination" })
    .fill("vega");
  await expect(library.locator("[data-cosmic-destination]")).toHaveCount(1);
  await expect(
    library.locator("[data-cosmic-destination='vega']"),
  ).toBeVisible();
  await library
    .getByRole("searchbox", { name: "Find a destination" })
    .fill("no such destination");
  await expect(library.getByText("No destinations found")).toBeVisible();
  await library.getByRole("button", { name: "Clear filters" }).click();
  await expect(library.locator("[data-cosmic-destination]")).toHaveCount(8);
  await page.keyboard.press("Escape");
  await expect(library).toBeHidden();
  await expect(page.locator("#cosmic-library")).toBeFocused();
  await page.locator("#cosmic-library").click();
  await library.locator("[data-cosmic-destination='sagittarius-a']").click();
  await expect(page.locator("#cosmic-title")).toHaveText("Sagittarius A*");
  await expect(page.locator("#cosmic-details")).toBeVisible();
  await expect(page.locator("#cosmic-scale")).toBeHidden();
  await page.screenshot({ path: "test-results/cosmic-black-hole-ui.png" });
});

test("the mobile library and destination controls leave room to explore", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Explore beyond", exact: true })
    .click();
  const library = page.locator("#cosmic-library-modal");
  await expect(library).toBeVisible();
  await library
    .getByRole("button", { name: "Planetary systems", exact: true })
    .click();
  await page.screenshot({ path: "test-results/cosmic-library-mobile.png" });
  await library.locator("[data-cosmic-destination='proxima-centauri']").click();
  await expect(page.locator("#cosmic-title")).toHaveText("Proxima Centauri");
  const details = page.locator("#cosmic-details");
  await expect(details).not.toHaveAttribute("open", "");
  await details.locator(":scope > summary").click();
  await expect(details).toHaveAttribute("open", "");
  await details.getByText("Sources & model", { exact: true }).click();
  await expect(page.locator("#cosmic-model-note")).toContainText(
    /radius.*(unmeasured|estimate|unknown)|(?:unmeasured|estimate|unknown).*radius/i,
  );
  await details.locator(":scope > summary").click();
  await expect(page.locator("#cosmic-dock [data-cosmic-body]")).toHaveCount(3);
  await expect(page.getByLabel("Cosmic system scale")).toBeVisible();
  await page.getByLabel("Cosmic system scale").selectOption("true");
  await expect(page.locator("#cosmic-scale-note")).toContainText(
    /proportional/i,
  );
  await expect(
    page.getByRole("button", { name: "Zoom in", exact: true }),
  ).toBeVisible();
  const canvas = await page.locator("#universe canvas").boundingBox();
  expect(canvas!.width).toBeGreaterThanOrEqual(360);
  expect(canvas!.height).toBeGreaterThanOrEqual(320);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/cosmic-system-mobile.png" });
  await page
    .locator("#cosmic-dock [data-cosmic-body='proxima-centauri-b']")
    .click();
  await expect(page.locator("#app")).toHaveAttribute(
    "data-cosmic-body",
    "proxima-centauri-b",
  );
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/cosmic-closeup-mobile.png" });
  await page
    .getByRole("button", { name: "Explore beyond", exact: true })
    .click();
  await library.getByRole("button", { name: "All", exact: true }).click();
  await library.locator("[data-cosmic-destination='sagittarius-a']").click();
  await expect(page.locator("#cosmic-title")).toHaveText("Sagittarius A*");
  await expect(page.locator("#app")).toHaveAttribute(
    "data-destination",
    "sagittarius-a",
  );
  await expect(page.getByLabel("Cosmic system scale")).toBeHidden();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/cosmic-black-hole-mobile.png" });
  await page
    .getByRole("button", { name: "Return to solar system", exact: true })
    .click();
  await expect(page.locator("#cosmic-dock")).toBeHidden();
  await expect(page.locator(".planet-dock")).toBeVisible();
  expect(errors).toEqual([]);
});
