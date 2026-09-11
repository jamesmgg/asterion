import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Observatory } from "../src/scene.ts";
import { GlobeControls } from "../src/globe-controls.ts";
import { PLANETS } from "../src/data.ts";

function encounterCamera() {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(1.04, 0.12, 0.08);
  const controls = {
    target: new THREE.Vector3(1, 0, 0),
    minDistance: 0.00008,
    maxDistance: 180,
    surfaceRadius: 0,
    cancelled: 0,
    cancelMotion() {
      this.cancelled++;
    },
    transitionTarget(target) {
      this.target.copy(target);
    },
    update() {},
  };
  camera.lookAt(controls.target);
  return {
    camera,
    controls,
    view: "planet",
    selected: "earth",
    terrainEnabled: true,
    datasets: { "earth-height": { max: 8848 } },
    desiredCamera: new THREE.Vector3(1.02, 0, 0),
    followAsteroid: true,
    entry: {
      time: 1,
      dispose() {
        this.disposed = true;
      },
    },
    targetLocal: new THREE.Vector3(1, 0, 0),
    worlds: new Map(),
    beginNavigation: Observatory.prototype.beginNavigation,
    navigationFloor: Observatory.prototype.navigationFloor,
    onNavigation() {},
  };
}

test("manual orbit releases impact tracking and restores planet-centered navigation without erasing the encounter", () => {
  const scene = encounterCamera(),
    entry = scene.entry;
  const position = scene.camera.position.clone(),
    rotation = scene.camera.quaternion.clone();
  assert.equal(typeof scene.beginNavigation, "function");
  scene.beginNavigation("orbit");
  assert.equal(scene.followAsteroid, false);
  assert.equal(scene.desiredCamera, null);
  assert.equal(scene.controls.target.length(), 0);
  assert.equal(scene.controls.surfaceRadius, 1);
  assert.ok(
    scene.controls.minDistance >
      1 + 8848 / PLANETS.find((p) => p.id === "earth").radius,
  );
  assert.deepEqual(
    scene.camera.position,
    position,
    "handing off the camera must not teleport its position",
  );
  assert.ok(
    scene.camera.quaternion.equals(rotation),
    "the controller eases the orientation handoff",
  );
  assert.equal(scene.entry, entry);
  assert.equal(entry.disposed, undefined);
  assert.deepEqual(scene.targetLocal.toArray(), [1, 0, 0]);
});

test("zoom interrupts incoming tracking but retains a settled crater's reversible zoom pivot", () => {
  const scene = encounterCamera();
  assert.equal(typeof scene.beginNavigation, "function");
  scene.beginNavigation("zoom");
  assert.equal(scene.followAsteroid, false);
  assert.equal(
    scene.controls.target.length(),
    0,
    "a moving asteroid is not a persistent zoom pivot",
  );
  scene.controls.target.set(1, 0, 0);
  scene.controls.surfaceRadius = 0;
  scene.beginNavigation("zoom");
  assert.deepEqual(scene.controls.target.toArray(), [1, 0, 0]);
});

test("ending an encounter releases its surface pivot before ordinary simulation resumes", () => {
  const scene = encounterCamera(),
    entry = scene.entry;
  Observatory.prototype.clearEvent.call(scene);
  assert.equal(scene.controls.target.length(), 0);
  assert.equal(scene.followAsteroid, false);
  assert.equal(scene.entry, null);
  assert.equal(entry.disposed, true);
});

test("manual cosmic navigation preserves the selected floating-origin target and distance limits", () => {
  const scene = encounterCamera();
  scene.view = "cosmic";
  scene.controls.minDistance = 1e-7;
  scene.controls.maxDistance = 0.002;
  assert.equal(typeof scene.beginNavigation, "function");
  scene.beginNavigation("orbit");
  assert.deepEqual(scene.controls.target.toArray(), [1, 0, 0]);
  assert.equal(scene.controls.minDistance, 1e-7);
  assert.equal(scene.controls.maxDistance, 0.002);
});

test("a real controller preserves small-crater altitude on the first free-orbit frame", () => {
  const radius = PLANETS.find((planet) => planet.id === "earth").radius;
  for (const altitude of [2128, 450]) {
    const scene = encounterCamera();
    const surface = {
      style: { touchAction: "none" },
      addEventListener() {},
      removeEventListener() {},
      getBoundingClientRect() {
        return { width: 390, height: 664 };
      },
    };
    scene.camera.position.set(
      1 + altitude / radius,
      (altitude * 0.55) / radius,
      0,
    );
    scene.controls = new GlobeControls(scene.camera, surface);
    scene.controls.target.set(1, 0, 0);
    scene.controls.minDistance = 0.00008;
    scene.controls.maxDistance = 180;
    scene.controls.update(1 / 60);
    scene.followAsteroid = false;
    scene.entry.time = 30;
    scene.worlds.set("earth", { mesh: new THREE.Object3D() });
    scene.surfaceHeight = () => 0;
    const position = scene.camera.position.clone();
    scene.beginNavigation("orbit");
    // The previous test's fake update() misses a newly raised minDistance
    // clamping the first rendered frame several kilometers away from the scar.
    scene.controls.update(1 / 60);
    assert.ok(
      scene.camera.position.distanceTo(position) * radius < 0.1,
      `${altitude} m crater view must not jump outward on manual handoff`,
    );
    assert.equal(scene.controls.target.length(), 0);
    for (let frame = 0; frame < 30; frame++) scene.controls.update(1 / 60);
    assert.ok(scene.camera.position.distanceTo(position) * radius < 0.1);
    assert.ok(
      scene.camera
        .getWorldDirection(new THREE.Vector3())
        .dot(position.clone().negate().normalize()) > 0.999999,
    );
    scene.controls.dispose();
  }
});

test("manual handoff reports free orbit so the encounter camera selector can return to the site", () => {
  const scene = encounterCamera();
  let handoffs = 0;
  scene.onNavigation = () => handoffs++;
  scene.beginNavigation("orbit");
  assert.equal(handoffs, 1);
  scene.controls.target.set(1, 0, 0);
  scene.beginNavigation("zoom");
  assert.equal(handoffs, 1, "a settled site zoom keeps its camera preset");
});
