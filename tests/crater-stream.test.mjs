import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { TerrainStream } from "../src/terrain.ts";
import { createCraterGeometry } from "../src/craters.ts";

function harness(maxLevel = 2) {
  const requests = new Map();
  const original = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = (url, ready) => {
    const texture = new THREE.Texture();
    requests.set(url, () => ready(texture));
    return texture;
  };
  const uniforms = {
    dayMap: { value: new THREE.Texture() },
    craterPatch: { value: 0 },
    craterPatchIndex: { value: -1 },
    patchTiled: { value: 0 },
    patchRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  };
  const stream = new TerrainStream(
    "earth",
    { maxLevel, width: 16384, url: "" },
    uniforms,
    40,
  );
  const scars = new THREE.Group();
  let time = 0;
  return {
    stream,
    scars,
    requests,
    scar(center = new THREE.Vector3(0, 0, 1), index = 0) {
      const mesh = new THREE.Mesh(
        createCraterGeometry(center, 0.025, true),
        new THREE.ShaderMaterial({
          uniforms: {
            ...uniforms,
            craterPatch: { value: 1 },
            craterPatchIndex: { value: index },
          },
        }),
      );
      mesh.userData.craterIndex = index;
      scars.add(mesh);
      return mesh;
    },
    step() {
      time += 100;
      return stream.update(new THREE.Vector3(0, 0, 1.05), 1000, true, time);
    },
    flush() {
      for (const ready of requests.values()) ready();
      requests.clear();
    },
    draws() {
      return stream.group.children.filter(
        (mesh) => mesh.userData.craterIndex !== undefined,
      );
    },
    dispose() {
      stream.dispose();
      for (const scar of scars.children) {
        scar.geometry.dispose();
        scar.material.dispose();
      }
      THREE.TextureLoader.prototype.load = original;
    },
  };
}

test("craters switch atomically to the same streamed imagery and tile clips as the ground", () => {
  assert.equal(typeof TerrainStream.prototype.syncCraters, "function");
  const h = harness(0);
  try {
    const scar = h.scar();
    h.step();
    h.stream.syncCraters(h.scars, false);
    assert.equal(scar.visible, true);
    assert.equal(h.draws().length, 0);
    h.flush();
    assert.equal(h.step(), true);
    h.stream.syncCraters(h.scars, true);
    assert.equal(scar.visible, false);
    assert.equal(
      h.draws().length,
      1,
      "only the intersecting hemisphere receives a crater draw",
    );
    const draw = h.draws()[0],
      tile = [...h.stream.tiles.values()].find((tile) => tile.x === 0);
    assert.equal(draw.geometry, scar.geometry);
    assert.equal(
      draw.material.uniforms.dayMap,
      tile.mesh.material.uniforms.dayMap,
    );
    assert.equal(
      draw.material.uniforms.tiled.value,
      0,
      "root cover retains resident global imagery",
    );
    assert.equal(
      draw.material.uniforms.patchTiled.value,
      1,
      "global imagery still clips to this hemisphere",
    );
    assert.equal(
      draw.material.uniforms.patchRect,
      tile.mesh.material.uniforms.tileRect,
    );
    assert.equal(
      draw.material.uniforms.craterPatchIndex,
      scar.material.uniforms.craterPatchIndex,
    );
    assert.equal(draw.material.polygonOffset, false);
    assert.equal(h.stream.groundResolution, 128);
  } finally {
    h.dispose();
  }
});

test("craters inherit LOD parent fades and reuse draws without requesting their own imagery", () => {
  assert.equal(typeof TerrainStream.prototype.syncCraters, "function");
  const h = harness();
  try {
    const scar = h.scar();
    for (let i = 0; i < 25; i++) {
      h.step();
      h.flush();
    }
    const requests = h.requests.size;
    h.stream.syncCraters(h.scars, true);
    assert.equal(h.requests.size, requests);
    const draws = h.draws();
    assert.ok(
      draws.length > 0 && draws.length <= 4,
      "a small patch only intersects its nearby tiles",
    );
    for (const draw of draws) {
      const matching = [...h.stream.tiles.values()].find(
        (tile) =>
          tile.mesh.material.uniforms.dayMap === draw.material.uniforms.dayMap,
      );
      assert.ok(matching && matching.mesh.visible);
      assert.equal(
        draw.material.uniforms.parentMap,
        matching.mesh.material.uniforms.parentMap,
      );
      assert.equal(
        draw.material.uniforms.parentRect,
        matching.mesh.material.uniforms.parentRect,
      );
      assert.equal(
        draw.material.uniforms.detailBlend,
        matching.mesh.material.uniforms.detailBlend,
      );
      matching.mesh.material.uniforms.detailBlend.value = 0.123;
      assert.equal(draw.material.uniforms.detailBlend.value, 0.123);
    }
    h.stream.syncCraters(h.scars, true);
    assert.deepEqual(h.draws(), draws);
    assert.equal(scar.visible, false);
    h.stream.syncCraters(h.scars, false);
    assert.equal(scar.visible, true);
    assert.ok(h.draws().every((draw) => !draw.visible));
  } finally {
    h.dispose();
  }
});

test("seam-spanning crater imagery draws both neighboring hemispheres", () => {
  assert.equal(typeof TerrainStream.prototype.syncCraters, "function");
  const h = harness(0);
  try {
    h.scar(new THREE.Vector3(-1, 0, 0));
    h.step();
    h.flush();
    h.step();
    h.stream.syncCraters(h.scars, true);
    assert.equal(h.draws().length, 2);
  } finally {
    h.dispose();
  }
});

test("scar replacement, tile eviction and stream disposal release materials but preserve shared geometry", () => {
  assert.equal(typeof TerrainStream.prototype.syncCraters, "function");
  const h = harness(0);
  try {
    const scar = h.scar();
    let geometryDisposals = 0,
      materialDisposals = 0;
    scar.geometry.addEventListener("dispose", () => geometryDisposals++);
    h.step();
    h.flush();
    h.step();
    h.stream.syncCraters(h.scars, true);
    h.draws()[0].material.addEventListener(
      "dispose",
      () => materialDisposals++,
    );
    scar.removeFromParent();
    const replacement = h.scar();
    h.stream.syncCraters(h.scars, true);
    assert.equal(materialDisposals, 1);
    assert.equal(geometryDisposals, 0);
    assert.equal(h.draws()[0].geometry, replacement.geometry);
    const tile = [...h.stream.tiles.values()].find((tile) => tile.x === 0);
    h.draws()[0].material.addEventListener(
      "dispose",
      () => materialDisposals++,
    );
    h.stream.disposeTile(tile);
    h.stream.tiles.delete("0/0-0");
    assert.equal(h.draws().length, 0);
    assert.equal(materialDisposals, 2);
    assert.equal(geometryDisposals, 0);
    h.stream.dispose();
    assert.equal(
      replacement.visible,
      true,
      "fallback crater is restored when detail is disabled",
    );
    scar.geometry.dispose();
    scar.material.dispose();
  } finally {
    h.dispose();
  }
});
