/** Curated measurements and explicit display assumptions; provenance: docs/cosmic-sources.md. */
export type CosmicKind = "star" | "system" | "black-hole";

export interface CosmicBody {
  id: string;
  name: string;
  role: "star" | "planet" | "black-hole";
  radiusKm: number;
  radiusIsEstimate?: boolean;
  massSolar?: number;
  massEarth?: number;
  massIsMinimum?: boolean;
  temperatureK?: number;
  color: string;
  appearance:
    | "sunlike"
    | "red-dwarf"
    | "blue-star"
    | "red-supergiant"
    | "rocky"
    | "oceanic"
    | "gas-giant"
    | "black-hole";
  orbit?: {
    semiMajorAU: number;
    periodDays: number;
    eccentricity?: number;
    inclinationDeg?: number;
    phaseDeg?: number;
  };
  description: string;
}

export interface CosmicDestination {
  id: string;
  name: string;
  kind: CosmicKind;
  tagline: string;
  description: string;
  distanceLy: number;
  constellation: string;
  accent: string;
  bodies: CosmicBody[];
  sources: { label: string; url: string }[];
  modelNote: string;
}

const SOLAR_RADIUS_KM = 695700;
const EARTH_RADIUS_KM = 6371;
const AU_KM = 149597870.7;
const SOLAR_GM_KM3_S2 = 132712440041.279419;
const LIGHT_KM_S = 299792.458;

/** Reference horizon radius for an uncharged, nonrotating black hole; not its shadow radius. */
export function schwarzschildRadiusKm(massSolar: number): number {
  if (!Number.isFinite(massSolar) || massSolar <= 0) {
    throw new RangeError("A black hole requires a finite, positive mass.");
  }
  return (2 * SOLAR_GM_KM3_S2 * massSolar) / LIGHT_KM_S ** 2;
}

// Kepler-90 composite archive rows use different stellar fits. Adopt one host mass,
// then derive all semimajor axes from measured periods for a consistent system.
function axisFromPeriod(periodDays: number, massSolar: number): number {
  return (
    Math.cbrt(
      SOLAR_GM_KM3_S2 * massSolar * ((periodDays * 86400) / (2 * Math.PI)) ** 2,
    ) / AU_KM
  );
}

const trappistPlanets: CosmicBody[] = [
  {
    letter: "b",
    radius: 1.116,
    mass: 1.374,
    axis: 0.01154,
    period: 1.510826,
    color: "#b87960",
    description:
      "The innermost world completes a year in just 36 hours. Its size and mass are measured; the rendered rocks and craters are imagined.",
  },
  {
    letter: "c",
    radius: 1.097,
    mass: 1.308,
    axis: 0.0158,
    period: 2.421937,
    color: "#bd936b",
    description:
      "A rocky planet slightly larger than Earth in a tight orbit. Its surface appearance remains unknown.",
  },
  {
    letter: "d",
    radius: 0.788,
    mass: 0.388,
    axis: 0.02227,
    period: 4.049219,
    color: "#a4a496",
    description:
      "Smaller and lighter than Earth, this compact world circles its star every four days. Visible terrain is illustrative.",
  },
  {
    letter: "e",
    radius: 0.92,
    mass: 0.692,
    axis: 0.02925,
    period: 6.101013,
    color: "#7d9f9f",
    description:
      "An Earth-sized target for atmospheric studies. A temperate orbit does not establish oceans, an atmosphere, or life; its colors are illustrative.",
  },
  {
    letter: "f",
    radius: 1.045,
    mass: 1.039,
    axis: 0.03849,
    period: 9.20754,
    color: "#a0b0bf",
    description:
      "A roughly Earth-sized planet farther from the cool star. Its actual climate and surface are not known.",
  },
  {
    letter: "g",
    radius: 1.129,
    mass: 1.321,
    axis: 0.04683,
    period: 12.352446,
    color: "#b5bdc5",
    description:
      "The largest of the seven by measured radius. Pale terrain represents a possible appearance, not an observed surface.",
  },
  {
    letter: "h",
    radius: 0.755,
    mass: 0.326,
    axis: 0.06189,
    period: 18.772866,
    color: "#8c9fab",
    description:
      "The smallest and outermost known member finishes an orbit in under nineteen days. Its cold-looking surface is an illustration.",
  },
].map((p, i) => ({
  id: `trappist-1-${p.letter}`,
  name: `TRAPPIST-1 ${p.letter}`,
  role: "planet",
  radiusKm: p.radius * EARTH_RADIUS_KM,
  massEarth: p.mass,
  color: p.color,
  appearance: "rocky",
  orbit: {
    semiMajorAU: p.axis,
    periodDays: p.period,
    eccentricity: 0,
    inclinationDeg: 0,
    phaseDeg: 22 + i * 137.5,
  },
  description: p.description,
}));

