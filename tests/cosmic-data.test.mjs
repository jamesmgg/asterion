import test from "node:test";
import assert from "node:assert/strict";

const cosmic = await import("../src/cosmic-data.ts").catch(() => ({}));

test("curated destinations contain the requested stars, systems and black holes with bounded physical data", () => {
  assert.equal(typeof cosmic.getCosmicDestination, "function");
  assert.equal(cosmic.COSMIC_DESTINATIONS.length, 8);
  assert.equal(new Set(cosmic.COSMIC_DESTINATIONS.map((d) => d.id)).size, 8);
  for (const destination of cosmic.COSMIC_DESTINATIONS) {
    assert.ok(
      destination.distanceLy > 0 && Number.isFinite(destination.distanceLy),
    );
    assert.ok(
      destination.sources.length > 0 && destination.modelNote.length > 40,
    );
    assert.ok(
      destination.sources.every((s) => new URL(s.url).protocol === "https:"),
    );
    assert.equal(
      destination.bodies.filter((b) => b.role !== "planet").length,
      1,
    );
    for (const body of destination.bodies) {
      assert.ok(Number.isFinite(body.radiusKm) && body.radiusKm > 1000);
      assert.ok(/^#[\da-f]{6}$/i.test(body.color));
      if (body.orbit) {
        assert.ok(body.orbit.periodDays > 0 && body.orbit.semiMajorAU > 0);
        const star = destination.bodies.find((b) => b.role === "star");
        assert.ok(
          body.orbit.semiMajorAU * 149597870.7 > star.radiusKm + body.radiusKm,
        );
      }
    }
  }
  assert.equal(
    cosmic
      .getCosmicDestination("trappist-1")
      .bodies.filter((b) => b.role === "planet").length,
    7,
  );
  assert.equal(
    cosmic
      .getCosmicDestination("kepler-90")
      .bodies.filter((b) => b.role === "planet").length,
    8,
  );
  assert.equal(
    cosmic
      .getCosmicDestination("proxima-centauri")
      .bodies.filter((b) => b.role === "planet").length,
    1,
  );
  assert.equal(cosmic.getCosmicDestination("unknown"), undefined);
});

test("Keplerian trajectories close, remain bounded, and follow the +Y north coordinate convention", () => {
  assert.equal(typeof cosmic.cosmicOrbitPosition, "function");
  const body = {
    orbit: {
      semiMajorAU: 2,
      periodDays: 100,
      eccentricity: 0.4,
      inclinationDeg: 30,
      phaseDeg: 0,
    },
  };
  assert.deepEqual(cosmic.cosmicOrbitPosition({}, 1000), [0, 0, 0]);
  const start = cosmic.cosmicOrbitPosition(body, 0);
  assert.ok(Math.abs(start[0] - 1.2) < 1e-10);
  assert.ok(
    Math.abs(Math.hypot(...cosmic.cosmicOrbitPosition(body, 50)) - 2.8) < 1e-10,
  );
  for (const elapsed of [-36525, -1, 0, 1, 12.5, 25, 99, 36525]) {
    const position = cosmic.cosmicOrbitPosition(body, elapsed);
    const closed = cosmic.cosmicOrbitPosition(body, elapsed + 100);
    assert.ok(Math.hypot(...position.map((v, i) => v - closed[i])) < 1e-9);
    assert.ok(
      Math.hypot(...position) >= 1.2 - 1e-10 &&
        Math.hypot(...position) <= 2.8 + 1e-10,
    );
  }
  const inclined = cosmic.cosmicOrbitPosition(
    { orbit: { semiMajorAU: 1, periodDays: 4, inclinationDeg: 30 } },
    1,
  );
  assert.ok(
    Math.abs(inclined[0]) < 1e-10 && Math.abs(inclined[1] - 0.5) < 1e-10,
  );
  assert.ok(Math.abs(inclined[2] + Math.sqrt(3) / 2) < 1e-10);
});

test("catalogue periods and orbital distances agree with their host masses", () => {
  assert.ok(cosmic.COSMIC_DESTINATIONS);
  for (const destination of cosmic.COSMIC_DESTINATIONS.filter(
    (d) => d.kind === "system",
  )) {
    const star = destination.bodies.find((b) => b.role === "star");
    for (const body of destination.bodies.filter((b) => b.orbit)) {
      const periodYears = body.orbit.periodDays / 365.2568983;
      const inferredSolarMass = body.orbit.semiMajorAU ** 3 / periodYears ** 2;
      assert.ok(
        Math.abs(inferredSolarMass / star.massSolar - 1) < 0.025,
        `${body.name} violates Kepler's third law`,
      );
    }
  }
});

test("Schwarzschild reference radii have physical mass scaling and reject invalid masses", () => {
  assert.equal(typeof cosmic.schwarzschildRadiusKm, "function");
  assert.ok(Math.abs(cosmic.schwarzschildRadiusKm(1) - 2.95325) < 0.00001);
  assert.ok(
    Math.abs(
      cosmic.schwarzschildRadiusKm(6.5e9) / cosmic.schwarzschildRadiusKm(4e6) -
        1625,
    ) < 1e-9,
  );
  for (const mass of [0, -1, NaN, Infinity])
    assert.throws(() => cosmic.schwarzschildRadiusKm(mass), RangeError);
});
