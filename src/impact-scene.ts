import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { Planet } from "./data.ts";
import type { ImpactInput, ImpactResult } from "./physics.ts";
import { createEjecta, traceEjecta } from "./debris.ts";
import type { Ejecta } from "./debris.ts";
export interface Playback {
  fraction: number;
  phase: string;
  seconds: number;
  landed: number;
  airborne: number;
  escape: number;
  mass: number;
}
function rockNoise(x: number, y: number, z: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  const smooth = (v: number) => v * v * (3 - 2 * v);
  const fx = smooth(x - ix),
    fy = smooth(y - iy),
    fz = smooth(z - iz);
  let value = 0;
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++)
      for (let c = 0; c < 2; c++) {
        const hash =
          Math.sin((ix + a) * 127.1 + (iy + b) * 311.7 + (iz + c) * 74.7) *
          43758.5453;
        value +=
          (hash - Math.floor(hash)) *
          (a ? fx : 1 - fx) *
          (b ? fy : 1 - fy) *
          (c ? fz : 1 - fz);
      }
  return value * 2 - 1;
}
const rockVertex = `varying vec3 p;varying vec3 n;void main(){p=position;n=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const rockFragment = `uniform float heat;varying vec3 p;varying vec3 n;
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
void main(){float a=noise(p*12.)*.5+noise(p*45.)*.3+noise(p*120.)*.2;
vec3 base=normalize(n),dx=dFdx(p),dy=dFdy(p),r1=cross(dy,base),r2=cross(base,dx);float det=dot(dx,r1);
vec3 grain=normalize(max(abs(det),1e-12)*base-sign(det)*.003*(dFdx(a)*r1+dFdy(a)*r2));
float d=max(.1,dot(grain,normalize(vec3(-1,2,3))));
vec3 c=mix(vec3(.025,.023,.02),vec3(.16,.14,.12),a)*d*1.5;float crack=pow(1.-abs(noise(p*8.)*2.-1.),18.);
c+=vec3(2.5,.32,.015)*heat*(.25+crack);gl_FragColor=vec4(c,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
export class ImpactSequence {
  group = new THREE.Group();
  cloud: Ejecta;
  time = 0;
  duration = 18;
  paused = false;
  rate = 1;
  done = false;
  hit = false;
  private rock: THREE.Mesh;
  private fragments: THREE.InstancedMesh;
  private particles: THREE.Points;
  private paths: THREE.LineSegments;
  private flash: THREE.Sprite;
  private plume: THREE.Points;
  private shock: THREE.Mesh;
  private trail: THREE.Line;
  private fragmentMatrix = new THREE.Object3D();
  private n: number;
  private plumeVel: Float32Array;
  private onContact: () => void;
  private onFinish: () => void;
  onProgress: (p: Playback) => void = () => {};
  constructor(
    public planet: Planet,
    public input: ImpactInput,
    public result: ImpactResult,
    normal: THREE.Vector3,
    glow: THREE.Texture,
    mobile: boolean,
    onHit: () => void,
    onFinish: () => void,
  ) {
    this.onContact = onHit;
    this.onFinish = onFinish;
    this.group.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      normal,
    );
    this.cloud = traceEjecta(
      createEjecta(planet, result, mobile ? 128 : 320),
      planet,
      mobile ? 120 : 180,
    );
    const rockGeo = new THREE.IcosahedronGeometry(1, mobile ? 16 : 24),
      pos = rockGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i),
        r =
          1 +
          0.22 * rockNoise(x * 2, y * 2, z * 2) +
          0.075 * rockNoise(x * 6, y * 6, z * 6) +
          0.025 * rockNoise(x * 18, y * 18, z * 18);
      pos.setXYZ(i, x * r * 1.2, y * r * 0.87, z * r);
    }
    // Weld shared vertices before recomputing normals: the default unindexed
    // polyhedron would otherwise shade each triangle as a conspicuous flat face.
    rockGeo.deleteAttribute("normal");
    rockGeo.deleteAttribute("uv");
    const smoothRock = mergeVertices(rockGeo);
    smoothRock.computeVertexNormals();
    rockGeo.dispose();
    this.rock = new THREE.Mesh(
      smoothRock,
      new THREE.ShaderMaterial({
        vertexShader: rockVertex,
        fragmentShader: rockFragment,
        uniforms: { heat: { value: 0 } },
      }),
    );
    this.rock.scale.setScalar(
      Math.max(input.diameter / (planet.radius * 2), 0.000015),
    );
    this.group.add(this.rock);
    this.fragments = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({
        color: "#9e8872",
        roughness: 1,
        emissive: "#f76216",
        emissiveIntensity: 0.6,
      }),
      24,
    );
    this.fragments.frustumCulled = false;
    this.group.add(this.fragments);
    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glow,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0,
      }),
    );
    this.group.add(this.flash);
    this.shock = new THREE.Mesh(
      new THREE.RingGeometry(0.975, 1, 192),
      new THREE.MeshBasicMaterial({
        color: "#ffcc94",
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.group.add(this.shock);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 90 }, () => new THREE.Vector3()),
    );
    this.trail = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({
        color: "#ffe7b4",
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.group.add(this.trail);
    const coords = new Float32Array(this.cloud.packets.length * 3),
      colors = new Float32Array(coords.length);
    this.cloud.packets.forEach((p, i) => {
      new THREE.Color(p.fate === "escape" ? "#8bddff" : "#ffc98a").toArray(
        colors,
        i * 3,
      );
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(coords, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.particles = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        vertexColors: true,
        map: glow,
        size: mobile ? 3.5 : 3,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    this.particles.frustumCulled = false;
    this.group.add(this.particles);
    const pathVertices: number[] = [],
      pathColors: number[] = [];
    this.cloud.packets.forEach((p, i) => {
      if (i % Math.max(1, Math.floor(this.cloud.packets.length / 36)) !== 0)
        return;
      const color = new THREE.Color(
        p.fate === "escape" ? "#77c9f4" : "#d6a771",
      );
      for (let j = 1; j < p.path.length; j++) {
        if (this.cloud.times[j] > p.landedAt) break;
        pathVertices.push(
          ...p.path[j - 1].map((x) => x / planet.radius),
          ...p.path[j].map((x) => x / planet.radius),
        );
        pathColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(pathVertices, 3),
    );
    pg.setAttribute("color", new THREE.Float32BufferAttribute(pathColors, 3));
    this.paths = new THREE.LineSegments(
      pg,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      }),
    );
    this.paths.visible = false;
    this.group.add(this.paths);
    this.n = mobile ? 320 : 900;
    const plumeCoords = new Float32Array(this.n * 3);
    this.plumeVel = new Float32Array(this.n * 3);
    for (let i = 0; i < this.n; i++) {
      const a = i * 2.399963,
        rad = Math.sqrt((i + 0.5) / this.n);
      this.plumeVel.set(
        [Math.cos(a) * rad, Math.sin(a) * rad, 0.25 + ((i * 0.754877666) % 1)],
        i * 3,
      );
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(plumeCoords, 3));
    this.plume = new THREE.Points(
      dg,
      new THREE.PointsMaterial({
        map: glow,
        color: "#fdb477",
        size: 0.001,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.plume.frustumCulled = false;
    this.group.add(this.plume);
    this.render();
  }
  showPaths(show: boolean) {
    this.paths.visible = show;
  }
  incomingPosition() {
    return this.rock.getWorldPosition(new THREE.Vector3());
  }
  get incomingRadius() {
    return this.rock.scale.x;
  }
  private finish() {
    if (this.time >= this.duration && !this.done) {
      this.done = true;
      this.onFinish();
    }
  }
  seek(fraction: number) {
    this.time = Math.max(0, Math.min(1, fraction)) * this.duration;
    this.render();
    this.finish();
  }
  update(dt: number) {
    if (!this.paused && this.time < this.duration) {
      this.time = Math.min(this.duration, this.time + dt * this.rate);
      this.render();
      this.finish();
    }
  }
  render() {
    const contact = 3.5,
      after = Math.max(0, this.time - contact),
      f = Math.max(0, 1 - this.time / contact),
      angle = (this.input.angle * Math.PI) / 180;
    const crater = this.result.craterDiameter / (2 * this.planet.radius),
      physicalSize = this.input.diameter / this.planet.radius;
    const scale = Math.max(0.00008, crater, physicalSize * 3),
      burst =
        this.result.outcome === "airburst"
          ? Math.max(0, this.result.burstAltitude) / this.planet.radius
          : 0;
    const z = 1 + burst;
    const flight = Math.max(scale * 12, 0.01) * f;
    this.rock.position.set(
      -flight * Math.cos(angle),
      0,
      z + flight * Math.sin(angle),
    );
    this.rock.rotation.set(
      this.time * 0.65,
      this.time * 0.31,
      this.time * 0.13,
    );
    const atmosphere = Boolean(this.planet.atmosphere);
    const heat = atmosphere ? Math.pow(1 - f, 3) : 0;
    (this.rock.material as THREE.ShaderMaterial).uniforms.heat.value = heat;
    this.rock.visible = this.time < contact;
    this.trail.visible = this.time < contact && atmosphere;
    const tr = this.trail.geometry.attributes.position;
    for (let i = 0; i < tr.count; i++) {
      const t = i / (tr.count - 1),
        d = flight + t * Math.max(scale * 5, 0.004);
      tr.setXYZ(i, -d * Math.cos(angle), 0, z + d * Math.sin(angle));
    }
    tr.needsUpdate = true;
    this.fragments.visible =
      this.time < contact && this.time > 2.2 && this.result.fragmented;
    for (let i = 0; i < 24; i++) {
      const a = i * 2.399963,
        spread = Math.max(0, this.time - 2.2) * physicalSize * (1 + (i % 4));
      this.fragmentMatrix.position
        .copy(this.rock.position)
        .add(
          new THREE.Vector3(
            Math.cos(a) * spread,
            Math.sin(a) * spread,
            (i % 3) * spread * 0.3,
          ),
        );
      this.fragmentMatrix.scale.setScalar(
        Math.max(physicalSize * 0.15, 0.000006),
      );
      this.fragmentMatrix.rotation.set(i + this.time, i * 0.6, this.time * 0.8);
      this.fragmentMatrix.updateMatrix();
      this.fragments.setMatrixAt(i, this.fragmentMatrix.matrix);
    }
    this.fragments.instanceMatrix.needsUpdate = true;
    if (this.time >= contact && !this.hit) {
      this.hit = true;
      this.onContact();
    }
    const normalized = after / (this.duration - contact),
      physical = this.cloud.duration * normalized * normalized;
    this.flash.position.set(0, 0, z + scale * 0.04);
    this.flash.scale.setScalar(scale * (2 + Math.sqrt(after) * 3));
    this.flash.material.opacity =
      this.time >= contact ? Math.exp(-after * 1.6) * 0.95 : heat * 0.25;
    this.shock.visible = this.time >= contact;
    const shockRadius = Math.min(0.98, scale * (1 + after * 2));
    this.shock.scale.setScalar(shockRadius);
    this.shock.position.z = Math.sqrt(1 - shockRadius ** 2) + 0.00001 + burst;
    (this.shock.material as THREE.MeshBasicMaterial).opacity =
      0.45 * Math.exp(-after * 0.6);
    const pa = this.plume.geometry.attributes.position;
    for (let i = 0; i < this.n; i++) {
      const vx = this.plumeVel[i * 3],
        vy = this.plumeVel[i * 3 + 1],
        vz = this.plumeVel[i * 3 + 2];
      const spread = scale * Math.sqrt(after) * 2;
      pa.setXYZ(
        i,
        vx * spread,
        vy * spread,
        z + scale * (vz * Math.sqrt(after) * 2.5 + after * 0.15),
      );
    }
    pa.needsUpdate = true;
    const pm = this.plume.material as THREE.PointsMaterial;
    pm.size = scale * (0.22 + after * 0.08);
    // Hundreds of large translucent sprites accumulate into an opaque veil,
    // even when each has only 2% opacity. Dissipate the cinematic plume fully
    // before final inspection; numerical debris continues on its own timeline.
    pm.opacity =
      this.time >= contact
        ? 0.55 *
          Math.exp(-after * 0.23) *
          (1 - THREE.MathUtils.smoothstep(after, 6, 12))
        : 0;
    this.plume.visible = pm.opacity > 0;
    pm.color.set(after < 1 ? "#ffc983" : after < 4 ? "#bca18a" : "#8c7c72");
    pm.blending = after < 1 ? THREE.AdditiveBlending : THREE.NormalBlending;
    let index = 0;
    while (
      index < this.cloud.times.length - 2 &&
      this.cloud.times[index + 1] < physical
    )
      index++;
    const frac = this.cloud.times.length
      ? (physical - this.cloud.times[index]) /
        Math.max(0.001, this.cloud.times[index + 1] - this.cloud.times[index])
      : 0;
    const attr = this.particles.geometry.attributes.position;
    let landed = 0,
      airborne = 0;
    this.cloud.packets.forEach((p, i) => {
      const a = p.path[index],
        b = p.path[Math.min(index + 1, p.path.length - 1)];
      for (let k = 0; k < 3; k++)
        attr.array[i * 3 + k] =
          (a[k] + (b[k] - a[k]) * frac) / this.planet.radius;
      if (physical >= p.landedAt) landed += p.mass;
      else airborne += p.mass;
    });
    attr.needsUpdate = true;
    this.particles.visible = this.time >= contact;
    this.onProgress({
      fraction: this.time / this.duration,
      phase:
        this.time < 2.2
          ? "Approach"
          : this.time < contact
            ? this.result.fragmented
              ? "Fragmentation"
              : "Final approach"
            : after < 1
              ? "Energy release"
              : after < 4
                ? "Excavation & plume"
                : "Ballistic aftermath",
      seconds: physical,
      landed,
      airborne,
      escape: this.cloud.escapeMass,
      mass: this.cloud.totalMass,
    });
  }
  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) mat.dispose();
      }
    });
  }
}
