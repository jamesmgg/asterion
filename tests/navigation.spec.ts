import { test, expect, type Page, type CDPSession } from "@playwright/test";

type View = { position: number[]; up: number[]; forward: number[] };

// Observe the matrices actually sent to WebGL; the application exposes no
// testing API and this does not change rendering or camera behavior.
async function observeCamera(page: Page) {
  await page.addInitScript(() => {
    const names = new WeakMap<WebGLUniformLocation, string>();
    for (const context of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const prototype = context.prototype;
      const getLocation = prototype.getUniformLocation;
      prototype.getUniformLocation = function (program, name) {
        const location = getLocation.call(this, program, name);
        if (location) names.set(location, name);
        return location;
      };
      const setMatrix = prototype.uniformMatrix4fv;
      prototype.uniformMatrix4fv = function (location, transpose, values) {
        if (location && names.get(location) === "viewMatrix")
          (window as any).__renderedNavigationMatrix = Array.from(values);
        return setMatrix.call(this, location, transpose, values);
      };
    }
  });
}

async function camera(page: Page): Promise<View> {
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__renderedNavigationMatrix?.length),
    )
    .toBe(16);
  return page.evaluate(() => {
    const m = (window as any).__renderedNavigationMatrix as number[];
    return {
      position: [
        -(m[0] * m[12] + m[1] * m[13] + m[2] * m[14]),
        -(m[4] * m[12] + m[5] * m[13] + m[6] * m[14]),
        -(m[8] * m[12] + m[9] * m[13] + m[10] * m[14]),
      ],
      up: [m[1], m[5], m[9]],
      forward: [-m[2], -m[6], -m[10]],
    };
  });
}

function length(vector: number[]) {
  return Math.hypot(...vector);
}
function cosine(a: number[], b: number[]) {
  return (
    a.reduce((sum, value, index) => sum + value * b[index], 0) /
    (length(a) * length(b))
  );
}
function signedRoll(before: View, after: View) {
  const a = before.up,
    b = after.up;
  const cross = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const sine =
    cross.reduce(
      (sum, value, index) => sum + value * before.position[index],
      0,
    ) / length(before.position);
  return Math.atan2(sine, cosine(a, b));
}
function centerMiss(view: View) {
  const [x, y, z] = view.position,
    [u, v, w] = view.forward;
  return Math.hypot(y * w - z * v, z * u - x * w, x * v - y * u);
}

async function prepare(page: Page) {
  await observeCamera(page);
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({ timeout: 30000 });
  await page
    .getByRole("button", { name: "Pause simulation", exact: true })
    .click();
  await page.getByLabel("Simulation date", { exact: true }).fill("2026-09-11");
  await page.getByLabel("Simulation date", { exact: true }).press("Tab");
  await page.waitForTimeout(1200);
}

async function drag(page: Page, dx: number, dy: number) {
  const bounds = (await page.locator("#universe canvas").boundingBox())!;
  const x = bounds.x + bounds.width * 0.45,
    y = bounds.y + bounds.height * 0.45;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 16 });
  await page.mouse.up();
  await page.waitForTimeout(1800);
}

