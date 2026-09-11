import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

const renderer = await import("../src/cosmic-scene.ts").catch(() => ({}));
const star = {
  id: "star",
  name: "Host star",
  role: "star",
  radiusKm: 695700,
  massSolar: 1,
  temperatureK: 5772,
  color: "#ffcd83",
  appearance: "sunlike",
  description: "Test star",
};
const earth = {
  id: "planet",
  name: "Planet",
  role: "planet",
  radiusKm: 6371,
  color: "#6c98c4",
  appearance: "rocky",
  orbit: { semiMajorAU: 1, periodDays: 365.25, eccentricity: 0, phaseDeg: 0 },
  description: "Test planet",
};
const system = {
  id: "test",
  name: "Test system",
  kind: "system",
  tagline: "",
  description: "",
  distanceLy: 1,
  constellation: "",
  accent: "#aaccee",
  bodies: [star, earth],
  sources: [],
  modelNote: "",
};

function scene(destination = system) {
  assert.equal(typeof renderer.CosmicScene, "function");
  return new renderer.CosmicScene(destination, false);
}

test("cosmic true scale uses one physical scale for stellar radius, planet radius and orbital distances", () => {
  const view = scene();
  view.setScale(true);
  view.update(0, 0);
  const [sun, planet] = view.getTargets();
  assert.ok(
    Math.abs(sun.radius / planet.radius - star.radiusKm / earth.radiusKm) <
      1e-9,
  );
  assert.ok(
    Math.abs(
      planet.position.distanceTo(sun.position) / planet.radius -
        149597870.7 / earth.radiusKm,
    ) < 1e-7,
  );
  assert.ok(
    planet.position.distanceTo(sun.position) > sun.radius + planet.radius,
  );
  view.dispose();
});

test("cosmic orbit motion follows simulation time and closes after the catalogued period in both scales", () => {
  const view = scene();
  for (const real of [false, true]) {
    view.setScale(real);
    view.update(0, 1);
    const start = view.getTargets()[1].position;
    view.update(earth.orbit.periodDays / 4, 50);
    assert.ok(view.getTargets()[1].position.distanceTo(start) > 1);
    view.update(0, 500);
    assert.ok(
      view.getTargets()[1].position.distanceTo(start) < 1e-9,
      "visual animation must not move orbital positions",
    );
    view.update(earth.orbit.periodDays, 500);
    assert.ok(view.getTargets()[1].position.distanceTo(start) < 1e-8);
  }
  view.dispose();
});

test("cosmic body focus, picking and Sun comparison use current target geometry", () => {
  const view = scene();
  view.update(31, 0);
  const planet = view.getTargets()[1];
  const camera = view.cameraFor(planet.id);
  assert.ok(camera.target.distanceTo(planet.position) < 1e-9);
  assert.ok(camera.position.distanceTo(camera.target) > planet.radius);
  assert.ok(camera.minDistance > planet.radius);
  assert.ok(
    camera.position
      .clone()
      .sub(camera.target)
      .normalize()
      .dot(planet.position.clone().negate().normalize()) > 0.5,
    "planet focus initially reveals the illuminated hemisphere",
  );
  view.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(
    planet.position.clone().add(new THREE.Vector3(0, planet.radius * 5, 0)),
    new THREE.Vector3(0, -1, 0),
  );
  assert.equal(view.pick(ray), planet.id);
  view.dispose();
  const giant = scene({
    ...system,
    kind: "star",
    bodies: [{ ...star, radiusKm: star.radiusKm * 700 }],
  });
  const before = giant.getTargets().length;
  giant.setComparison(true);
  const target = giant
    .getTargets()
    .find((body) => body.id === "sun-comparison");
  assert.ok(target);
  assert.equal(giant.getTargets().length, before + 1);
  assert.ok(
    Math.abs(giant.getTargets()[0].radius / target.radius - 700) < 1e-7,
  );
  assert.ok(Number.isFinite(giant.cameraFor().position.length()));
  giant.setComparison(false);
  assert.equal(giant.getTargets().length, before);
  giant.dispose();
});

test("black-hole targets represent the horizon reference radius and all owned GPU resources are disposed", () => {
  const hole = scene({
    ...system,
    kind: "black-hole",
    bodies: [
      {
        ...star,
        id: "hole",
        name: "Black hole",
        role: "black-hole",
        radiusKm: 12000000,
        appearance: "black-hole",
      },
    ],
  });
  const target = hole.getTargets()[0];
  assert.equal(
    target.radius,
    1,
    "black-hole display units are Schwarzschild radii",
  );
  assert.ok(hole.cameraFor().position.length() > 12);
  const disposals = new Map();
  hole.group.traverse((object) => {
    for (const resource of [
      object.geometry,
      ...(Array.isArray(object.material) ? object.material : [object.material]),
    ]) {
      if (!resource || disposals.has(resource)) continue;
      disposals.set(resource, 0);
      resource.addEventListener("dispose", () =>
        disposals.set(resource, disposals.get(resource) + 1),
      );
    }
  });
  hole.dispose();
  assert.ok(disposals.size > 0);
  assert.ok([...disposals.values()].every((count) => count === 1));
  assert.equal(hole.group.children.length, 0);
});

test("focused cosmic worlds hide orbit guides and siblings, restore the overview, and skip invisible picking", () => {
  const view = scene();
  assert.equal(typeof view.setFocus, "function");
  view.update(15, 0);
  view.setFocus("planet");
  assert.equal(view.group.getObjectByName("cosmic-orbits").visible, false);
  assert.equal(view.group.getObjectByName("star").visible, false);
  assert.equal(view.group.getObjectByName("planet").visible, true);
  assert.equal(
    view.getTargets().length,
    2,
    "the catalogue and moving-target positions remain available",
  );
  assert.equal(
    view.pick(
      new THREE.Raycaster(
        new THREE.Vector3(0, 5, 0),
        new THREE.Vector3(0, -1, 0),
      ),
    ),
    undefined,
  );
  view.setScale(true);
  assert.equal(view.group.getObjectByName("cosmic-orbits").visible, false);
  view.setFocus();
  assert.equal(view.group.getObjectByName("cosmic-orbits").visible, true);
  assert.equal(view.group.getObjectByName("star").visible, true);
  view.dispose();
});
