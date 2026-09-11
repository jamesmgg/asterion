import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { TerrainStream } from "../src/terrain.ts";
import { Observatory } from "../src/scene.ts";
import { PLANETS } from "../src/data.ts";
import { AU } from "../src/physics.ts";
import { tileBounds } from "../src/detail.ts";
import * as detail from "../src/detail.ts";

test("the near clipping plane stays ahead of the closest measured terrain", () => {
  assert.equal(typeof detail.closeUpNearPlane, "function");
  for (const relief of [0, 0.001, 0.007, 0.02]) {
    const altitude = relief + 0.001;
    assert.ok(
      detail.closeUpNearPlane(1 + altitude, relief) < altitude - relief,
    );
    assert.ok(detail.closeUpNearPlane(1 + altitude, relief) > 0);
  }
  assert.equal(detail.closeUpNearPlane(5, 0), 0.005);
});

function streamHarness(budget = 80) {
  const requests = new Map();
  const original = THREE.TextureLoader.prototype.load;
  THREE.TextureLoader.prototype.load = function (url, ready, _, failed) {
    const texture = new THREE.Texture();
    requests.set(url, { ready, failed, texture });
    return texture;
  };
  const stream = new TerrainStream(
    "earth",
    { maxLevel: 4, width: 16384, url: "" },
    {
      dayMap: { value: new THREE.Texture() },
    },
    budget,
  );
  let time = 0;
  return {
    stream,
    requests,
    step(camera = new THREE.Vector3(0, 0, 2), pixels = 1000) {
      time += 100;
      return stream.update(camera, pixels, true, time);
    },
    flush() {
      for (const [url, request] of requests) {
        request.ready(request.texture);
        requests.delete(url);
      }
    },
    dispose() {
      stream.dispose();
      THREE.TextureLoader.prototype.load = original;
    },
  };
}

test("true scale uses one physical unit for Sun, every planet, and orbital positions", () => {
  assert.equal(
    typeof Observatory.prototype.mapRadius,
    "function",
    "true scale needs physical body radii",
  );
  const view = { trueScale: true };
  const earth = PLANETS.find((p) => p.id === "earth");
  const sun = PLANETS[0];
  const earthDistance = Observatory.prototype.mapPosition
    .call(view, [1, 0, 0], "earth")
    .length();
  for (const body of PLANETS) {
    const radius = Observatory.prototype.mapRadius.call(view, body);
    assert.ok(Math.abs(radius / earthDistance - body.radius / AU) < 1e-12);
    assert.ok(
      Math.abs(
        radius / Observatory.prototype.mapRadius.call(view, sun) -
          body.radius / sun.radius,
      ) < 1e-12,
    );
  }
  assert.ok(
    Observatory.prototype.mapRadius.call(view, sun) +
      Observatory.prototype.mapRadius.call(view, earth) <
      earthDistance / 100,
  );
  assert.ok(
    Observatory.prototype.mapRadius.call({ trueScale: false }, earth) > 0.1,
  );
});

test("streaming never exposes an incomplete hemisphere over the base surface", () => {
  const h = streamHarness();
  try {
    assert.equal(h.step(), false);
    const first = h.requests.values().next().value;
    first.ready(first.texture);
    assert.equal(h.step(), false);
    assert.equal(
      h.stream.group.visible,
      false,
      "partial roots must not intersect the fallback globe",
    );
  } finally {
    h.dispose();
  }
});

test("terrain stays at its physical depth instead of cutting through the cloud deck", () => {
  const h = streamHarness();
  try {
    h.step();
    h.flush();
    h.step();
    for (const tile of h.stream.tiles.values())
      assert.equal(tile.mesh.material.polygonOffset, false);
  } finally {
    h.dispose();
  }
});

test("the first streamed cover preserves the sharper resident base imagery", () => {
  const h = streamHarness();
  try {
    h.step();
    h.flush();
    h.step();
    for (const t of h.stream.tiles.values())
      if (t.level === 0) {
        assert.equal(
          t.mesh.material.uniforms.dayMap.value,
          h.stream.uniforms.dayMap.value,
        );
        assert.equal(t.mesh.material.uniforms.tiled.value, 0);
      }
  } finally {
    h.dispose();
  }
});

test("terrain LOD shares exactly the same surface lattice and fades in new imagery", () => {
  const h = streamHarness();
  try {
    for (let i = 0; i < 20; i++) {
      h.step();
      h.flush();
    }
    const child = [...h.stream.tiles.values()].find((t) => t.level === 1);
    assert.ok(child);
    const parent = h.stream.tiles.get(`0/${Math.floor(child.x / 2)}-0`);
    const vertexSet = new Set();
    const pos = parent.mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++)
      vertexSet.add([pos.getX(i), pos.getY(i), pos.getZ(i)].join(","));
    const cpos = child.mesh.geometry.attributes.position;
    for (let i = 0; i < cpos.count; i++)
      assert.ok(
        vertexSet.has([cpos.getX(i), cpos.getY(i), cpos.getZ(i)].join(",")),
        "LOD must not change terrain shape",
      );
    assert.ok(
      child.mesh.material.uniforms.detailBlend,
      "new imagery blends from its resident parent",
    );
  } finally {
    h.dispose();
  }
});

test("zooming and rotating preserve full terrain coverage within a bounded cache", () => {
  const h = streamHarness(40);
  try {
    for (let i = 0; i < 180; i++) {
      const angle = Math.floor(i / 30) * 1.1;
      const radius = i % 30 < 20 ? 1.08 : 5;
      const ready = h.step(
        new THREE.Vector3(
          Math.sin(angle) * radius,
          0.1,
          Math.cos(angle) * radius,
        ),
      );
      if (ready) {
        let area = 0;
        for (const t of h.stream.tiles.values())
          if (t.mesh.visible) {
            const b = tileBounds(t.level, t.x, t.y);
            area += (b.u1 - b.u0) * (b.v1 - b.v0);
          }
        assert.equal(
          area,
          1,
          "no missing or overlapping tiles during zoom and rotation",
        );
      }
      h.flush();
      assert.ok(h.stream.tiles.size <= 44);
    }
  } finally {
    h.dispose();
  }
});
