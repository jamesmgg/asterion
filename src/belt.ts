import * as THREE from "three";
import { SUN_MASS } from "./data.ts";
import { AU, DAY, G, solveKepler } from "./physics.ts";
import type { Vec3 } from "./physics.ts";

const TAU = 2 * Math.PI;
const YEAR = (TAU * Math.sqrt(AU ** 3 / (G * SUN_MASS))) / DAY;
export interface BeltOrbit {
  a: number;
  e: number;
  phase: number;
  period: number;
  basisX: Vec3;
  basisY: Vec3;
}

/** A repeatable population illustration, not a catalogue of observed asteroids.
 * Main-belt semimajor axes sample 2.2–3.2 AU (NASA Dawn FAQ), with modest
 * eccentricities and inclinations. Particles do not perturb the nine-body model.
 */
export function makeBeltPopulation(count: number): BeltOrbit[] {
  let seed = 21;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, () => {
    const a = 2.2 + random(),
      e = 0.015 + random() * 0.09;
    const inclination = (random() ** 2 * 14 * Math.PI) / 180,
      node = random() * TAU,
      peri = random() * TAU;
    const c = Math.cos(node),
      s = Math.sin(node),
      cw = Math.cos(peri),
      sw = Math.sin(peri),
      ci = Math.cos(inclination),
      si = Math.sin(inclination);
    return {
      a,
      e,
      phase: random() * TAU,
      period: YEAR * a ** 1.5,
      basisX: [c * cw - s * sw * ci, sw * si, -(s * cw + c * sw * ci)],
      basisY: [-c * sw - s * cw * ci, cw * si, s * sw - c * cw * ci],
    };
  });
}

/** Heliocentric position in AU, in the renderer's +Y-north frame. */
export function beltPosition(orbit: BeltOrbit, jd: number): Vec3 {
  const mean =
    (orbit.phase + (TAU * ((jd - 2451545) % orbit.period)) / orbit.period) %
    TAU;
  const eccentric = solveKepler(mean, orbit.e);
  const x = orbit.a * (Math.cos(eccentric) - orbit.e),
    y = orbit.a * Math.sqrt(1 - orbit.e ** 2) * Math.sin(eccentric);
  return orbit.basisX.map(
    (value, i) => value * x + orbit.basisY[i] * y,
  ) as Vec3;
}

export class AsteroidBelt extends THREE.Group {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly orbits: BeltOrbit[];
  private lastJD = NaN;
  private lastScale = false;
  constructor(count: number) {
    super();
    this.orbits = makeBeltPopulation(count);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    const colors = new Float32Array(count * 3),
      sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const brightness = 0.45 + 0.5 * ((i * 0.61803398875) % 1);
      colors.set([brightness, brightness * 0.81, brightness * 0.58], i * 3);
      sizes[i] = 1.5 + ((i * 0.754877666) % 1) * 1.3;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    const material = new THREE.ShaderMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      uniforms: { pixelRatio: { value: 1 } },
      vertexShader: `attribute float size;uniform float pixelRatio;varying vec3 tint;
        void main(){tint=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size*pixelRatio;}`,
      fragmentShader: `varying vec3 tint;void main(){
        float d=length((gl_PointCoord-.5)*vec2(1.,1.15));if(d>.5)discard;
        gl_FragColor=vec4(tint*(.65+.35*(1.-gl_PointCoord.y)),(1.-smoothstep(.25,.5,d))*.9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.add(this.points);
    this.update(2451545, false);
  }
  update(jd: number, trueScale: boolean) {
    if (jd === this.lastJD && trueScale === this.lastScale) return;
    this.lastJD = jd;
    this.lastScale = trueScale;
    const positions = this.points.geometry.getAttribute("position");
    this.orbits.forEach((orbit, i) => {
      const p = beltPosition(orbit, jd),
        r = Math.hypot(...p);
      // The readable diagram fits the same population between the mean Mars
      // and Jupiter orbit guides. True-distance mode preserves physical AU.
      const scale = trueScale ? 1.15 : (15.7 + (r - 2) * 0.85) / r;
      positions.setXYZ(i, p[0] * scale, p[1] * scale, p[2] * scale);
    });
    positions.needsUpdate = true;
  }
  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.removeFromParent();
  }
}
