import { PLANETS } from "./data.ts";
import type { Planet } from "./data.ts";
import { solveKepler } from "./physics.ts";
import type { Vec3 } from "./physics.ts";
export interface Moon extends Planet {
  parent: string;
  orbit: {
    a: number;
    e: number;
    i: number;
    node: number;
    peri: number;
    phase: number;
  };
}
// Measured radii/masses: JPL SSD satellite physical parameters. Reference
// ellipses: JPL J2000 mean elements, with fixed planes and illustrative phases.
// These are NOT dated eclipse ephemerides: secular precession is not integrated.
const moon = (
  id: string,
  name: string,
  parent: string,
  mass: number,
  radius: number,
  period: number,
  color: string,
  description: string,
  a: number,
  e: number,
  i: number,
  node: number,
  peri: number,
  phase: number,
): Moon => ({
  id,
  name,
  parent,
  mass,
  radius,
  year: period,
  rotation: period * 24,
  tilt: 0,
  kind: "rocky",
  color,
  atmosphere: null,
  targetDensity: parent === "earth" ? 2750 : 1800,
  description,
  subtitle: "A world within a world",
  temperature: "Variable",
  orbit: { a: a * 1000, e, i, node, peri, phase },
});
export const MOONS: Moon[] = [
  moon(
    "moon",
    "Moon",
    "earth",
    7.342e22,
    1737400,
    27.322,
    "#cfccc5",
    "Explore the Moon with LRO color imagery and measured LOLA elevation. Its mountains and crater rims are real relief.",
    384400,
    0.0554,
    5.16,
    125.08,
    318.15,
    135.27,
  ),
  moon(
    "io",
    "Io",
    "jupiter",
    8.932e22,
    1821600,
    1.769138,
    "#dbbc66",
    "Sulfur plains and volcanic calderas on a world heated by tides. Surface colors come from NASA’s spacecraft map.",
    421800,
    0.004,
    0.04,
    0,
    49.1,
    330.9,
  ),
  moon(
    "europa",
    "Europa",
    "jupiter",
    4.8e22,
    1560800,
    3.551181,
    "#d7c9b6",
    "A fractured shell of water ice hides a global ocean. Dark lineaments record the stresses of a restless crust.",
    671100,
    0.009,
    0.5,
    184,
    45,
    345.4,
  ),
  moon(
    "ganymede",
    "Ganymede",
    "jupiter",
    1.4819e23,
    2634100,
    7.154553,
    "#a8a396",
    "The largest moon in the Solar System, with ancient dark terrain and brighter grooved regions.",
    1070400,
    0.001,
    0.2,
    58.5,
    198.3,
    324.8,
  ),
  moon(
    "callisto",
    "Callisto",
    "jupiter",
    1.0759e23,
    2410300,
    16.689018,
    "#8d8579",
    "A deeply cratered ice-and-rock world. Countless bright scars preserve a long history of impacts.",
    1882700,
    0.007,
    0.3,
    309.1,
    43.8,
    87.4,
  ),
  moon(
    "titan",
    "Titan",
    "saturn",
    1.3452e23,
    2574730,
    15.945421,
    "#d3a664",
    "A thick nitrogen atmosphere cloaks a frozen landscape. This infrared surface map reveals features beneath the haze.",
    1221870,
    0.0288,
    0.3,
    28,
    186,
    163,
  ),
  moon(
    "enceladus",
    "Enceladus",
    "saturn",
    1.0802e20,
    252100,
    1.370218,
    "#e6eced",
    "Bright ice, young fractures, and a subsurface ocean. Cassini mapped this small, active world.",
    238400,
    0.0047,
    0.02,
    0,
    0,
    200,
  ),
  moon(
    "triton",
    "Triton",
    "neptune",
    2.139e22,
    1353400,
    5.876854,
    "#c9bbb3",
    "A captured world on a retrograde orbit. Voyager mapped part of its nitrogen-frosted landscape; coverage remains incomplete.",
    354800,
    0.00002,
    156.865,
    177,
    0,
    115,
  ),
];
MOONS.find((m) => m.id === "titan")!.atmosphere = {
  density: 5.3,
  height: 21000,
};
export const BODIES: Planet[] = [...PLANETS, ...MOONS];
export const parentOf = (id: string) =>
  MOONS.find((m) => m.id === id)?.parent ?? id;
