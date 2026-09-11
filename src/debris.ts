import { G } from "./physics.ts";
import type { Vec3, ImpactResult } from "./physics.ts";
import type { Planet } from "./data.ts";
export interface State {
  position: Vec3;
  velocity: Vec3;
}
export type Fate = "reimpact" | "escape" | "orbit";
type Target = Pick<Planet, "radius" | "mass" | "atmosphere">;
export interface Packet extends State {
  mass: number;
  radius: number;
  fate: Fate;
  path: Vec3[];
  landedAt: number;
}
export interface Ejecta {
  packets: Packet[];
  totalMass: number;
  kineticEnergy: number;
  escapeMass: number;
  boundMass: number;
  duration: number;
  times: number[];
}
const dot = (a: Vec3, b: Vec3) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export function orbitClass(s: State, mu: number, radius: number): Fate {
  const r = Math.hypot(...s.position),
    e = 0.5 * dot(s.velocity, s.velocity) - mu / r;
  if (e >= 0) return "escape";
  const h2 = dot(cross(s.position, s.velocity), cross(s.position, s.velocity));
  const eccentricity = Math.sqrt(Math.max(0, 1 + (2 * e * h2) / (mu * mu)));
  const periapsis = h2 / (mu * (1 + eccentricity));
  return periapsis > radius * (1 + 1e-6) ? "orbit" : "reimpact";
}
/** Fourth-order Runge-Kutta with a bounded local dynamical step. SI throughout.
 * Atmospheric packets use spherical Cd=1 drag and a fixed representative size.
 * Packet-packet collisions, ablation, target recoil and self-gravity are omitted.
 */
export function propagate(
  initial: State,
  seconds: number,
  planet: Target,
  fragmentRadius = Infinity,
): State {
  const s: State = {
    position: [...initial.position],
    velocity: [...initial.velocity],
  };
  const mu = G * planet.mass;
  const acceleration = (r: Vec3, v: Vec3): Vec3 => {
    const distance = Math.hypot(...r),
      speed = Math.hypot(...v);
    const density = planet.atmosphere
      ? planet.atmosphere.density *
        Math.exp(
          -Math.max(0, distance - planet.radius) / planet.atmosphere.height,
        )
      : 0;
    const drag = (3 * density * speed) / (8 * 3000 * fragmentRadius);
    return r.map((p, i) => (-mu * p) / distance ** 3 - drag * v[i]) as Vec3;
  };
  let remaining = seconds;
  while (remaining > 1e-9) {
    const r = Math.hypot(...s.position),
      v = Math.hypot(...s.velocity);
    const rho = planet.atmosphere
      ? planet.atmosphere.density *
        Math.exp(-Math.max(0, r - planet.radius) / planet.atmosphere.height)
      : 0;
    const dragTime =
      rho > 0
        ? (8 * 3000 * fragmentRadius) / (3 * rho * Math.max(v, 1))
        : Infinity;
    const dt = Math.min(
      remaining,
      Math.sqrt(r ** 3 / mu) * 0.008,
      (r / Math.max(v, 1)) * 0.008,
      dragTime * 0.15,
    );
    const r0 = s.position,
      v0 = s.velocity,
      a = acceleration(r0, v0);
    const rb = r0.map((x, i) => x + (v0[i] * dt) / 2) as Vec3,
      vb = v0.map((x, i) => x + (a[i] * dt) / 2) as Vec3,
      b = acceleration(rb, vb);
    const rc = r0.map((x, i) => x + (vb[i] * dt) / 2) as Vec3,
      vc = v0.map((x, i) => x + (b[i] * dt) / 2) as Vec3,
      c = acceleration(rc, vc);
    const rd = r0.map((x, i) => x + vc[i] * dt) as Vec3,
      vd = v0.map((x, i) => x + c[i] * dt) as Vec3,
      d = acceleration(rd, vd);
    s.position = r0.map(
      (x, i) => x + (dt / 6) * (v0[i] + 2 * vb[i] + 2 * vc[i] + vd[i]),
    ) as Vec3;
    s.velocity = v0.map(
      (x, i) => x + (dt / 6) * (a[i] + 2 * b[i] + 2 * c[i] + d[i]),
    ) as Vec3;
    remaining -= dt;
    if (Math.hypot(...s.position) < planet.radius) {
      const norm = Math.hypot(...s.position);
      s.position = s.position.map((x) => (x / norm) * planet.radius) as Vec3;
      s.velocity = [0, 0, 0];
      break;
    }
  }
  return s;
}
/** Reduced-order excavation distribution, not a shock or accretion hydrocode.
 * Equal log-speed bins sample M(>v) ~ v^-1.65; normalization is energy limited.
 * Speeds and launch angles are assumptions, so fate fractions are estimates.
 */
