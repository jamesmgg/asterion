import * as THREE from "three";
import { tileBounds } from "./detail.ts";
import { surfaceVertex, surfaceFragment } from "./shaders.ts";
type Tile = {
  mesh: THREE.Mesh;
  ready: boolean;
  level: number;
  x: number;
  y: number;
  used: number;
  texture: THREE.Texture;
};
export interface Dataset {
  maxLevel?: number;
  sourceWidth?: number;
  width: number;
  min?: number;
  max?: number;
  url: string;
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
      return t;
    }
    if (this.pending >= 4 || this.tiles.size >= this.budget + 4) return;
    const rect = tileBounds(level, x, y),
      segments = Math.max(16, 48 - level * 4);
    const geo = new THREE.SphereGeometry(
      1,
      segments,
      segments,
      rect.u0 * 2 * Math.PI,
      (rect.u1 - rect.u0) * 2 * Math.PI,
      (1 - rect.v1) * Math.PI,
      (rect.v1 - rect.v0) * Math.PI,
    );
    // SphereGeometry stores local-patch UVs. Lighting and DEMs need globe UVs.
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(
        i,
        rect.u0 + uv.getX(i) * (rect.u1 - rect.u0),
        rect.v0 + uv.getY(i) * (rect.v1 - rect.v0),
      );
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
        this.failed = true;
      },
    );
    texture.anisotropy = 4;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    const mat = new THREE.ShaderMaterial({
      vertexShader: surfaceVertex,
      fragmentShader: surfaceFragment,
      uniforms: {
        ...this.uniforms,
        dayMap: { value: texture },
        tiled: { value: 1 },
        tileRect: {
          value: new THREE.Vector4(
            rect.u0,
            rect.v0,
            rect.u1 - rect.u0,
            rect.v1 - rect.v0,
          ),
        },
      },
      polygonOffset: true,
      polygonOffsetFactor: -(level + 1),
      polygonOffsetUnits: -(level + 1),
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    t = { mesh, texture, ready: false, level, x, y, used: this.clock };
    this.tiles.set(key, t);
    return t;
  }
  update(cameraLocal: THREE.Vector3, pixels: number, high: boolean) {
    this.clock++;
    this.active.clear();
    this.activeLevel = 0;
    for (const t of this.tiles.values()) t.mesh.visible = false;
    if (!this.enabled) {
      this.group.visible = false;
      return false;
    }
    this.group.visible = true;
    const distance = cameraLocal.length(),
      direction = cameraLocal.clone().normalize();
    let leaves = 0;
    const visit = (l: number, x: number, y: number): boolean => {
      const b = tileBounds(l, x, y),
        u = (b.u0 + b.u1) / 2,
        v = (b.v0 + b.v1) / 2;
      const center = new THREE.Vector3(
        -Math.cos(u * 2 * Math.PI) * Math.sin(v * Math.PI),
        -Math.cos(v * Math.PI),
        Math.sin(u * 2 * Math.PI) * Math.sin(v * Math.PI),
      );
      const angular = Math.PI / 2 ** l;
      if (
        l > 0 &&
        center.dot(direction) <
          1 / Math.max(distance, 1.001) -
            Math.sin(Math.min(Math.PI / 2, angular * 0.8))
      )
        return true;
      const t = this.get(l, x, y);
      if (!t?.ready) return false;
      const key = `${l}/${x}-${y}`;
      this.active.add(key);
      t.used = this.clock;
      const projected =
        (angular * pixels) / Math.max(0.015, cameraLocal.distanceTo(center));
      const split =
        l < (this.metadata.maxLevel ?? 0) &&
        projected > (high ? 520 : 820) &&
        leaves < this.budget * 0.45;
      if (split) {
        const children: Tile[] = [];
        let all = true;
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            if (!visit(l + 1, x * 2 + dx, y * 2 + dy)) all = false;
            const child = this.tiles.get(
              `${l + 1}/${x * 2 + dx}-${y * 2 + dy}`,
            );
            if (child) children.push(child);
          }
        if (all) {
          this.activeLevel = Math.max(this.activeLevel, l + 1);
          return true;
        }
        // Show a complete parent until all needed children are ready. Rendering both
        // levels at once makes displaced triangles intersect and produces seams.
        for (const child of this.tiles.values())
          if (
            child.level > l &&
            Math.floor(child.x / 2 ** (child.level - l)) === x &&
            Math.floor(child.y / 2 ** (child.level - l)) === y
          )
            child.mesh.visible = false;
      }
      t.mesh.visible = true;
      t.mesh.renderOrder = l;
      leaves++;
      this.activeLevel = Math.max(this.activeLevel, l);
      return true;
    };
    const a = visit(0, 0, 0),
      b = visit(0, 1, 0);
    const candidates = [...this.tiles.entries()]
      .filter(([key, t]) => !this.active.has(key) && !t.mesh.visible && t.ready)
      .sort((a, b) => a[1].used - b[1].used);
    while (this.tiles.size > this.budget && candidates.length) {
      const [key, t] = candidates.shift()!;
      this.disposeTile(t);
      this.tiles.delete(key);
    }
    return a && b;
  }
  private disposeTile(t: Tile) {
    t.mesh.removeFromParent();
    t.mesh.geometry.dispose();
    (t.mesh.material as THREE.Material).dispose();
    t.texture.dispose();
  }
  dispose() {
    this.generation++;
    for (const t of this.tiles.values()) this.disposeTile(t);
    this.tiles.clear();
    this.group.removeFromParent();
  }
}