export interface VectorTable {
  start: number;
  step: number;
  states: number[][];
}
export const ephemerides = new Map<string, VectorTable>();
export function interpolateVectors(
  table: VectorTable,
  jd: number,
): Vec3 | null {
  const index = (jd - table.start) / table.step;
  if (index < 0 || index > table.states.length - 1) return null;
  const i = Math.min(Math.floor(index), table.states.length - 2),
    t = index - i,
    t2 = t * t,
    t3 = t2 * t;
  const a = table.states[i],
    b = table.states[i + 1],
    seconds = table.step * 86400;
  return [0, 1, 2].map(
    (k) =>
      (2 * t3 - 3 * t2 + 1) * a[k] +
      (t3 - 2 * t2 + t) * seconds * a[k + 3] +
      (-2 * t3 + 3 * t2) * b[k] +
      (t3 - t2) * seconds * b[k + 3],
  ) as Vec3;
}
export function hasEphemeris(id: string, jd: number) {
  const t = ephemerides.get(id),
    tdb = jd + 69.184 / 86400;
  return Boolean(
    t && tdb >= t.start && tdb <= t.start + t.step * (t.states.length - 1),
  );
}
export function satellitePosition(moon: Moon, jd: number): Vec3 {
  const table = ephemerides.get(moon.id);
  // UTC -> approximate TT/TDB for the bundled 2026–2027 interval (TAI-UTC=37 s).
  const vector = table ? interpolateVectors(table, jd + 69.184 / 86400) : null;
  if (vector) return [vector[0], vector[2], -vector[1]];
  const o = moon.orbit,
    rad = Math.PI / 180,
    E = solveKepler((o.phase + (360 * (jd - 2451545)) / moon.year) * rad, o.e);
  const x = o.a * (Math.cos(E) - o.e),
    y = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E);
  const w = o.peri * rad,
    n = o.node * rad,
    I = o.i * rad;
  const a =
    (Math.cos(w) * Math.cos(n) - Math.sin(w) * Math.sin(n) * Math.cos(I)) * x +
    (-Math.sin(w) * Math.cos(n) - Math.cos(w) * Math.sin(n) * Math.cos(I)) * y;
  const b =
    (Math.cos(w) * Math.sin(n) + Math.sin(w) * Math.cos(n) * Math.cos(I)) * x +
    (-Math.sin(w) * Math.sin(n) + Math.cos(w) * Math.cos(n) * Math.cos(I)) * y;
  const c = Math.sin(w) * Math.sin(I) * x + Math.cos(w) * Math.sin(I) * y;
  // Render frame: +Y north, ecliptic +Y maps to -Z.
  const tilt =
    moon.parent === "earth"
      ? 0
      : (PLANETS.find((p) => p.id === moon.parent)!.tilt * Math.PI) / 180;
  return [
    a * Math.cos(tilt) - c * Math.sin(tilt),
    a * Math.sin(tilt) + c * Math.cos(tilt),
    -b,
  ];
}
/** Visible fraction of a uniform solar disk, using circle-overlap geometry. */
export function discVisibility(
  sun: number,
  occluder: number,
  separation: number,
) {
  const d = Math.max(0, separation),
    r = sun,
    R = occluder;
  if (d >= r + R) return 1;
  if (d <= Math.abs(R - r)) return R >= r ? 0 : 1 - (R * R) / (r * r);
  const clamp = (x: number) => Math.max(-1, Math.min(1, x));
  const area =
    r * r * Math.acos(clamp((d * d + r * r - R * R) / (2 * d * r))) +
    R * R * Math.acos(clamp((d * d + R * R - r * r) / (2 * d * R))) -
    0.5 *
      Math.sqrt(
        Math.max(0, (-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R)),
      );
  return Math.max(0, Math.min(1, 1 - area / (Math.PI * r * r)));
}
