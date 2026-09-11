import test from "node:test";
import assert from "node:assert/strict";
const p = await import("../src/physics.ts").catch(() => ({}));
const earth = {
  mass: 5.9722e24,
  radius: 6371000,
  atmosphere: { density: 1.225, height: 8500 },
  kind: "rocky",
  targetDensity: 2750,
};
const moon = {
  mass: 7.342e22,
  radius: 1737400,
  atmosphere: null,
  kind: "rocky",
  targetDensity: 2750,
};
const impact = { diameter: 1000, speed: 20, angle: 45, material: "stone" };

test("Kepler solver reaches a small residual even for eccentric orbits", () => {
  assert.equal(
    typeof p.solveKepler,
    "function",
    "Kepler solver is implemented",
  );
  for (const e of [0, 0.0167, 0.206, 0.9])
    for (const m of [-3, 0, 0.5, 2.8]) {
      const E = p.solveKepler(m, e);
      assert.ok(Math.abs(E - e * Math.sin(E) - m) < 1e-10);
    }
});
test("Earth at J2000 agrees with published approximate heliocentric coordinates", () => {
  assert.equal(typeof p.planetPosition, "function");
  const pos = p.planetPosition("earth", 2451545);
  assert.ok(Math.abs(pos[0] - -0.17717) < 0.0001);
  assert.ok(Math.abs(pos[1] - 0.96721) < 0.0001);
  assert.ok(Math.abs(pos[2]) < 0.00001);
});
test("Nine-body solar system conserves energy and momentum over a simulated year", () => {
  assert.equal(typeof p.SolarSystem, "function");
  const sim = new p.SolarSystem(2461293);
  const start = sim.energy();
  const initialMomentum = sim.momentum();
  for (let i = 0; i < 365; i++) sim.advance(1);
  assert.equal(sim.bodies.length, 9);
  assert.ok(Math.abs((sim.energy() - start) / start) < 2e-5);
  const difference = sim.momentum().map((x, i) => x - initialMomentum[i]);
  assert.ok(Math.hypot(...difference) < 1e-17);
  assert.ok(
    sim.bodies.every((b) =>
      [...b.position, ...b.velocity].every(Number.isFinite),
    ),
  );
});
test("A paused orbit does not advance", () => {
  assert.equal(typeof p.SolarSystem, "function");
  const sim = new p.SolarSystem(2461293);
  const before = JSON.stringify(sim.bodies);
  sim.advance(0);
  assert.equal(JSON.stringify(sim.bodies), before);
});
test("Asteroid mass scales with diameter cubed and kinetic energy with speed squared in vacuum", () => {
  assert.equal(typeof p.calculateImpact, "function");
  const a = p.calculateImpact(moon, impact);
  const b = p.calculateImpact(moon, { ...impact, diameter: 2000 });
  const c = p.calculateImpact(moon, { ...impact, speed: 40 });
  assert.ok(Math.abs(b.mass / a.mass - 8) < 1e-10);
  assert.ok(Math.abs(c.entryEnergy / a.entryEnergy - 4) < 1e-10);
  assert.ok(Math.abs(a.mass - ((3000 * Math.PI) / 6) * 1e9) < 1);
});
test("Airless impacts conserve mechanical energy through gravitational acceleration", () => {
  assert.equal(typeof p.calculateImpact, "function");
  const result = p.calculateImpact(moon, impact);
  assert.equal(result.outcome, "crater");
  assert.equal(result.atmosphereEnergy, 0);
  const expected = Math.sqrt(
    20000 ** 2 +
      2 *
        6.6743e-11 *
        moon.mass *
        (1 / moon.radius - 1 / (moon.radius + result.entryAltitude)),
  );
  assert.ok(Math.abs(result.surfaceSpeed - expected) / expected < 0.005);
  assert.ok(result.craterDiameter > 1000 && result.craterDiameter < 60000);
});
test("Small stony Earth impactors deposit energy in the atmosphere", () => {
  assert.equal(typeof p.calculateImpact, "function");
  const result = p.calculateImpact(earth, {
    ...impact,
    diameter: 20,
    speed: 19,
  });
  assert.equal(result.outcome, "airburst");
  assert.ok(result.burstAltitude > 5000 && result.burstAltitude < 60000);
  assert.equal(result.craterDiameter, 0);
  assert.ok(result.atmosphereEnergy > result.entryEnergy * 0.5);
});
test("A kilometer iron body produces a crater and more ground energy than stone", () => {
  assert.equal(typeof p.calculateImpact, "function");
  const iron = p.calculateImpact(earth, { ...impact, material: "iron" });
  const stone = p.calculateImpact(earth, impact);
  assert.equal(iron.outcome, "crater");
  assert.ok(iron.surfaceEnergy > stone.surfaceEnergy);
  assert.ok(iron.craterDiameter > stone.craterDiameter);
});
test("Gas giants never report a solid surface crater", () => {
  assert.equal(typeof p.calculateImpact, "function");
  const result = p.calculateImpact(
    {
      ...earth,
      mass: 1.898e27,
      radius: 69911000,
      kind: "gas",
      atmosphere: { density: 0.16, height: 27000 },
    },
    impact,
  );
  assert.equal(result.outcome, "atmospheric plume");
  assert.equal(result.craterDiameter, 0);
});
test("Invalid impact inputs are rejected instead of returning misleading numbers", () => {
  assert.equal(typeof p.calculateImpact, "function");
  for (const bad of [
    { diameter: 0 },
    { speed: NaN },
    { angle: 0 },
    { angle: 100 },
    { material: "wood" },
  ]) {
    assert.throws(() => p.calculateImpact(earth, { ...impact, ...bad }));
  }
});
