import * as THREE from "three";

/** The outer ejecta tapers to unchanged terrain at this many crater radii. */
export const CRATER_PATCH_RADIUS = 2.1;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Same gravity-dependent transition as the impact model, softened for rendering. */
export function craterComplexity(diameterM: number, gravity: number): number {
  const transition = (3200 * 9.81) / Math.max(0.01, gravity);
  return smooth(0.85, 1.8, diameterM / transition);
}

/**
 * Qualitative final morphology: simple bowl or collapsed complex crater.
 * Depth is the model's rim-to-floor depth in planet radii, not an extra scale.
 * Terraces, uplift and ejecta are illustrative, not a hydrocode solution.
 * https://www.lpi.usra.edu/lunar/missions/orbiter/lunar_orbiter/impact_crater/
 */
export function craterProfile(
  r: number,
  azimuth: number,
  depth: number,
  complexity: number,
): number {
  if (r >= CRATER_PATCH_RADIUS || depth <= 0) return 0;
  const a = azimuth;
  const irregularity =
    1 +
    0.018 * Math.sin(3 * a) +
    0.013 * Math.sin(7 * a) +
    0.007 * Math.sin(13 * a);
  const q = Math.max(0, r) / irregularity;
  const bowl = -0.83 * Math.pow(Math.max(0, 1 - q * q), 1.25);
  const wall = smooth(0.42, 1, q);
  const terraces =
    0.035 * Math.sin(wall * Math.PI * 6) * Math.sin(wall * Math.PI);
  const uplift =
    0.43 *
    (1 - smooth(0, 0.28, q)) *
    (1 + 0.08 * Math.sin(3 * a) * smooth(0, 0.12, q));
  const complex = -0.83 * (1 - wall) + terraces + uplift;
  const rim = 0.17 * Math.exp(-Math.pow((q - 1) / 0.105, 2));
  const blocks =
    0.014 *
    Math.sin(13 * a + q * 8) *
    Math.sin(29 * a - q * 6) *
    Math.exp(-Math.pow((q - 0.9) / 0.2, 2)) *
    smooth(0.3, 0.6, q);
  const rays =
    0.75 + 0.25 * Math.pow(0.5 + 0.5 * Math.sin(19 * a + Math.sin(7 * a)), 4);
  const ejecta =
    0.09 * smooth(0.99, 1.12, q) * Math.pow(Math.max(1, q), -3) * rays;
  const taper = 1 - smooth(1.3, CRATER_PATCH_RADIUS, r);
  return (
    depth *
    (bowl * (1 - complexity) + complex * complexity + rim + blocks + ejecta) *
    taper
  );
}

/** GLSL counterpart of craterProfile; keep the numerical coefficients identical. */
export const craterProfileGLSL = `
float craterProfile(float r,float a,float depth,float complexity){
 if(r>=2.1||depth<=0.)return 0.;
 float irregularity=1.+.018*sin(3.*a)+.013*sin(7.*a)+.007*sin(13.*a);
 float q=max(0.,r)/irregularity;
 float bowl=-.83*pow(max(0.,1.-q*q),1.25);
 float wall=smoothstep(.42,1.,q);
 float terraces=.035*sin(wall*18.849555922)*sin(wall*3.141592654);
 float uplift=.43*(1.-smoothstep(0.,.28,q))*(1.+.08*sin(3.*a)*smoothstep(0.,.12,q));
 float complexFloor=-.83*(1.-wall)+terraces+uplift;
 float rimDistance=(q-1.)/.105,blockDistance=(q-.9)/.2;
 float rim=.17*exp(-rimDistance*rimDistance);
 float blocks=.014*sin(13.*a+q*8.)*sin(29.*a-q*6.)*exp(-blockDistance*blockDistance)*smoothstep(.3,.6,q);
 float rays=.75+.25*pow(.5+.5*sin(19.*a+sin(7.*a)),4.);
 float ejecta=.09*smoothstep(.99,1.12,q)*pow(max(1.,q),-3.)*rays;
 return depth*(mix(bowl,complexFloor,complexity)+rim+blocks+ejecta)*(1.-smoothstep(1.3,2.1,r));
}
`;

/**
 * Linear-light fresh rock, darker impact melt and a thinning radial ejecta blanket.
 * No persistent emissive lava: the final crater stays lit by the actual Sun.
 * craterAlbedo returns the complete blended material, including unchanged surroundings.
 * craterDisturbance can also extinguish pre-impact city lights and ocean highlights.
 */
export const craterMaterialGLSL = `
float craterHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float craterNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(craterHash(i),craterHash(i+vec2(1.,0.)),f.x),mix(craterHash(i+vec2(0.,1.)),craterHash(i+vec2(1.,1.)),f.x),f.y);}
float craterDisturbance(float r,float a){
 float rays=pow(.5+.5*sin(23.*a+1.4*sin(7.*a)+.8*sin(13.*a)),10.);
 float blanket=1.-smoothstep(1.02,1.4,r);
 float dust=.22*rays*(1.-smoothstep(1.25,2.07,r));
 return max(blanket,dust);
}
vec3 craterAlbedo(float r,float a,float complexity,vec3 original){
 vec2 p=vec2(cos(a),sin(a))*r;
 float grain=.35*craterNoise(p*18.)+.25*craterNoise(p*61.)+.4*craterNoise(p*160.);
 float strata=sin((r+craterNoise(p*23.)*.009)*35.);
 vec3 rock=mix(vec3(.080,.065,.050),vec3(.110,.090,.067),grain);
 rock=mix(rock,original,.12);
 rock*=1.+.085*strata*smoothstep(.43,.7,r)*(1.-smoothstep(.95,1.06,r));
 float fractures=pow(.5+.5*sin(31.*a+3.*craterNoise(p*6.)),24.);
 rock*=1.-.15*fractures*smoothstep(.45,.5,r)*(1.-smoothstep(.9,.95,r));
 float floorMask=(1.-smoothstep(.35,.48,r))*complexity;
 float centralPeak=(1.-smoothstep(.08,.28,r))*complexity;
 vec3 melt=vec3(.019,.017,.015)+vec3(.025,.022,.018)*grain;
 rock=mix(rock,melt,floorMask*(1.-centralPeak)*.85);
 float rimDistance=(r-1.)/.09;
 float rim=exp(-rimDistance*rimDistance);
 rock*=1.+.22*rim;
 return mix(original,rock,craterDisturbance(r,a));
}
`;

