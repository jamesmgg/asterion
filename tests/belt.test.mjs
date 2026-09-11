import test from "node:test";
import assert from "node:assert/strict";
const belt = await import("../src/belt.ts").catch(() => ({}));

test("main-belt representatives remain between Mars and Jupiter in both display scales", () => {
  assert.equal(typeof belt.AsteroidBelt, "function");
  const field = new belt.AsteroidBelt(512);
  for (const jd of [2451545, 2461300, 2480000]) {
    for (const trueScale of [false, true]) {
      field.update(jd, trueScale);
      const positions = field.points.geometry.getAttribute("position");
      assert.equal(positions.count, 512);
      for (let i = 0; i < positions.count; i++) {
        const radius = Math.hypot(
          positions.getX(i),
          positions.getY(i),
          positions.getZ(i),
        );
        assert.ok(
          trueScale
            ? radius > 1.9 * 1.15 && radius < 3.6 * 1.15
            : radius > 14.9 && radius < 17.7,
        );
      }
    }
  }
  field.dispose();
});

test("belt orbits are reproducible, close after their Kepler periods, and follow simulation time", () => {
  assert.equal(typeof belt.beltPosition, "function");
  assert.deepEqual(belt.makeBeltPopulation(8), belt.makeBeltPopulation(8));
  const field = new belt.AsteroidBelt(8);
  field.update(2451545, true);
  const before = Array.from(
    field.points.geometry.getAttribute("position").array,
  );
  field.update(2451545, true);
  assert.deepEqual(
    Array.from(field.points.geometry.getAttribute("position").array),
    before,
  );
  field.update(2451645, true);
  assert.notDeepEqual(
    Array.from(field.points.geometry.getAttribute("position").array),
    before,
  );
  for (const orbit of belt.makeBeltPopulation(16)) {
    const a = belt.beltPosition(orbit, 2451545),
      b = belt.beltPosition(orbit, 2451545 + orbit.period);
    assert.ok(Math.hypot(...a.map((v, i) => v - b[i])) < 1e-9);
    assert.ok(orbit.period > 1000 && orbit.period < 2200);
  }
  field.dispose();
});
