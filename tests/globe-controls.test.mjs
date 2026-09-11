import assert from "node:assert/strict";
import test from "node:test";
import { PerspectiveCamera, Vector3 } from "three";
import { GlobeControls } from "../src/globe-controls.ts";

class Surface {
  style = { touchAction: "pan-y" };
  clientWidth = 800;
  clientHeight = 600;
  listeners = new Map();
  captures = new Set();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
  getRootNode() {
    return this;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 800, height: 600 };
  }
  setPointerCapture(id) {
    this.captures.add(id);
  }
  hasPointerCapture(id) {
    return this.captures.has(id);
  }
  releasePointerCapture(id) {
    this.captures.delete(id);
  }
  fire(type, id = 1, x = 400, y = 300, extra = {}) {
    const event = {
      type,
      pointerId: id,
      pointerType: "touch",
      clientX: x,
      clientY: y,
      pageX: x,
      pageY: y,
      button: 0,
      buttons: 1,
      preventDefault() {},
      ...extra,
    };
    for (const listener of [...(this.listeners.get(type) ?? [])])
      listener(event);
  }
}
function setup() {
  const camera = new PerspectiveCamera(38, 4 / 3, 0.001, 100);
  camera.position.set(0, 0, 3);
  const surface = new Surface();
  const controls = new GlobeControls(camera, surface);
  controls.enableDamping = false;
  controls.enablePan = false;
  controls.minDistance = 1.001;
  controls.maxDistance = 15;
  return { camera, surface, controls };
}
test("vertical swipes can cross a pole without locking or changing drag axes", () => {
  const { camera, surface, controls } = setup();
  surface.fire("pointerdown", 1, 400, 500);
  for (let y = 480; y >= -100; y -= 20) surface.fire("pointermove", 1, 400, y);
  assert.ok(
    camera.up.y < 0.9,
    "camera up must move with a free globe rotation",
  );
  assert.ok(
    Math.abs(camera.up.dot(camera.position.clone().normalize())) < 1e-8,
  );
  assert.ok(Math.abs(camera.position.length() - 3) < 1e-8);
  controls.dispose();
});
test("two fingers combine pinch, twist, and centroid orbit in one gesture", () => {
  const { camera, surface, controls } = setup();
  surface.fire("pointerdown", 1, 300, 300);
  surface.fire("pointerdown", 2, 500, 300);
  surface.fire("pointermove", 1, 300, 210);
  surface.fire("pointermove", 2, 600, 410);
  assert.ok(camera.position.length() < 2.5, "spread fingers should zoom in");
  assert.ok(
    Math.abs(camera.up.x) > 0.1,
    "twisting fingers should roll the globe",
  );
  assert.ok(
    Math.abs(camera.position.x) > 0.05,
    "moving both fingers should orbit",
  );
  assert.deepEqual(
    controls.target.toArray(),
    [0, 0, 0],
    "gesture should not pan off the planet",
  );
  controls.dispose();
});
test("adding and lifting a second finger does not jump the camera", () => {
  const { camera, surface, controls } = setup();
  surface.fire("pointerdown", 1, 300, 300);
  surface.fire("pointermove", 1, 320, 320);
  const before = camera.position.clone();
  surface.fire("pointerdown", 2, 500, 300);
  controls.update();
  assert.ok(camera.position.distanceTo(before) < 1e-10);
  surface.fire("pointerup", 2, 500, 300);
  surface.fire("pointermove", 1, 320, 320);
  assert.ok(camera.position.distanceTo(before) < 1e-10);
  surface.fire("pointermove", 1, 340, 320);
  assert.ok(camera.position.distanceTo(before) > 0.01);
  controls.dispose();
});
test("pointer cancellation ends the gesture and releases all capture", () => {
  const { camera, surface, controls } = setup();
  let starts = 0,
    ends = 0;
  controls.addEventListener("start", () => starts++);
  controls.addEventListener("end", () => ends++);
  surface.fire("pointerdown", 1, 300, 300);
  surface.fire("pointerdown", 2, 500, 300);
  surface.fire("pointermove", 1, 305, 300);
  surface.fire("pointercancel", 1);
  surface.fire("pointercancel", 2);
  assert.equal(starts, 1);
  assert.equal(ends, 1);
  assert.equal(surface.captures.size, 0);
  const before = camera.position.clone();
  surface.fire("pointermove", 1, 100, 100);
  assert.ok(camera.position.equals(before));
  controls.dispose();
});
test("mouse drag and wheel zoom preserve the target and distance limits", () => {
  const { camera, surface, controls } = setup();
  surface.fire("pointerdown", 1, 400, 300, { pointerType: "mouse" });
  surface.fire("pointermove", 1, 500, 360, { pointerType: "mouse" });
  surface.fire("pointerup", 1, 500, 360, { pointerType: "mouse" });
  assert.ok(Math.abs(camera.position.x) > 0.05);
  surface.fire("wheel", 1, 0, 0, { deltaY: -10000, deltaMode: 0 });
  assert.ok(camera.position.length() >= controls.minDistance - 1e-10);
  assert.ok(camera.position.length() < 3);
  surface.fire("wheel", 1, 0, 0, { deltaY: 10000, deltaMode: 0 });
  assert.ok(camera.position.length() <= controls.maxDistance + 1e-10);
  assert.deepEqual(controls.target.toArray(), [0, 0, 0]);
  controls.dispose();
});
test("manual camera and up changes remain authoritative after cancelling inertia", () => {
  const { camera, surface, controls } = setup();
  controls.enableDamping = true;
  surface.fire("pointerdown", 1, 400, 300);
  surface.fire("pointermove", 1, 500, 300);
  surface.fire("pointerup", 1, 500, 300);
  controls.cancelMotion();
  camera.position.set(0, 4, 3);
  camera.up.set(0, 1, 0);
  controls.target.set(1, 0, 0);
  controls.update();
  const next = camera.position.clone();
  for (let i = 0; i < 15; i++) controls.update();
  assert.ok(camera.position.distanceTo(next) < 1e-10);
  assert.ok(
    camera
      .getWorldDirection(new Vector3())
      .dot(controls.target.clone().sub(next).normalize()) > 0.999999,
  );
  controls.dispose();
});
test("close-up finger drags scale to surface altitude instead of spinning the whole globe", () => {
  const far = setup(),
    near = setup();
  far.controls.surfaceRadius = near.controls.surfaceRadius = 1;
  near.camera.position.set(0, 0, 1.003);
  for (const s of [far, near]) {
    s.controls.update();
    s.surface.fire("pointerdown", 1, 400, 300);
    s.surface.fire("pointermove", 1, 500, 300);
  }
  assert.ok(
    Math.abs(near.camera.position.x) < Math.abs(far.camera.position.x) * 0.02,
  );
  for (const s of [far, near]) s.controls.dispose();
});
test("leaving a local impact target preserves position and eases the view back toward the globe", () => {
  const { camera, controls } = setup();
  controls.target.set(1, 0, 0);
  controls.update();
  const position = camera.position.clone();
  const orientation = camera.quaternion.clone();
  assert.equal(typeof controls.transitionTarget, "function");
  controls.transitionTarget(new Vector3(), 0.2);
  assert.ok(camera.position.equals(position));
  assert.ok(
    camera.quaternion.angleTo(orientation) < 1e-7,
    "handoff must not snap the current view",
  );
  assert.deepEqual(
    controls.target.toArray(),
    [0, 0, 0],
    "user orbit uses the globe center immediately",
  );
  controls.update(0.1);
  const intermediate = camera.quaternion.clone();
  assert.ok(
    intermediate.angleTo(orientation) > 0.01,
    "view should move toward the globe",
  );
  controls.update(0.1);
  assert.ok(
    camera
      .getWorldDirection(new Vector3())
      .dot(position.clone().negate().normalize()) > 0.999999,
  );
  assert.ok(camera.quaternion.angleTo(intermediate) > 1e-5);
  controls.dispose();
});
test("surface taps do not claim the camera and gesture starts distinguish orbit from zoom", () => {
  const { surface, controls } = setup();
  const interactions = [];
  controls.addEventListener("start", (event) =>
    interactions.push(event.interaction),
  );
  surface.fire("pointerdown", 1, 300, 300);
  surface.fire("pointermove", 1, 301, 300);
  surface.fire("pointerup", 1, 301, 300);
  assert.deepEqual(
    interactions,
    [],
    "an aim tap must leave the scripted camera alone",
  );
  surface.fire("pointerdown", 1, 300, 300);
  surface.fire("pointermove", 1, 330, 300);
  surface.fire("pointerup", 1, 330, 300);
  surface.fire("wheel", 1, 0, 0, { deltaY: 30, deltaMode: 0 });
  surface.fire("pointerdown", 1, 300, 300, { pointerType: "mouse", button: 1 });
  surface.fire("pointermove", 1, 300, 330, { pointerType: "mouse", button: 1 });
  surface.fire("pointerup", 1, 300, 330, { pointerType: "mouse", button: 1 });
  assert.deepEqual(interactions, ["orbit", "zoom", "zoom"]);
  controls.dispose();
});