const keplerPlanets: CosmicBody[] = [
  {
    letter: "b",
    radius: 1.31,
    period: 7.008151,
    color: "#c69676",
    appearance: "rocky",
  },
  {
    letter: "c",
    radius: 1.19,
    period: 8.719375,
    color: "#bc8466",
    appearance: "rocky",
  },
  {
    letter: "i",
    radius: 1.32,
    period: 14.44912,
    color: "#d5a16e",
    appearance: "rocky",
  },
  {
    letter: "d",
    radius: 2.87,
    period: 59.73667,
    color: "#c4ad83",
    appearance: "gas-giant",
  },
  {
    letter: "e",
    radius: 2.66,
    period: 91.93913,
    color: "#b4c2be",
    appearance: "gas-giant",
  },
  {
    letter: "f",
    radius: 2.88,
    period: 124.9144,
    color: "#83a5b8",
    appearance: "gas-giant",
  },
  {
    letter: "g",
    radius: 7.718,
    period: 210.73514,
    color: "#d8b489",
    appearance: "gas-giant",
    mass: 15,
  },
  {
    letter: "h",
    radius: 11.252,
    period: 331.60296,
    color: "#b69675",
    appearance: "gas-giant",
    mass: 203,
  },
].map((p, i) => ({
  id: `kepler-90-${p.letter}`,
  name: `Kepler-90 ${p.letter}`,
  role: "planet",
  radiusKm: p.radius * EARTH_RADIUS_KM,
  ...(p.mass === undefined ? {} : { massEarth: p.mass }),
  color: p.color,
  appearance: p.appearance as CosmicBody["appearance"],
  orbit: {
    semiMajorAU: axisFromPeriod(p.period, 1.242),
    periodDays: p.period,
    eccentricity: 0,
    inclinationDeg: 0,
    phaseDeg: 36 + i * 137.5,
  },
  description:
    p.letter === "i"
      ? "This transiting planet was found with machine learning in Kepler observations, bringing the system to eight known planets. Surface colors are imagined."
      : p.letter === "g"
        ? "A very low-density giant: its measured radius is large despite a modest mass. The atmospheric bands shown here are illustrative."
        : p.letter === "h"
          ? "The outermost known planet has a radius close to Jupiter's and a year shorter than Earth's. Its cloud patterns are imagined."
          : i < 3
            ? "A small transiting planet in a hot, compact inner orbit. The measured radius sets its scale; terrain and composition are illustrative."
            : "A planet between Earth and Neptune in size. Atmospheric bands suggest a possible gas envelope; composition and appearance are not established.",
}));