test("aftermath gestures release the site camera and mouse controls explore the whole planet", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await prepare(page);
  await page.getByRole("button", { name: "Impact lab", exact: true }).click();
  await page.getByRole("button", { name: "Chicxulub", exact: false }).click();
  await page
    .getByRole("button", { name: "Launch asteroid", exact: true })
    .click();
  await page.getByLabel("Impact timeline", { exact: true }).fill("100");
  await expect(page.locator("#event-status")).toContainText("Impact complete");
  await page
    .getByRole("button", { name: "Explore aftermath", exact: true })
    .click();
  await page.getByLabel("Impact camera", { exact: true }).selectOption("site");
  await page.waitForTimeout(1800);
  await drag(page, -150, 35);
  const released = await camera(page);
  await expect(page.getByLabel("Impact camera", { exact: true })).toHaveValue(
    "free",
  );
  await page.screenshot({
    path: "test-results/navigation-aftermath-release.png",
  });
  expect
    .soft(
      centerMiss(released),
      "manual input must return the orbit pivot to the planet center",
    )
    .toBeLessThan(0.05);
  expect
    .soft(
      length(released.position),
      "orbiting the crater must not send the camera inside the planet",
    )
    .toBeGreaterThan(1.001);
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(1800);
  const wide = await camera(page);
  expect
    .soft(length(wide.position), "mouse wheel must pull back from the surface")
    .toBeGreaterThan(length(released.position) * 1.15);
  await drag(page, 220, -65);
  const rotated = await camera(page);
  expect
    .soft(
      cosine(wide.position, rotated.position),
      "mouse drag must orbit the whole planet after the impact",
    )
    .toBeLessThan(0.995);
  expect.soft(centerMiss(rotated)).toBeLessThan(0.05);
  await expect(page.getByLabel("Impact timeline", { exact: true })).toHaveValue(
    "100",
  );
  await page.getByLabel("Impact camera", { exact: true }).selectOption("site");
  await page.waitForTimeout(2000);
  expect(
    centerMiss(await camera(page)),
    "the site preset must work immediately after a manual orbit",
  ).toBeGreaterThan(0.3);
  await page.getByLabel("Impact camera", { exact: true }).selectOption("free");
  await page.waitForTimeout(1800);
  expect(centerMiss(await camera(page))).toBeLessThan(0.05);
  expect(errors).toEqual([]);
});

test("a manual gesture takes control from the incoming asteroid camera", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await prepare(page);
  await page.getByRole("button", { name: "Impact lab", exact: true }).click();
  await page.getByRole("button", { name: "Chicxulub", exact: false }).click();
  await page
    .getByRole("button", { name: "Launch asteroid", exact: true })
    .click();
  await page.getByLabel("Impact timeline", { exact: true }).fill("5");
  await page.waitForTimeout(1200);
  const tracked = await camera(page);
  await drag(page, -230, 40);
  const manual = await camera(page);
  expect(
    cosine(tracked.position, manual.position),
    "dragging must stop the scripted tracking camera",
  ).toBeLessThan(Math.cos(Math.PI / 360));
  expect(centerMiss(manual)).toBeLessThan(0.05);
  await expect(page.getByLabel("Impact timeline", { exact: true })).toHaveValue(
    "5",
  );
});

async function touches(
  cdp: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd",
  points: { x: number; y: number; id: number }[],
) {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
}

test("Earth and Mars can be explored continuously across a pole", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await prepare(page);
  for (const planet of ["Earth", "Mars"]) {
    await page
      .getByRole("button", { name: `Visit ${planet}`, exact: true })
      .click();
    // Finish the scripted arrival before measuring a purely manual orbit.
    // Software-rendered frames may still be easing toward the preset here.
    await drag(page, 4, 0);
    const initial = await camera(page);
    const bounds = (await page.locator("#universe canvas").boundingBox())!;
    for (let swipe = 0; swipe < 3; swipe++) {
      await drag(page, 0, bounds.height * 0.4);
      if (swipe === 1)
        await page.screenshot({
          path: `test-results/navigation-${planet.toLowerCase()}-pole.png`,
        });
    }
    const across = await camera(page);
    expect(
      cosine(initial.position, across.position),
      "vertical orbit must continue beyond the polar axis",
    ).toBeLessThan(-0.35);
    expect(centerMiss(across)).toBeLessThan(0.01);
    expect(length(across.position)).toBeCloseTo(length(initial.position), 4);
  }
});

