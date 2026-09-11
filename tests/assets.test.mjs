import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MOONS } from "../src/satellites.ts";
test("Every bundled planetary map is an actual image, not a failed download or Git LFS pointer", () => {
  for (const file of fs.readdirSync("public/textures")) {
    const bytes = fs.readFileSync("public/textures/" + file);
    assert.ok(bytes.length > 10000, `${file} contains image data`);
    assert.equal(
      bytes.subarray(0, 2).toString("hex"),
      file.endsWith(".png") ? "8950" : "ffd8",
      `${file} has valid image magic`,
    );
  }
});

test("Every declared detail tile is bundled with a valid WebP header", () => {
  const manifest = JSON.parse(
    fs.readFileSync("public/tiles/manifest.json", "utf8"),
  );
  for (const [id, data] of Object.entries(manifest)) {
    if (data.maxLevel === undefined) continue;
    assert.ok(data.sourceWidth > 0 && data.url.startsWith("https://"));
    for (let level = 0; level <= data.maxLevel; level++) {
      for (let y = 0; y < 2 ** level; y++) {
        for (let x = 0; x < 2 ** (level + 1); x++) {
          const bytes = fs.readFileSync(
            `public/tiles/${id}/${level}/${x}-${y}.webp`,
          );
          assert.equal(bytes.subarray(0, 4).toString(), "RIFF");
          assert.equal(bytes.subarray(8, 12).toString(), "WEBP");
        }
      }
    }
  }
});

test("All eight moon ephemerides cover the stated dates with finite SI states", () => {
  for (const moon of MOONS) {
    const table = JSON.parse(
      fs.readFileSync(`public/ephemerides/${moon.id}.json`, "utf8"),
    );
    assert.equal(table.start, 2461041.5);
    assert.equal(
      table.start + table.step * (table.states.length - 1),
      2461771.5,
    );
    assert.equal(table.states.length, 17521);
    for (const state of table.states) {
      assert.equal(state.length, 6);
      assert.ok(state.every(Number.isFinite));
      const r = Math.hypot(...state.slice(0, 3));
      assert.ok(r > moon.orbit.a * 0.85 && r < moon.orbit.a * 1.15);
    }
  }
});