export function createEjecta(
  planet: Target,
  result: ImpactResult,
  count = 320,
): Ejecta {
  const empty: Ejecta = {
    packets: [],
    totalMass: 0,
    kineticEnergy: 0,
    escapeMass: 0,
    boundMass: 0,
    duration: 0,
    times: [],
  };
  if (result.outcome !== "crater" || result.surfaceEnergy <= 0) return empty;
  const g = (G * planet.mass) / planet.radius ** 2;
  const minSpeed = Math.max(5, 0.35 * Math.sqrt(g * result.transientDiameter));
  const maxSpeed = Math.max(minSpeed * 1.1, result.surfaceSpeed * 0.5);
  const packets: Packet[] = [];
  for (let i = 0; i < count; i++) {
    const q = (i + 0.5) / count,
      speed = minSpeed * (maxSpeed / minSpeed) ** q;
    const az = i * 2.399963229728653,
      elevation = ((35 + 25 * ((i * 0.61803398875) % 1)) * Math.PI) / 180;
    const position: Vec3 = [0, 0, planet.radius * (1 + 1e-9)];
    const velocity: Vec3 = [
      Math.cos(az) * Math.cos(elevation) * speed,
      Math.sin(az) * Math.cos(elevation) * speed,
      Math.sin(elevation) * speed,
    ];
    packets.push({
      position,
      velocity,
      mass: (speed / minSpeed) ** -1.65,
      radius: Math.max(0.5, result.transientDiameter * 0.001 * (1 - q * 0.8)),
      fate: orbitClass({ position, velocity }, G * planet.mass, planet.radius),
      path: [],
      landedAt: Infinity,
    });
  }
  const rawMass = packets.reduce((s, p) => s + p.mass, 0),
    rawEnergy = packets.reduce(
      (s, p) => s + 0.5 * p.mass * dot(p.velocity, p.velocity),
      0,
    );
  const excavated = (Math.PI / 24) * result.transientDiameter ** 3 * 2750;
  const scale = Math.min(
    excavated / rawMass,
    (result.surfaceEnergy * 0.15) / rawEnergy,
  );
  let totalMass = 0,
    kineticEnergy = 0,
    escapeMass = 0;
  for (const p of packets) {
    p.mass *= scale;
    totalMass += p.mass;
    kineticEnergy += 0.5 * p.mass * dot(p.velocity, p.velocity);
    if (p.fate === "escape") escapeMass += p.mass;
  }
  const duration = Math.max(
    60,
    Math.min(
      24000,
      4 * Math.sqrt(result.transientDiameter / g) +
        2 * Math.sqrt(planet.radius / g),
    ),
  );
  return {
    packets,
    totalMass,
    kineticEnergy,
    escapeMass,
    boundMass: totalMass - escapeMass,
    duration,
    times: [],
  };
}
export function traceEjecta(cloud: Ejecta, planet: Target, samples = 180) {
  // Quadratic sample times preserve early excavation detail and late fallback.
  cloud.times = Array.from(
    { length: samples + 1 },
    (_, i) => cloud.duration * (i / samples) ** 2,
  );
  cloud.escapeMass = 0;
  for (const packet of cloud.packets) {
    let state: State = {
      position: [...packet.position],
      velocity: [...packet.velocity],
    };
    packet.path = [[...state.position]];
    for (let i = 1; i <= samples; i++) {
      state = propagate(
        state,
        cloud.times[i] - cloud.times[i - 1],
        planet,
        packet.radius,
      );
      if (Math.hypot(...state.velocity) === 0 && packet.landedAt === Infinity) {
        packet.landedAt = cloud.times[i];
        packet.fate = "reimpact";
      }
      packet.path.push([...state.position]);
    }
    if (packet.landedAt === Infinity)
      packet.fate = orbitClass(state, G * planet.mass, planet.radius);
    if (packet.fate === "escape") cloud.escapeMass += packet.mass;
  }
  cloud.boundMass = cloud.totalMass - cloud.escapeMass;
  return cloud;
}