/** A geodesic disk, with extra rings across the rim and collapsed crater walls. */
export function createCraterGeometry(
  center: THREE.Vector3,
  angularRadius: number,
  mobile: boolean,
): THREE.BufferGeometry {
  const direction = center.clone().normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    direction,
  );
  const sectors = mobile ? 96 : 160;
  const rings: number[] = [];
  for (const [begin, end, count] of [
    [0, 0.7, mobile ? 16 : 24],
    [0.7, 1.15, mobile ? 24 : 40],
    [1.15, CRATER_PATCH_RADIUS, mobile ? 16 : 24],
  ]) {
    for (let i = 1; i <= count; i++)
      rings.push(begin + ((end - begin) * i) / count);
  }
  const positions = [direction.x, direction.y, direction.z];
  const uvs = [0, 0];
  let indices: number[] = [];
  const n = new THREE.Vector3();
  for (const ring of rings) {
    const angle = ring * angularRadius;
    for (let sector = 0; sector <= sectors; sector++) {
      const a = ((sector === sectors ? 0 : sector) * Math.PI * 2) / sectors;
      n.set(
        Math.cos(a) * Math.sin(angle),
        Math.sin(a) * Math.sin(angle),
        Math.cos(angle),
      ).applyQuaternion(rotation);
      positions.push(n.x, n.y, n.z);
      uvs.push(0, 0);
    }
  }
  for (let i = 0; i < positions.length / 3; i++) {
    const x = positions[i * 3],
      y = positions[i * 3 + 1],
      z = positions[i * 3 + 2];
    uvs[i * 2] = (Math.atan2(z, -x) / (2 * Math.PI) + 1) % 1;
    uvs[i * 2 + 1] = Math.acos(Math.max(-1, Math.min(1, -y))) / Math.PI;
  }
  for (let sector = 0; sector < sectors; sector++)
    indices.push(0, 1 + sector, 2 + sector);
  for (let ring = 1; ring < rings.length; ring++) {
    const inner = 1 + (ring - 1) * (sectors + 1),
      outer = inner + sectors + 1;
    for (let sector = 0; sector < sectors; sector++) {
      const a = inner + sector,
        b = a + 1,
        c = outer + sector,
        d = c + 1;
      indices.push(a, c, d, a, d, b);
    }
  }
  // An off-pole disk can enclose a pole inside one of its triangles. No choice
  // of three equirectangular UVs can cover that singularity continuously. Split
  // those triangles at the physical pole first, then give each fan its own UV.
  if (Math.acos(Math.abs(direction.y)) < angularRadius * CRATER_PATCH_RADIUS) {
    const sign = Math.sign(direction.y);
    let poleIndex: number | undefined;
    const split: number[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      const triangle = indices.slice(i, i + 3);
      if (
        triangle.some(
          (id) => positions[id * 3] ** 2 + positions[id * 3 + 2] ** 2 < 1e-28,
        )
      ) {
        split.push(...triangle);
        continue;
      }
      const edges = triangle.map((id, corner) => {
        const next = triangle[(corner + 1) % 3];
        return (
          sign *
          (positions[id * 3 + 2] * positions[next * 3] -
            positions[id * 3] * positions[next * 3 + 2])
        );
      });
      if (edges.every((side) => side >= 0)) {
        if (poleIndex === undefined) {
          poleIndex = positions.length / 3;
          positions.push(0, sign, 0);
          uvs.push(0, (sign + 1) / 2);
        }
        for (let corner = 0; corner < 3; corner++) {
          // A pole exactly on an edge creates a degenerate fan triangle.
          if (edges[corner] > 0)
            split.push(triangle[corner], triangle[(corner + 1) % 3], poleIndex);
        }
      } else {
        split.push(...triangle);
      }
    }
    indices = split;
  }
  // Split only vertices on the equirectangular seam. At a pole, longitude belongs
  // to the triangle's edge; one shared polar UV would stretch the whole map.
  for (let i = 0; i < indices.length; i += 3) {
    const ids = indices.slice(i, i + 3);
    const pole = ids.map(
      (id) => positions[id * 3] ** 2 + positions[id * 3 + 2] ** 2 < 1e-28,
    );
    const longitude = ids.map((id) => uvs[id * 2]);
    const reference = longitude[pole.findIndex((value) => !value)];
    for (let k = 0; k < 3; k++) {
      if (longitude[k] - reference > 0.5) longitude[k] -= 1;
      if (longitude[k] - reference < -0.5) longitude[k] += 1;
    }
    for (let k = 0; k < 3; k++) {
      if (pole[k])
        longitude[k] = (longitude[(k + 1) % 3] + longitude[(k + 2) % 3]) / 2;
      if (longitude[k] !== uvs[ids[k] * 2]) {
        const id = ids[k];
        indices[i + k] = positions.length / 3;
        positions.push(
          positions[id * 3],
          positions[id * 3 + 1],
          positions[id * 3 + 2],
        );
        uvs.push(longitude[k], uvs[id * 2 + 1]);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}