test("touch drag, simultaneous twist and pinch, and a following mouse drag all control the globe", async ({
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
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await prepare(page);
  const cdp = await context.newCDPSession(page);
  const bounds = (await page.locator("#universe canvas").boundingBox())!;
  const x = bounds.x + bounds.width * 0.5,
    y = bounds.y + bounds.height * 0.45;
  const initial = await camera(page);
  await touches(cdp, "touchStart", [{ x, y, id: 1 }]);
  for (let step = 1; step <= 12; step++) {
    await touches(cdp, "touchMove", [
      { x: x + step * 3, y: y - step * 9, id: 1 },
    ]);
    await page.waitForTimeout(20);
  }
  // Adding and lifting a stationary second finger must not change the camera
  // or reinterpret the remaining finger's old position as a fresh drag.
  const held = { x: x + 36, y: y - 108, id: 1 };
  await page.waitForTimeout(250);
  const beforeTransition = await camera(page);
  await touches(cdp, "touchStart", [
    held,
    { x: held.x + 55, y: held.y + 45, id: 2 },
  ]);
  await page.waitForTimeout(250);
  await touches(cdp, "touchEnd", [held]);
  await page.waitForTimeout(250);
  const afterTransition = await camera(page);
  expect
    .soft(
      cosine(beforeTransition.up, afterTransition.up),
      "one-to-two-to-one transitions must not roll the camera",
    )
    .toBeGreaterThan(0.99999);
  expect
    .soft(
      cosine(beforeTransition.position, afterTransition.position),
      "changing finger count must not jump around the planet",
    )
    .toBeGreaterThan(0.99999);
  expect
    .soft(
      Math.abs(
        length(beforeTransition.position) - length(afterTransition.position),
      ),
      "changing finger count must not jump the zoom",
    )
    .toBeLessThan(0.0001);
  await touches(cdp, "touchEnd", []);
  await page.waitForTimeout(1500);
  const dragged = await camera(page);
  expect
    .soft(
      cosine(initial.position, dragged.position),
      "one-finger vertical drag must orbit in screen space",
    )
    .toBeLessThan(0.995);
  expect.soft(centerMiss(dragged)).toBeLessThan(0.05);

  await touches(cdp, "touchStart", [
    { x: x - 42, y, id: 1 },
    { x: x + 42, y, id: 2 },
  ]);
  for (let step = 1; step <= 16; step++) {
    const angle = ((Math.PI / 3) * step) / 16,
      radius = 42 + step * 2;
    const dx = Math.cos(angle) * radius,
      dy = Math.sin(angle) * radius;
    await touches(cdp, "touchMove", [
      { x: x - dx, y: y - dy, id: 1 },
      { x: x + dx, y: y + dy, id: 2 },
    ]);
    await page.waitForTimeout(25);
  }
  await touches(cdp, "touchEnd", []);
  await page.waitForTimeout(1800);
  const twisted = await camera(page);
  expect
    .soft(length(twisted.position), "spreading two fingers must zoom in")
    .toBeLessThan(length(dragged.position) * 0.9);
  expect
    .soft(
      cosine(dragged.up, twisted.up),
      "rotating two fingers must rotate the camera about the viewing axis",
    )
    .toBeLessThan(0.8);
  expect
    .soft(
      cosine(dragged.position, twisted.position),
      "a centered twist and pinch must retain its orbital direction",
    )
    .toBeGreaterThan(0.98);
  expect.soft(centerMiss(twisted)).toBeLessThan(0.05);
  expect
    .soft(
      signedRoll(dragged, twisted),
      "the globe must twist clockwise with a clockwise finger gesture",
    )
    .toBeGreaterThan(0.7);
  await page.screenshot({
    path: "test-results/navigation-mobile-twist-pinch.png",
  });

  await drag(page, 65, 45);
  const mouse = await camera(page);
  expect
    .soft(
      cosine(twisted.position, mouse.position),
      "mouse input must still orbit after multi-touch",
    )
    .toBeLessThan(0.995);

  await page.getByRole("button", { name: "Impact lab", exact: true }).tap();
  await page.locator("#aim").tap();
  await touches(cdp, "touchStart", [
    { x: x - 12, y, id: 1 },
    { x: x + 12, y, id: 2 },
  ]);
  await touches(cdp, "touchEnd", [{ x: x + 12, y, id: 2 }]);
  await touches(cdp, "touchEnd", []);
  await expect(
    page.locator("#target-label"),
    "a two-finger gesture must not accidentally choose an impact site",
  ).toHaveText("Tap a point on the planet");
  await page.touchscreen.tap(x, y);
  await expect(
    page.locator("#target-label"),
    "a deliberate single tap still chooses the impact site after a gesture",
  ).toContainText("°");
  expect(errors).toEqual([]);
  await context.close();
});
