import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Observatory } from "../src/scene.ts";
import { PLANETS } from "../src/data.ts";
import { calculateImpact } from "../src/physics.ts";

function harness() {
  const u = {
    craters: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
    craterDepths: { value: new Float32Array(8) },
    craterComplexities: { value: new Float32Array(8) },
    craterAges: { value: new Float32Array(8) },
    craterCount: { value: 0 },
    craterStart: { value: 0 },
  };
  const world = {
    material: { uniforms: u },
    mesh: new THREE.Mesh(),
    scars: new THREE.Group(),
  };
  const view = {
    selected: "earth",
    targetLocal: new THREE.Vector3(0, 0, 1),
    worlds: new Map([["earth", world]]),
    mobile: true,
  };
  const result = calculateImpact(
    PLANETS.find((p) => p.id === "earth"),
    { diameter: 1000, speed: 20, angle: 45, material: "stone" },
  );
  return {
    view,
    world,
    result,
    add() {
      Observatory.prototype.addCrater.call(view, result);
    },
  };
}

test("impact terrain keeps physical depth and one independently owned surface per crater", () => {
  const h = harness();
  h.add();
  const patch = h.world.scars.children[0];
  assert.equal(
    patch.material.polygonOffset,
    false,
    "depth bias must not push ground through clouds",
  );
  assert.equal(patch.material.uniforms.craterPatchIndex.value, 0);
  assert.equal(h.world.material.uniforms.craterAges.value[0], 1);
  assert.ok(h.world.material.uniforms.craterComplexities.value[0] > 0);
});

test("repeated impacts keep eight patches and monotonically ordered ownership after wraparound", () => {
  const h = harness();
  for (let i = 0; i < 10; i++) h.add();
  assert.equal(h.world.scars.children.length, 8);
  assert.equal(h.world.material.uniforms.craterCount.value, 8);
  assert.equal(h.world.material.uniforms.craterAges.value[1], 10);
  assert.equal(
    new Set(
      h.world.scars.children.map(
        (p) => p.material.uniforms.craterPatchIndex.value,
      ),
    ).size,
    8,
  );
  Observatory.prototype.clearScars.call(h.view);
  assert.equal(h.world.scars.children.length, 0);
  assert.equal(h.world.material.uniforms.craterCount.value, 0);
});

test("airbursts leave the terrain intact", () => {
  const h = harness();
  Observatory.prototype.addCrater.call(h.view, {
    ...h.result,
    outcome: "airburst",
  });
  assert.equal(h.world.scars.children.length, 0);
  assert.equal(h.world.material.uniforms.craterCount.value, 0);
});
