import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import * as crater from "../src/craters.ts";

test("crater depth is measured between its intact rim and deepest floor", () => {
  assert.equal(typeof crater.craterProfile, "function");
  for (const complexity of [0, 0.5, 1]) {
    const heights = Array.from({ length: 1001 }, (_, i) =>
      crater.craterProfile(i / 1000, 0, 0.002, complexity),
    );
    const deepest = Math.min(...heights);
    const rim = crater.craterProfile(1, 0, 0.002, complexity);
    assert.ok(deepest < 0);
    assert.ok(rim > 0);
    assert.ok(Math.abs((rim - deepest) / 0.002 - 1) < 0.08);
  }
});

test("simple bowls transition into complex floors, uplift and terraced walls", () => {
  assert.equal(typeof crater.craterComplexity, "function");
  const transition = (3200 * 9.81) / 1.62;
  assert.equal(crater.craterComplexity(transition * 0.7, 1.62), 0);
  assert.equal(crater.craterComplexity(transition * 2, 1.62), 1);
  assert.ok(
    crater.craterComplexity(7000, 9.81) > crater.craterComplexity(7000, 1.62),
  );
  assert.ok(
    crater.craterProfile(0, 0, 1, 0) < crater.craterProfile(0.2, 0, 1, 0),
  );
  assert.ok(
    crater.craterProfile(0, 0, 1, 1) >
      crater.craterProfile(0.35, 0, 1, 1) + 0.2,
  );
});

test("ejecta joins the original terrain continuously without a displaced outer edge", () => {
  assert.equal(typeof crater.craterProfile, "function");
  for (const complexity of [0, 0.5, 1]) {
    for (const angle of [0, 0.7, 3.5]) {
      const radius = crater.CRATER_PATCH_RADIUS;
      assert.equal(crater.craterProfile(radius, angle, 1, complexity), 0);
      assert.equal(crater.craterProfile(radius + 0.5, angle, 1, complexity), 0);
      assert.ok(
        Math.abs(crater.craterProfile(radius - 0.0001, angle, 1, complexity)) <
          0.00001,
      );
      let previous = crater.craterProfile(0, angle, 1, complexity);
      for (let r = 0.001; r < radius; r += 0.001) {
        const height = crater.craterProfile(r, angle, 1, complexity);
        assert.ok(Number.isFinite(height));
        assert.ok(
          Math.abs(height - previous) < 0.025,
          "no steps between shape regions",
        );
        previous = height;
      }
    }
  }
});

test("crater patches are circular geodesic disks with bounded outward triangles and continuous UVs", () => {
  assert.equal(typeof crater.createCraterGeometry, "function");
  for (const center of [
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(-1, 0.001, -0.00001).normalize(),
    new THREE.Vector3(0, 1, 0),
  ]) {
    for (const radius of [0.00008, 0.03, 0.35]) {
      const geometry = crater.createCraterGeometry(center, radius, true);
      const positions = geometry.getAttribute("position");
      const uvs = geometry.getAttribute("uv");
      const points = [];
      for (let i = 0; i < positions.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(positions, i);
        points.push(point);
        assert.ok(Math.abs(point.length() - 1) < 1e-6);
        const angle = Math.atan2(
          point.clone().cross(center).length(),
          point.dot(center),
        );
        assert.ok(angle <= radius * crater.CRATER_PATCH_RADIUS + 2e-7);
        assert.ok(Number.isFinite(uvs.getX(i)) && Number.isFinite(uvs.getY(i)));
      }
      const indices = geometry.getIndex();
      assert.ok(indices.count < 100000, "mobile patch remains bounded");
      for (let i = 0; i < indices.count; i += 3) {
        const ia = indices.getX(i),
          ib = indices.getX(i + 1),
          ic = indices.getX(i + 2);
        const a = points[ia],
          b = points[ib],
          c = points[ic];
        const cross = b.clone().sub(a).cross(c.clone().sub(a));
        assert.ok(
          cross.dot(a) >= -1e-14,
          "all triangles face away from the planet",
        );
        const longitude = [uvs.getX(ia), uvs.getX(ib), uvs.getX(ic)];
        assert.ok(
          Math.max(...longitude) - Math.min(...longitude) <= 0.5 + 1e-6,
          "no triangle interpolates across the longitude seam",
        );
      }
      geometry.dispose();
    }
  }
});

test("off-pole craters split triangles at the actual north and south poles", () => {
  for (const [latitude, radius] of [
    [85, 0.1],
    [89, 0.03],
    [-85, 0.1],
    [-89, 0.03],
    [89.999997, 8e-8],
  ]) {
    for (const longitude of [0, 42, 170]) {
      const lat = (latitude * Math.PI) / 180,
        lon = (longitude * Math.PI) / 180;
      const center = new THREE.Vector3(
        Math.cos(lat) * Math.cos(lon),
        Math.sin(lat),
        Math.cos(lat) * Math.sin(lon),
      );
      const geometry = crater.createCraterGeometry(center, radius, true);
      const uv = geometry.getAttribute("uv"),
        positions = geometry.getAttribute("position"),
        indices = geometry.getIndex();
      let polarVertices = 0;
      for (let i = 0; i < positions.count; i++)
        if (
          positions.getX(i) === 0 &&
          positions.getZ(i) === 0 &&
          positions.getY(i) === Math.sign(latitude)
        )
          polarVertices++;
      for (let i = 0; i < indices.count; i += 3) {
        const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
        const values = ids.map((id) => uv.getX(id));
        assert.ok(
          Math.max(...values) - Math.min(...values) <= 0.5 + 1e-6,
          `polar triangle must not interpolate across unrelated longitudes (${latitude}, ${longitude})`,
        );
        const points = ids.map((id) =>
          new THREE.Vector3().fromBufferAttribute(positions, id),
        );
        assert.ok(
          points[1]
            .clone()
            .sub(points[0])
            .cross(points[2].clone().sub(points[0]))
            .dot(points[0]) >= -1e-14,
        );
      }
      assert.ok(
        polarVertices >= 3,
        "physical pole vertices need separate UVs for their neighboring triangles",
      );
      geometry.dispose();
    }
  }
});
