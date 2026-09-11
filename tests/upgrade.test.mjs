import test from "node:test";
import assert from "node:assert/strict";
const debris = await import("../src/debris.ts").catch(() => ({}));
const detail = await import("../src/detail.ts").catch(() => ({}));
const satellites = await import("../src/satellites.ts").catch(() => ({}));
const { calculateImpact, G } = await import("../src/physics.ts");
const { PLANETS } = await import("../src/data.ts");
const moon = {
  mass: 7.342e22,
  radius: 1737400,
  atmosphere: null,
  kind: "rocky",
  targetDensity: 2750,
  rotation: 655.7,
};
test("ballistic debris conserves orbital energy and angular momentum in vacuum", () => {
  assert.equal(typeof debris.propagate, "function");
  const mu = G * moon.mass,
    r = moon.radius * 1.1,
    v = Math.sqrt(mu / r);
  const state = { position: [r, 0, 0], velocity: [0, v, 0] };
  const period = 2 * Math.PI * Math.sqrt(r ** 3 / mu);
  const next = debris.propagate(state, period, moon);
  assert.ok(
    Math.hypot(...next.position.map((p, i) => p - state.position[i])) / r <
      2e-5,
  );
  const e = (s) =>
    0.5 * Math.hypot(...s.velocity) ** 2 - mu / Math.hypot(...s.position);
  assert.ok(Math.abs((e(next) - e(state)) / e(state)) < 1e-6);
});
test("surface ejecta cannot become a stable moon merely by having negative energy", () => {
  assert.equal(typeof debris.orbitClass, "function");
  const mu = G * moon.mass,
    r = moon.radius;
  assert.equal(
    debris.orbitClass({ position: [0, 0, r], velocity: [900, 0, 900] }, mu, r),
    "reimpact",
  );
  assert.equal(
    debris.orbitClass({ position: [0, 0, r], velocity: [0, 0, 3000] }, mu, r),
    "escape",
  );
  assert.equal(
    debris.orbitClass(
      { position: [r * 2, 0, 0], velocity: [0, Math.sqrt(mu / (r * 2)), 0] },
      mu,
      r,
    ),
    "orbit",
  );
});
test("ejecta carries explicit mass, obeys an energy budget, and includes falling and escaping material", () => {
  assert.equal(typeof debris.createEjecta, "function");
  const input = { diameter: 10000, speed: 30, angle: 45, material: "stone" };
  const result = calculateImpact(moon, input),
    cloud = debris.createEjecta(moon, result, 128);
  assert.ok(cloud.totalMass > 0);
  assert.ok(cloud.kineticEnergy <= result.surfaceEnergy * 0.15 * (1 + 1e-10));
  assert.ok(
    Math.abs(cloud.packets.reduce((s, p) => s + p.mass, 0) - cloud.totalMass) /
      cloud.totalMass <
      1e-10,
  );
  assert.ok(cloud.packets.some((p) => p.fate === "escape"));
  assert.ok(cloud.packets.some((p) => p.fate === "reimpact"));
  assert.ok(cloud.packets.every((p) => p.fate !== "orbit"));
});
test("airbursts and gas plumes do not excavate fictional terrain or launch crust", () => {
  assert.equal(typeof debris.createEjecta, "function");
  for (const planet of [
    PLANETS.find((p) => p.id === "earth"),
    PLANETS.find((p) => p.id === "jupiter"),
  ]) {
    const result = calculateImpact(planet, {
      diameter: 20,
      speed: 19,
      angle: 18,
      material: "stone",
    });
    assert.equal(debris.createEjecta(planet, result, 64).totalMass, 0);
  }
});
test("terrain tile UVs cover the globe without holes, including the longitude seam", () => {
  assert.equal(typeof detail.tileBounds, "function");
  for (let l = 0; l <= 4; l++) {
    const nx = 2 ** (l + 1),
      ny = 2 ** l;
    let area = 0;
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const b = detail.tileBounds(l, x, y);
        area += (b.u1 - b.u0) * (b.v1 - b.v0);
        assert.ok(b.u0 >= 0 && b.u1 <= 1 && b.v0 >= 0 && b.v1 <= 1);
      }
    assert.ok(Math.abs(area - 1) < 1e-10);
  }
});
test("detail selection grows with screen demand and respects the dataset ceiling", () => {
  assert.equal(typeof detail.detailLevel, "function");
  assert.ok(detail.detailLevel(10000, 4) > detail.detailLevel(500, 4));
  assert.equal(detail.detailLevel(1e9, 3), 3);
});
test("satellite catalogue has measured radii and closed reference orbits", () => {
  assert.ok(satellites.MOONS?.length >= 8, "eight major moons are available");
  for (const moon of satellites.MOONS) {
    const a = satellites.satellitePosition(moon, 2451545),
      b = satellites.satellitePosition(moon, 2451545 + moon.year);
    assert.ok(moon.radius > 100000 && moon.radius < 3000000);
    assert.ok(Math.hypot(...a.map((v, i) => v - b[i])) / moon.orbit.a < 1e-6);
  }
});
test("eclipse geometry distinguishes full sunlight, penumbra and totality", () => {
  assert.equal(typeof satellites.discVisibility, "function");
  assert.equal(satellites.discVisibility(0.005, 0.01, 0), 0);
  assert.equal(satellites.discVisibility(0.005, 0.01, 0.02), 1);
  const partial = satellites.discVisibility(0.005, 0.005, 0.005);
  assert.ok(partial > 0 && partial < 1);
});
test("JPL vector interpolation uses velocities and respects its supported dates", () => {
  assert.equal(typeof satellites.interpolateVectors, "function");
  const table = {
    start: 2451545,
    step: 1,
    states: [
      [0, 0, 0, 1, 2, 3],
      [86400, 172800, 259200, 1, 2, 3],
    ],
  };
  assert.deepEqual(
    satellites.interpolateVectors(table, 2451545.5),
    [43200, 86400, 129600],
  );
  assert.equal(satellites.interpolateVectors(table, 2451544), null);
});
