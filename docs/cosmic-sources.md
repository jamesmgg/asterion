# Cosmos catalogue: provenance and model limits

The catalogue in `src/cosmic-data.ts` is a curated snapshot researched on **2026-09-11**. It is not a live ephemeris, an exhaustive catalogue, or a claim that unknown worlds have been photographed. Numeric values are representative estimates, not uncertainty-free measurements. Sources are also linked from each destination in the app.

## Common model

Distances are approximate distances from Earth, in light-years. Physical body radii use kilometres, orbital semimajor axes use AU, and periods use Earth days. Conversions use 695,700 km per nominal solar radius, 6,371 km per mean Earth radius, 149,597,870.7 km per AU, and 3.26156 light-years per parsec. [JPL's astrodynamic parameters](https://ssd.jpl.nasa.gov/astro_par.html) give the solar gravitational parameter 132,712,440,041.279419 km³/s² and light speed 299,792.458 km/s.

`cosmicOrbitPosition` solves Kepler's equation for independent two-body ellipses. It returns AU in the renderer's right-handed convention: +Y north, motion from +X toward −Z for an untilted prograde orbit. The catalogue uses circular, coplanar planets because the scene is an architectural overview, not a fitted transit reconstruction. Starting phases are deliberately chosen for a readable initial view. The simulation does not integrate interactions between exoplanets, tidal evolution, resonant libration, or observed transit-timing variations. Positions have no UTC epoch and must not be presented as current observed positions.

Surface colors, craters, clouds, stellar convection and accretion flow structure are procedural illustrations. No exoplanet ocean, atmosphere, terrain, or habitability is inferred from those visuals. The measured or estimated radius remains the physical reference even where a renderer offers enlargement for readability.

## Stars

| Destination | Adopted physical reference                                                                                          | Provenance and limitations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sirius A    | Radius 1.713 solar; mass about 2.0 solar; effective temperature 9,845 K; distance 8.6 ly                            | Radius and temperature from [Davis et al. (2010)](https://arxiv.org/abs/1010.3790), who give ±0.009 solar radii and ±64 K. Rounded mass, distance, and the binary context come from [ESA's Hubble account](https://www.esa.int/Science_Exploration/Space_Science/Weighing_the_Dog_Star_s_companion). The focused scene omits Sirius B and the binary orbit.                                                                                                                                                                                                                                                                                                             |
| Vega        | Volume-equivalent radius about 2.62 solar; mass 2.15 solar; surface-averaged temperature 9,360 K; distance 25.05 ly | [Monnier et al. (2012), Table 2, Model 3](https://www.chara.gsu.edu/files/papers/2012_Monnier_ApJL_761_L3.pdf) gives polar radius 2.418, equatorial radius 2.726, surface-averaged temperature 9,360 ±90 K and mass 2.15 (+0.10/−0.15) solar. The catalogue derives `cbrt(Req² × Rpol)` for a spherical approximation. [NASA's Vega overview](https://science.nasa.gov/solar-system/skywatching/night-sky-network/summer-triangle-corner-vega/) describes the star and observed debris disk. Flattening, gravity darkening and the disk are not resolved in this scene.                                                                                                 |
| Betelgeuse  | Representative radius 724 solar; temperature 3,650 K; approximate distance 548 ly                                   | The radius and explicitly uncertain distance follow [NASA's 2024 overview](https://www.nasa.gov/blogs/watch-the-skies/2024/09/06/betelgeuse-betelgeuse-betelgeuse-stargazers-wont-see-ghosts-but-supergiant-star-for-spooky-season/). [Dupree et al. (2022)](https://assets.science.nasa.gov/content/dam/science/missions/hubble/releases/2022/08/STScI-01GA6PQQ0RZEDP76CKEDD01A74.pdf) discusses divergent distance/radius determinations and a nominal 3,650 ±50 K temperature. These are representative values, not a single coherent interior fit; the star varies and has an extended atmosphere. No precise mass, companion orbit, or supernova date is asserted. |

## Planetary systems

Measured planetary parameters were fetched from the public [NASA Exoplanet Archive TAP service](https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html), `pscomppars`, using this query:

```sql
select pl_name, hostname, pl_orbper, pl_orbsmax, pl_rade,
       pl_bmasse, pl_bmassprov, st_rad, st_mass, st_teff, sy_dist
from pscomppars
where hostname in ('TRAPPIST-1', 'Kepler-90', 'Proxima Cen', 'KOI-351')
```

The composite table can combine different papers and may supply mass–radius relationship estimates. We distinguish these from measurements: estimated inner Kepler-90 masses are omitted, and the Proxima b radius is identified as estimated. Orbital phases and mutual inclinations are never copied from line-of-sight transit inclinations.

### TRAPPIST-1

The [archive overview](https://exoplanetarchive.ipac.caltech.edu/overview/TRAPPIST-1) and [Agol et al. (2021)](https://ntrs.nasa.gov/api/citations/20210000129/downloads/Agol_2021_Planet._Sci._J._2_1_Refining.Trappist1.pdf) support the seven planets. Host values are 0.1192 solar radii, 0.0898 solar masses, 2,566 K, and 12.42988881 pc. The catalogue rounds the converted distance to 40.54 ly.

| Planet | Period (days) | Semimajor axis (AU) | Radius (Earth) | Mass (Earth) |
| ------ | ------------: | ------------------: | -------------: | -----------: |
| b      |      1.510826 |             0.01154 |          1.116 |        1.374 |
| c      |      2.421937 |             0.01580 |          1.097 |        1.308 |
| d      |      4.049219 |             0.02227 |          0.788 |        0.388 |
| e      |      6.101013 |             0.02925 |          0.920 |        0.692 |
| f      |      9.207540 |             0.03849 |          1.045 |        1.039 |
| g      |     12.352446 |             0.04683 |          1.129 |        1.321 |
| h      |     18.772866 |             0.06189 |          0.755 |        0.326 |

These are published best-fit values, not exact values. The app does not assert that any planet has oceans or a substantial atmosphere. [NASA's Webb science explainer](https://science.nasa.gov/mission/webb/science-overview/science-explainers/what-is-webb-revealing-about-the-trappist-1-system/) documents the ongoing atmospheric investigation.

### Kepler-90 / KOI-351

The [archive overview](https://exoplanetarchive.ipac.caltech.edu/overview/Kepler-90) lists **eight confirmed planets**. The visible names use Kepler-90; the archive uses KOI-351 for most records. The catalogue selects the updated outer-planet host estimate: radius 1.185 solar, mass 1.242 solar, temperature 6,031 K. Archive distance 848.254 pc becomes about 2,766.63 ly; this differs from the older rounded distance in the [2017 NASA discovery account](https://science.nasa.gov/universe/exoplanets/discovery-of-eight-planets-makes-alien-system-the-first-to-tie-with-our-solar-system/).

| Planet, inner to outer | Period (days) | Radius (Earth) | Mass shown (Earth) |
| ---------------------- | ------------: | -------------: | -----------------: |
| b                      |      7.008151 |          1.310 |                  — |
| c                      |      8.719375 |          1.190 |                  — |
| i                      |     14.449120 |          1.320 |                  — |
| d                      |     59.736670 |          2.870 |                  — |
| e                      |     91.939130 |          2.660 |                  — |
| f                      |    124.914400 |          2.880 |                  — |
| g                      |    210.735140 |          7.718 |                 15 |
| h                      |    331.602960 |         11.252 |                203 |

The outer-planet measurements include the updated low density of g from [Shaw et al. (2025)](https://arxiv.org/abs/2507.13588). The archive's inner-planet masses are mass–radius relationship estimates and are deliberately omitted. The 2.7–2.9 Earth-radius planets are shown with illustrative gas envelopes, not a claim of measured composition.

**Semimajor axes are derived**, using `a = cbrt(GMstar × (P / 2π)²)`, from the listed periods and common host mass. This avoids combining archive semimajor axes from incompatible stellar fits (some old tabulated axes disagree substantially with the selected stellar mass). Measured periods and relative orbital timing are retained; all orbits are circular illustrative models, not new orbital fits.

### Proxima Centauri

The selected [Proxima b archive record](https://exoplanetarchive.ipac.caltech.edu/overview/Proxima%20Cen%20b) gives period 11.18465 days, semimajor axis 0.04848 AU, and **minimum mass** `M sin i = 1.055` Earth masses. Its radius is **not measured**: the displayed 1.02 Earth radii comes from the archive's estimated value. Host radius 0.141 solar, mass 0.1221 solar, temperature 2,900 K, and distance 1.30119 pc are the adopted composite values. [ESO's discovery account](https://www.eso.org/public/news/eso1629/) describes the radial-velocity detection, while [ESO's interferometric measurements](https://www.eso.org/public/news/eso0232/) establish the star's small size.

This destination focuses on b. It does not claim b is the only known planet: the queried archive also contains d. Candidate/disputed companion c is omitted. Alpha Centauri A/B are outside the selected scene. No liquid water, atmosphere, true planetary mass, or measured planetary radius is implied.

## Black holes

The reference radius is `rs = 2 GM / c²`, about 2.95325 km per solar mass; see [NASA's black-hole explanation](https://imagine.gsfc.nasa.gov/science/objects/black_holes2.html). It is the horizon radius of an uncharged **nonrotating Schwarzschild model**, not the apparent shadow radius and not a determination of a spinning object's horizon. A distant Schwarzschild shadow's critical impact parameter is `3√3 GM/c²`, about 2.598 times the reference horizon radius.

| Destination     |           Adopted mass |            Distance |               Reference radius | Sources                                                                                                                                                                             |
| --------------- | ---------------------: | ------------------: | -----------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sagittarius A\* |   About 4 million Suns |     About 27,000 ly |          About 11.8 million km | [ESO / EHT first image (2022)](https://www.eso.org/public/news/eso2208-eht-mw/), [ESO / EHT size comparison](https://www.eso.org/public/images/eso2208-eht-mwe/)                    |
| M87\*           | About 6.5 billion Suns | About 55 million ly | About 19.2 billion km / 128 AU | [ESO / EHT announcement (2019)](https://www.eso.org/public/news/eso1907/), [EHT Collaboration first results](https://arxiv.org/abs/1906.11238) (mass uncertainty ±0.7 billion Suns) |

The app shows an **illustrative thin accretion disk with approximate light bending**. It is not an EHT image, radiometric prediction, general-relativistic magnetohydrodynamic simulation, or a full numerical general-relativity solution. Gas brightness and colors are illustrative; spin, magnetic fields and M87's observed jet are not modeled. The image ring is not a material solid surface. Radius labels refer to the reference horizon.

## Verification

`tests/cosmic-data.test.mjs` checks catalogue uniqueness and system multiplicities; finite, positive physical values; stellar clearance; Kepler period–distance–host-mass consistency; periapsis and apoapsis of an eccentric test orbit; closure for positive and negative times; the spatial orientation convention; and physical Schwarzschild scaling. These are model and data consistency checks, not observational validation of the procedural visuals.
