import * as THREE from "three";
import { tileBounds } from "./detail.ts";
import { surfaceVertex, surfaceFragment } from "./shaders.ts";
type Tile = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  ready: boolean;
  level: number;
  x: number;
  y: number;
  used: number;
  texture: THREE.Texture;
  blend: number;
  split: boolean;
};
export interface Dataset {
  maxLevel?: number;
  sourceWidth?: number;
  width: number;
  min?: number;
  max?: number;
  url: string;
}

/** Every LOD partitions the same lattice: imagery can refine without moving the ground. */
function tileGeometry(level: number, x: number, y: number, resolution: number) {
  const segments = resolution / 2 ** level;
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (let row = 0; row <= segments; row++) {
    for (let col = 0; col <= segments; col++) {
      const u = (x * segments + col) / (resolution * 2);
      const v = 1 - (y * segments + row) / resolution;
      const phi = u * Math.PI * 2,
        theta = (1 - v) * Math.PI;
      // Canonical pole/seam coordinates also prevent cracks across longitude 0.
      const sin = v === 0 || v === 1 ? 0 : Math.sin(theta);
      positions.push(
        -Math.cos(phi) * sin,
        Math.cos(theta),
        (u === 1 ? 0 : Math.sin(phi)) * sin,
      );
      uvs.push(u, v);
      if (row < segments && col < segments) {
        const a = row * (segments + 1) + col + 1,
          b = a - 1,
          c = b + segments + 1,
          d = c + 1;
        if (v !== 1) indices.push(a, b, d);
        if (row + y * segments + 1 !== resolution) indices.push(b, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

export class TerrainStream {
  group = new THREE.Group();
  enabled = true;
  tiles = new Map<string, Tile>();
  activeLevel = 0;
  pending = 0;
  failed = false;
  private loader = new THREE.TextureLoader();
  private clock = 0;
  private generation = 0;
  private previousTime = 0;
  private active = new Set<string>();
  constructor(
    public id: string,
    public metadata: Dataset,
    public uniforms: Record<string, THREE.IUniform>,
    public budget = 64,
  ) {}
  private get(level: number, x: number, y: number): Tile | undefined {
    const key = `${level}/${x}-${y}`;
    let t = this.tiles.get(key);
    if (t) {
      t.used = this.clock;
      this.active.add(key);
      return t;
    }
    if (this.pending >= 4) return;
    if (this.tiles.size >= this.budget) {
      // Keep the current and previous frame's complete cover and its ancestors.
      const candidate = [...this.tiles.entries()]
        .filter(
          ([key, tile]) =>
            !this.active.has(key) && tile.used < this.clock - 1 && tile.ready,
        )
        .sort((a, b) => a[1].used - b[1].used)[0];
      if (!candidate) return;
      this.disposeTile(candidate[1]);
      this.tiles.delete(candidate[0]);
    }
    const rect = tileBounds(level, x, y);
    const generation = this.generation;
    this.pending++;
    const texture = this.loader.load(
      `/tiles/${this.id}/${key}.webp`,
      () => {
        this.pending--;
        if (generation === this.generation) t!.ready = true;
      },
      undefined,
      () => {
        this.pending--;
        if (generation === this.generation) this.failed = true;
      },
    );
    texture.anisotropy = 8;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    const mat = new THREE.ShaderMaterial({
      vertexShader: surfaceVertex,
      fragmentShader: surfaceFragment,
      uniforms: {
        ...this.uniforms,
        // Level zero is only 1K globally; never replace the resident 2K base with it.
        dayMap: { value: level === 0 ? this.uniforms.dayMap.value : texture },
        tiled: { value: level === 0 ? 0 : 1 },
        tileRect: {
          value: new THREE.Vector4(
            rect.u0,
            rect.v0,
            rect.u1 - rect.u0,
            rect.v1 - rect.v0,
          ),
        },
        parentMap: { value: this.uniforms.dayMap.value },
        parentRect: { value: new THREE.Vector4(0, 0, 1, 1) },
        parentTiled: { value: 0 },
        detailBlend: { value: 0 },
      },
    });
    // No depth bias: moving a surface toward the camera cuts through the cloud deck.
    const mesh = new THREE.Mesh(
      tileGeometry(level, x, y, this.budget <= 40 ? 128 : 256),
      mat,
    );
    mesh.visible = false;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    t = {
      mesh,
      texture,
      ready: false,
      level,
      x,
      y,
      used: this.clock,
      blend: level === 0 ? 1 : 0,
      split: false,
    };
    this.tiles.set(key, t);
    this.active.add(key);
    return t;
  }
  update(
    cameraLocal: THREE.Vector3,
    pixels: number,
    high: boolean,
    now = performance.now(),
  ) {
    const dt = Math.min(0.1, Math.max(0, (now - this.previousTime) / 1000));
    this.previousTime = now;
    this.clock++;
    this.active.clear();
    this.activeLevel = 0;
    for (const t of this.tiles.values()) t.mesh.visible = false;
    this.group.visible = false;
    if (!this.enabled) return false;
    const roots = [this.get(0, 0, 0), this.get(0, 1, 0)];
    // Commit the complete globe atomically. Until then the base globe owns every pixel.
    if (!roots.every((t) => t?.ready)) return false;
    const distance = cameraLocal.length(),
      direction = cameraLocal.clone().normalize();
    const visit = (t: Tile, parent?: Tile) => {
      const { level: l, x, y } = t;
      this.active.add(`${l}/${x}-${y}`);
      t.used = this.clock;
      t.blend = Math.min(1, t.blend + dt / 0.45);
      const uniforms = t.mesh.material.uniforms;
      uniforms.detailBlend.value = t.blend * t.blend * (3 - 2 * t.blend);
      uniforms.parentMap.value =
        parent?.mesh.material.uniforms.dayMap.value ??
        this.uniforms.dayMap.value;
      uniforms.parentTiled.value =
        parent?.mesh.material.uniforms.tiled.value ?? 0;
      if (parent)
        uniforms.parentRect.value.copy(
          parent.mesh.material.uniforms.tileRect.value,
        );
      const b = tileBounds(l, x, y),
        u = (b.u0 + b.u1) / 2,
        v = (b.v0 + b.v1) / 2;
      const center = new THREE.Vector3(
        -Math.cos(u * 2 * Math.PI) * Math.sin(v * Math.PI),
        -Math.cos(v * Math.PI),
        Math.sin(u * 2 * Math.PI) * Math.sin(v * Math.PI),
      );
      const angular = Math.PI / 2 ** l;
      const facing = center.dot(direction);
      const margin = Math.sin(Math.min(Math.PI / 2, angular * 0.8));
      const projected =
        (angular * pixels) / Math.max(0.015, cameraLocal.distanceTo(center));
      const canRefine = facing >= 1 / Math.max(distance, 1.001) - margin;
      // Retain loaded detail across zoom reversals. Fold branches only behind the limb.
      if (facing < -margin - 0.05) t.split = false;
      const split =
        l < (this.metadata.maxLevel ?? 0) &&
        t.blend === 1 &&
        (t.split || (canRefine && projected > (high ? 520 : 820)));
      if (split) {
        const children: (Tile | undefined)[] = [];
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++)
            children.push(this.get(l + 1, x * 2 + dx, y * 2 + dy));
        if (children.every((child) => child?.ready)) {
          t.split = true;
          for (const child of children) visit(child!, t);
          return;
        }
      }
      t.mesh.visible = true;
      this.activeLevel = Math.max(this.activeLevel, l);
    };
    // Prioritize the facing hemisphere when filling the bounded cache.
    roots.sort(
      (a, b) => ((b!.x === 0 ? 1 : -1) - (a!.x === 0 ? 1 : -1)) * direction.z,
    );
    for (const root of roots) visit(root!);
    this.group.visible = true;
    return true;
  }
  private disposeTile(t: Tile) {
    t.mesh.removeFromParent();
    t.mesh.geometry.dispose();
    t.mesh.material.dispose();
    t.texture.dispose();
  }
  dispose() {
    this.generation++;
    for (const t of this.tiles.values()) this.disposeTile(t);
    this.tiles.clear();
    this.group.removeFromParent();
  }
}
