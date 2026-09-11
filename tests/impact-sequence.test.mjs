import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { PLANETS } from "../src/data.ts";
import { calculateImpact } from "../src/physics.ts";
import { ImpactSequence } from "../src/impact-scene.ts";

test("the cinematic dust plume clears before final crater inspection and returns when scrubbing backward", () => {
  const planet = PLANETS.find((p) => p.id === "earth");
  const input = { diameter: 1000, speed: 20, angle: 60, material: "stone" };
  const sequence = new ImpactSequence(
    planet,
    input,
    calculateImpact(planet, input),
    new THREE.Vector3(0, 0, 1),
    new THREE.Texture(),
    true,
    () => {},
    () => {},
  );
  try {
    sequence.seek(1);
    assert.equal(
      sequence.plume.material.opacity,
      0,
      "overlapping large dust sprites must not permanently wash out the crater",
    );
    sequence.seek(0.4);
    assert.ok(
      sequence.plume.material.opacity > 0.05,
      "the excavation stage still has a visible plume",
    );
    sequence.seek(0);
    assert.equal(sequence.plume.material.opacity, 0);
  } finally {
    sequence.dispose();
  }
});