export const COSMIC_DESTINATIONS: CosmicDestination[] = [
  {
    id: "sirius-a",
    name: "Sirius A",
    kind: "star",
    tagline: "The brilliant Dog Star",
    description:
      "A nearby blue-white star and the brightest star in Earth's night sky. Sirius A is almost twice the Sun's mass and shares its system with the white dwarf Sirius B.",
    distanceLy: 8.6,
    constellation: "Canis Major",
    accent: "#a8d9ff",
    bodies: [
      {
        id: "sirius-a-star",
        name: "Sirius A",
        role: "star",
        radiusKm: 1.713 * SOLAR_RADIUS_KM,
        massSolar: 2.0,
        temperatureK: 9845,
        color: "#bddaff",
        appearance: "blue-star",
        description:
          "Interferometry measures a radius of about 1.71 Suns and an effective temperature near 9,845 K. The bright primary is the focus of this destination.",
      },
    ],
    sources: [
      {
        label: "ESA · The Sirius binary",
        url: "https://www.esa.int/Science_Exploration/Space_Science/Weighing_the_Dog_Star_s_companion",
      },
      {
        label: "Davis et al. · Sirius A radius and temperature",
        url: "https://arxiv.org/abs/1010.3790",
      },
    ],
    modelNote:
      "Stellar radius and temperature follow measured estimates. Animated surface patterns and brightness are illustrative; Sirius B and the binary orbit are outside this focused view.",
  },
  {
    id: "vega",
    name: "Vega",
    kind: "star",
    tagline: "Blue-white beacon of Lyra",
    description:
      "One corner of the Summer Triangle, Vega is a rapidly rotating nearby star surrounded by a broad disk of dust. Its pole is hotter than its equator.",
    distanceLy: 25.05,
    constellation: "Lyra",
    accent: "#a6bdff",
    bodies: [
      {
        id: "vega-star",
        name: "Vega",
        role: "star",
        radiusKm: Math.cbrt(2.726 ** 2 * 2.418) * SOLAR_RADIUS_KM,
        radiusIsEstimate: true,
        massSolar: 2.15,
        temperatureK: 9360,
        color: "#c8d6ff",
        appearance: "blue-star",
        description:
          "A representative radius of 2.62 Suns preserves the volume of an oblate model. The 9,360 K temperature is a surface average; Vega's equator is cooler than its poles.",
      },
    ],
    sources: [
      {
        label: "NASA · Vega and its debris disk",
        url: "https://science.nasa.gov/solar-system/skywatching/night-sky-network/summer-triangle-corner-vega/",
      },
      {
        label: "Monnier et al. · Vega's rotation and radius",
        url: "https://www.chara.gsu.edu/files/papers/2012_Monnier_ApJL_761_L3.pdf",
      },
    ],
    modelNote:
      "Vega is shown as a sphere with a volume-equivalent radius from a rotating stellar model. Its real flattening, temperature variation and dust disk are not resolved here; surface patterns are illustrative.",
  },
  {
    id: "betelgeuse",
    name: "Betelgeuse",
    kind: "star",
    tagline: "An immense, restless supergiant",
    description:
      "Orion's red supergiant has a vast, changing atmosphere. At the center of our Solar System, this representative photosphere would extend beyond the orbit of Mars.",
    distanceLy: 548,
    constellation: "Orion",
    accent: "#ffab78",
    bodies: [
      {
        id: "betelgeuse-star",
        name: "Betelgeuse",
        role: "star",
        radiusKm: 724 * SOLAR_RADIUS_KM,
        radiusIsEstimate: true,
        temperatureK: 3650,
        color: "#ffac78",
        appearance: "red-supergiant",
        description:
          "The adopted radius is roughly 724 Suns, with an effective temperature around 3,650 K. Distance, radius and brightness are uncertain and variable.",
      },
    ],
    sources: [
      {
        label: "NASA · Betelgeuse's uncertain size and distance",
        url: "https://www.nasa.gov/blogs/watch-the-skies/2024/09/06/betelgeuse-betelgeuse-betelgeuse-stargazers-wont-see-ghosts-but-supergiant-star-for-spooky-season/",
      },
      {
        label: "Dupree et al. · Betelgeuse's atmosphere",
        url: "https://assets.science.nasa.gov/content/dam/science/missions/hubble/releases/2022/08/STScI-01GA6PQQ0RZEDP76CKEDD01A74.pdf",
      },
    ],
    modelNote:
      "Radius and distance are representative estimates for a variable, extended star; published fits differ substantially. Convective patterns and motion are illustrative, and no companion or supernova evolution is modeled.",
  },
  {
    id: "trappist-1",
    name: "TRAPPIST-1",
    kind: "system",
    tagline: "Seven worlds around a tiny star",
    description:
      "Seven roughly Earth-sized planets crowd around an ultracool red dwarf. All seven orbits fit comfortably inside Mercury's orbit in our Solar System.",
    distanceLy: 40.54,
    constellation: "Aquarius",
    accent: "#eea48e",
    bodies: [
      {
        id: "trappist-1-star",
        name: "TRAPPIST-1",
        role: "star",
        radiusKm: 0.1192 * SOLAR_RADIUS_KM,
        massSolar: 0.0898,
        temperatureK: 2566,
        color: "#ffbb91",
        appearance: "red-dwarf",
        description:
          "This ultracool dwarf is only about 12% of the Sun's radius. Its low luminosity allows temperate irradiation much closer to the star.",
      },
      ...trappistPlanets,
    ],
    sources: [
      {
        label: "NASA Exoplanet Archive · TRAPPIST-1",
        url: "https://exoplanetarchive.ipac.caltech.edu/overview/TRAPPIST-1",
      },
      {
        label: "NASA · What Webb is revealing",
        url: "https://science.nasa.gov/mission/webb/science-overview/science-explainers/what-is-webb-revealing-about-the-trappist-1-system/",
      },
      {
        label: "Agol et al. · Masses, radii and dynamics",
        url: "https://ntrs.nasa.gov/api/citations/20210000129/downloads/Agol_2021_Planet._Sci._J._2_1_Refining.Trappist1.pdf",
      },
    ],
    modelNote:
      "Measured periods, radii and masses anchor this model. Circular, coplanar orbits and starting phases are illustrative; resonant interactions and transit timing variations are not integrated. All planet surfaces are imagined, not photographs or evidence of oceans.",
  },
  {
    id: "kepler-90",
    name: "Kepler-90",
    kind: "system",
    tagline: "Eight planets, one compact family",
    description:
      "A distant Sun-like star with eight confirmed planets: small inner worlds, larger outer planets, and an entire known family packed into roughly Earth's orbital distance.",
    distanceLy: 2766.63,
    constellation: "Draco",
    accent: "#dcc390",
    bodies: [
      {
        id: "kepler-90-star",
        name: "Kepler-90",
        role: "star",
        radiusKm: 1.185 * SOLAR_RADIUS_KM,
        massSolar: 1.242,
        temperatureK: 6031,
        color: "#ffdfab",
        appearance: "sunlike",
        description:
          "The selected stellar estimate is 1.24 solar masses and 1.19 solar radii. The archive also identifies this star as KOI-351.",
      },
      ...keplerPlanets,
    ],
    sources: [
      {
        label: "NASA Exoplanet Archive · Eight confirmed planets",
        url: "https://exoplanetarchive.ipac.caltech.edu/overview/Kepler-90",
      },
      {
        label: "NASA · The eighth planet discovery",
        url: "https://science.nasa.gov/universe/exoplanets/discovery-of-eight-planets-makes-alien-system-the-first-to-tie-with-our-solar-system/",
      },
      {
        label: "Shaw et al. · Updated giant-planet masses",
        url: "https://arxiv.org/abs/2507.13588",
      },
    ],
    modelNote:
      "Radii and periods follow archive estimates. Orbital distances are derived from those periods and one adopted stellar mass; circles, coplanarity and phases are illustrative. Planet surfaces and cloud bands are imagined. Unmeasured inner-planet masses are omitted.",
  },
  {
    id: "proxima-centauri",
    name: "Proxima Centauri",
    kind: "system",
    tagline: "A world around our nearest stellar neighbor",
    description:
      "The nearest star to the Sun is a faint red dwarf. Explore its confirmed planet Proxima b, which completes an orbit in about eleven Earth days.",
    distanceLy: 4.244,
    constellation: "Centaurus",
    accent: "#ec977c",
    bodies: [
      {
        id: "proxima-centauri-star",
        name: "Proxima Centauri",
        role: "star",
        radiusKm: 0.141 * SOLAR_RADIUS_KM,
        massSolar: 0.1221,
        temperatureK: 2900,
        color: "#ffc09b",
        appearance: "red-dwarf",
        description:
          "This small, active star is the distant third member of the Alpha Centauri stellar system. Its light is much fainter and redder than the Sun's.",
      },
      {
        id: "proxima-centauri-b",
        name: "Proxima b",
        role: "planet",
        radiusKm: 1.02 * EARTH_RADIUS_KM,
        radiusIsEstimate: true,
        massEarth: 1.055,
        massIsMinimum: true,
        color: "#819c91",
        appearance: "rocky",
        orbit: {
          semiMajorAU: 0.04848,
          periodDays: 11.18465,
          eccentricity: 0,
          inclinationDeg: 0,
          phaseDeg: 135,
        },
        description:
          "The 1.055-Earth mass is a minimum from radial velocity. Its radius has not been measured; 1.02 Earth radii is an estimate for display. Oceans, atmosphere and habitability are unconfirmed.",
      },
    ],
    sources: [
      {
        label: "NASA Exoplanet Archive · Proxima b",
        url: "https://exoplanetarchive.ipac.caltech.edu/overview/Proxima%20Cen%20b",
      },
      {
        label: "ESO · Discovery of Proxima b",
        url: "https://www.eso.org/public/news/eso1629/",
      },
      {
        label: "ESO · Measuring Proxima's small star",
        url: "https://www.eso.org/public/news/eso0232/",
      },
    ],
    modelNote:
      "This selected view includes Proxima b, not every reported companion. Its radius is estimated, mass is a minimum, and atmosphere and surface are unknown. The circular orbit, inclination, phase and terrain are illustrative; stellar flares are not a measured forecast.",
  },
  {
    id: "sagittarius-a",
    name: "Sagittarius A*",
    kind: "black-hole",
    tagline: "The dark heart of the Milky Way",
    description:
      "Our galaxy's central black hole holds about four million solar masses. The Event Horizon Telescope revealed the surrounding emission and central shadow in 2022.",
    distanceLy: 27000,
    constellation: "Sagittarius",
    accent: "#eeb183",
    bodies: [
      {
        id: "sagittarius-a-hole",
        name: "Sagittarius A*",
        role: "black-hole",
        radiusKm: schwarzschildRadiusKm(4e6),
        massSolar: 4e6,
        color: "#ffb970",
        appearance: "black-hole",
        description:
          "A nonrotating black hole of this mass has a reference horizon radius of about 11.8 million km. Its gravitationally lensed shadow is larger than the event horizon.",
      },
    ],
    sources: [
      {
        label: "ESO / EHT · First image of Sagittarius A*",
        url: "https://www.eso.org/public/news/eso2208-eht-mw/",
      },
      {
        label: "ESO / EHT · Comparing two black holes",
        url: "https://www.eso.org/public/images/eso2208-eht-mwe/",
      },
    ],
    modelNote:
      "Illustrative thin accretion disk with approximate light bending around a nonrotating Schwarzschild reference. Gas brightness and colors are imagined, not an EHT image or a numerical general-relativity solution. The radius readout is the reference horizon, not the shadow.",
  },
  {
    id: "m87",
    name: "M87*",
    kind: "black-hole",
    tagline: "A black hole on a Solar System scale",
    description:
      "The first black hole imaged by the Event Horizon Telescope sits in the giant galaxy Messier 87. Its mass is about 6.5 billion Suns, roughly 1,625 times that of Sagittarius A*.",
    distanceLy: 55e6,
    constellation: "Virgo",
    accent: "#efbc86",
    bodies: [
      {
        id: "m87-hole",
        name: "M87*",
        role: "black-hole",
        radiusKm: schwarzschildRadiusKm(6.5e9),
        massSolar: 6.5e9,
        color: "#ffc18d",
        appearance: "black-hole",
        description:
          "The reference horizon radius is about 128 AU. The measured mass has substantial uncertainty; the famous EHT ring traces lensed emission outside the horizon.",
      },
    ],
    sources: [
      {
        label: "ESO / EHT · First black-hole image",
        url: "https://www.eso.org/public/news/eso1907/",
      },
      {
        label: "EHT Collaboration · M87 mass and shadow",
        url: "https://arxiv.org/abs/1906.11238",
      },
    ],
    modelNote:
      "Illustrative thin accretion disk with approximate light bending around a nonrotating Schwarzschild reference. Colors and brightness are imagined, not EHT data or a numerical general-relativity solution. Spin, magnetic fields and M87's jet are not modeled; radius means reference horizon.",
  },
];

