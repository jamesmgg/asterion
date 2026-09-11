export interface Planet {
  id: string;
  name: string;
  kind: "rocky" | "gas" | "ice" | "star";
  mass: number;
  radius: number;
  color: string;
  tilt: number;
  rotation: number;
  atmosphere: { density: number; height: number } | null;
  targetDensity: number;
  description: string;
  subtitle: string;
  temperature: string;
  year: number;
}
export const SUN_MASS = 1.98847e30;
export const PLANETS: Planet[] = [
  {
    id: "sun",
    name: "Sun",
    kind: "star",
    mass: SUN_MASS,
    radius: 695700000,
    color: "#ffb554",
    tilt: 7.25,
    rotation: 609.12,
    atmosphere: null,
    targetDensity: 0,
    description:
      "The star that holds eight worlds in its gravitational embrace. Its light takes about eight minutes to reach Earth.",
    subtitle: "Our nearest star",
    temperature: "5,772 K",
    year: 0,
  },
  {
    id: "mercury",
    name: "Mercury",
    kind: "rocky",
    mass: 3.3011e23,
    radius: 2439700,
    color: "#baa99b",
    tilt: 0.034,
    rotation: 1407.6,
    atmosphere: null,
    targetDensity: 3000,
    description:
      "An ancient, cratered world with almost no atmosphere. Here, even small impactors reach the ground at cosmic speeds.",
    subtitle: "A world written in craters",
    temperature: "167 °C",
    year: 87.969,
  },
  {
    id: "venus",
    name: "Venus",
    kind: "rocky",
    mass: 4.8675e24,
    radius: 6051800,
    color: "#e5c792",
    tilt: 2.64,
    rotation: -5832.5,
    atmosphere: { density: 65, height: 15900 },
    targetDensity: 2900,
    description:
      "Beneath its luminous clouds lies a volcanic surface. A crushing carbon-dioxide atmosphere shields it from smaller asteroids.",
    subtitle: "The veiled world",
    temperature: "464 °C",
    year: 224.701,
  },
  {
    id: "earth",
    name: "Earth",
    kind: "rocky",
    mass: 5.9722e24,
    radius: 6371000,
    color: "#8bc9f3",
    tilt: 23.44,
    rotation: 23.9345,
    atmosphere: { density: 1.225, height: 8500 },
    targetDensity: 2750,
    description:
      "Our ocean world. A thin blue atmosphere protects a surface shaped by plate tectonics, water, and encounters from space.",
    subtitle: "A pale blue possibility",
    temperature: "15 °C",
    year: 365.256,
  },
  {
    id: "mars",
    name: "Mars",
    kind: "rocky",
    mass: 6.4171e23,
    radius: 3389500,
    color: "#e7a17e",
    tilt: 25.19,
    rotation: 24.6229,
    atmosphere: { density: 0.02, height: 11100 },
    targetDensity: 2900,
    description:
      "Rust-colored deserts, giant volcanoes, and the scars of ancient impacts. Its thin atmosphere offers little protection.",
    subtitle: "The next horizon",
    temperature: "−65 °C",
    year: 686.98,
  },
  {
    id: "jupiter",
    name: "Jupiter",
    kind: "gas",
    mass: 1.89813e27,
    radius: 69911000,
    color: "#d5bb9c",
    tilt: 3.13,
    rotation: 9.925,
    atmosphere: { density: 0.16, height: 27000 },
    targetDensity: 0,
    description:
      "A vast, banded giant with no solid surface. Incoming bodies break apart in its atmosphere, leaving luminous plumes and dark scars.",
    subtitle: "Gravity, on a grand scale",
    temperature: "−110 °C",
    year: 4332.59,
  },
  {
    id: "saturn",
    name: "Saturn",
    kind: "gas",
    mass: 5.6834e26,
    radius: 58232000,
    color: "#e8d6a6",
    tilt: 26.73,
    rotation: 10.656,
    atmosphere: { density: 0.19, height: 59500 },
    targetDensity: 0,
    description:
      "Countless fragments of ice form its extraordinary rings. Beneath the pale clouds is a deep, turbulent hydrogen atmosphere.",
    subtitle: "An architecture of ice",
    temperature: "−140 °C",
    year: 10759.22,
  },
  {
    id: "uranus",
    name: "Uranus",
    kind: "ice",
    mass: 8.681e25,
    radius: 25362000,
    color: "#a9e3e5",
    tilt: 82.23,
    rotation: -17.24,
    atmosphere: { density: 0.42, height: 27700 },
    targetDensity: 0,
    description:
      "A quiet cyan world rotating on its side. Methane colors its atmosphere above an interior rich in water, ammonia, and methane.",
    subtitle: "The sideways planet",
    temperature: "−195 °C",
    year: 30688.5,
  },
  {
    id: "neptune",
    name: "Neptune",
    kind: "ice",
    mass: 1.02413e26,
    radius: 24622000,
    color: "#789ee8",
    tilt: 28.32,
    rotation: 16.11,
    atmosphere: { density: 0.45, height: 19700 },
    targetDensity: 0,
    description:
      "Cold, distant, and restless. Fast winds sweep across this ice giant at the edge of the planetary solar system.",
    subtitle: "Beyond the blue",
    temperature: "−200 °C",
    year: 60182,
  },
];
// JPL SSD Table 1: a, e, I, L, longitude of perihelion, longitude of node.
export const ELEMENTS: Record<string, [number[], number[]]> = {
  mercury: [
    [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    [
      0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689,
      -0.12534081,
    ],
  ],
  venus: [
    [
      0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718,
      76.67984255,
    ],
    [
      0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329,
      -0.27769418,
    ],
  ],
  earth: [
    [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
  ],
  mars: [
    [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [
      0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088,
      -0.29257343,
    ],
  ],
  jupiter: [
    [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    [
      -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668,
      0.20469106,
    ],
  ],
  saturn: [
    [
      9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831,
      113.66242448,
    ],
    [
      -0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216,
      -0.28867794,
    ],
  ],
  uranus: [
    [
      19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763,
      74.01692503,
    ],
    [
      -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281,
      0.04240589,
    ],
  ],
  neptune: [
    [
      30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227,
      131.78422574,
    ],
    [
      0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464,
      -0.00508664,
    ],
  ],
};
export const MATERIALS = {
  stone: {
    name: "Stony",
    density: 3000,
    strength: 1e6,
    heat: 8e6,
    color: "#aca291",
  },
  iron: {
    name: "Iron",
    density: 7800,
    strength: 5e7,
    heat: 8e6,
    color: "#a3b9c5",
  },
  ice: {
    name: "Icy",
    density: 1000,
    strength: 1e5,
    heat: 3e6,
    color: "#b9efff",
  },
};