export function getCosmicDestination(
  id: string,
): CosmicDestination | undefined {
  return COSMIC_DESTINATIONS.find((destination) => destination.id === id);
}

/** Independent Kepler orbit, AU; +Y north and prograde motion from +X toward -Z. */
export function cosmicOrbitPosition(
  body: CosmicBody,
  elapsedDays: number,
): [number, number, number] {
  if (!body.orbit) return [0, 0, 0];
  const orbit = body.orbit;
  const tau = 2 * Math.PI;
  const eccentricity = orbit.eccentricity ?? 0;
  const phase = ((orbit.phaseDeg ?? 0) * Math.PI) / 180;
  const meanAnomaly =
    (((((elapsedDays % orbit.periodDays) / orbit.periodDays) * tau + phase) %
      tau) +
      tau) %
    tau;
  let eccentricAnomaly = eccentricity < 0.8 ? meanAnomaly : Math.PI;
  for (let i = 0; i < 16; i++) {
    const step =
      (eccentricAnomaly -
        eccentricity * Math.sin(eccentricAnomaly) -
        meanAnomaly) /
      (1 - eccentricity * Math.cos(eccentricAnomaly));
    eccentricAnomaly -= step;
    if (Math.abs(step) < 1e-13) break;
  }
  const x = orbit.semiMajorAU * (Math.cos(eccentricAnomaly) - eccentricity);
  const z =
    orbit.semiMajorAU *
    Math.sqrt(1 - eccentricity * eccentricity) *
    Math.sin(eccentricAnomaly);
  const inclination = ((orbit.inclinationDeg ?? 0) * Math.PI) / 180;
  return [x, z * Math.sin(inclination), -z * Math.cos(inclination)];
}
