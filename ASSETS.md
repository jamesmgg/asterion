# Imagery and data ledger

All runtime imagery, fonts, terrain and ephemerides are bundled locally. The app does not call an external imagery service or API. No AI-generated maps are presented as scientific observations.

## Surface imagery

`public/tiles/manifest.json` records source URLs, original widths, pyramid ceilings and source hashes where available. Tiles are 512 × 512 WebP images with a one-pixel neighbor gutter. Lower-resolution fallback JPEGs remain visible while tiles load. Resampling a source does not add observations; the renderer reports when it reaches the source limit.

| Dataset | Source and processing |
|---|---|
| Earth, 16K tiles | [NASA Blue Marble Next Generation, June 2004](https://visibleearth.nasa.gov/collection/1484/blue-marble), 21,600 × 10,800 base map resampled to 16,384 × 8,192. Water color and specular reflection are shader additions. |
| Moon, 16K tiles | [NASA SVS 2019 Moon Kit](https://svs.gsfc.nasa.gov/4720/), 16,384-pixel LROC color map. Credit NASA/Goddard Space Flight Center Scientific Visualization Studio, Ernie Wright; LROC and LOLA teams. Polar appearance includes visualization infill. |
| Mercury, Mars, Venus surface, 8K tiles | [Solar System Scope / INOVE](https://www.solarsystemscope.com/textures/), NASA-derived maps under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Original `8k_mercury.jpg`, `8k_mars.jpg`, `8k_venus_surface.jpg`. |
| Jupiter, Saturn, Sun, 4K tiles | The same Solar System Scope collection and license. Files named `8k_jupiter.jpg`, `8k_saturn.jpg`, `8k_sun.jpg` actually contain 4,096 × 2,048 pixels; their pyramids stop at 4K. |
| Venus clouds, Uranus, Neptune, Saturn rings | Solar System Scope `2k_venus_atmosphere.jpg`, `2k_uranus.jpg`, `2k_neptune.jpg`, `2k_saturn_ring_alpha.png`. Uranus uses a tinted, schematic version of the ring texture. |
| Earth clouds and ocean mask | Solar System Scope `8k_earth_clouds.jpg` and `8k_earth_specular_map.tif`, resampled to 4K. These are static maps with illustrative drift, not current weather. |
| Earth night lights | Solar System Scope `2k_earth_nightmap.jpg`. |
| Io, Europa, Ganymede, Callisto, Titan, Enceladus, Triton | [NASA 3D Resources, Images and Textures](https://github.com/nasa/NASA-3D-Resources/tree/master/Images%20and%20Textures). Original JPEG previews are 1,440 × 720, except Titan at 720 × 360; resized fallbacks do not imply 2K observations. Io uses the “Jupiter - Io (A)” map. Titan is an infrared surface visualization. Triton has incomplete spacecraft coverage. Exact paths are in the manifest. |
| `earth-hd.jpg` | Legacy unused Solar System Scope `8k_earth_daymap.jpg`, retained from the initial release. |

Solar System Scope maps include enhanced colors and artistic infill of unobserved regions. NASA maps also have coverage and processing limitations. Lighting, color balance, haze and cloud rendering are visualization choices, not calibrated radiometry. NASA material is used as attributed scientific imagery; no NASA endorsement is implied.

## Measured elevation

Elevation lives in `public/textures/*-height.png`. Red and green channels pack a 16-bit value; the manifest gives the decoded range in metres. All datasets are resampled to 4,096 × 2,048, which smooths local peaks. Geometric displacement uses physical radius units with no vertical exaggeration. Geoid/areoid heights are approximated as radial offsets from a mean sphere.

| World | Measurement source and decoding |
|---|---|
| Earth | [NOAA NCEI ETOPO 2022](https://www.ncei.noaa.gov/products/etopo-global-relief-model), 60-arcsecond surface GeoTIFF, elevations in metres relative to EGM2008. Ocean depths are clamped to zero to render a sea surface. |
| Moon | [NASA LOLA Moon Kit](https://svs.gsfc.nasa.gov/4720/), `ldem_16_uint.tif`, 5,760 × 2,880. Unsigned values decode as `value × 0.5 − 10000` metres relative to a 1,737,400 m sphere. |
| Mars | [NASA PDS MOLA MEGDR](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html), `megt90n000eb.img`, 16 pixels/degree, 5,760 × 2,880 signed big-endian 16-bit metre elevations relative to the areoid. Longitude is rolled from 0–360° to −180–180°. The associated `.lbl` describes the raster. |

These are global orbital datasets, not metre-resolution landing-site models. Other worlds have no measured displacement loaded. New impact craters are analytical deformations derived from the impact estimate, with idealized bowls and rims.

## Satellite trajectories

`public/ephemerides/*.json` contains 17,521 hourly planet-centered geometric states for each of the eight moons, spanning 2026-01-01 through 2028-01-01 TDB. Source: [NASA/JPL Horizons](https://ssd.jpl.nasa.gov/horizons/). The stored frame is ICRF ecliptic J2000, positions in metres and velocities in metres/second. Runtime interpolation is cubic Hermite; UTC to TDB uses an approximate 69.184-second offset for this interval.

Outside that window, fixed reference Keplerian orbits and illustrative phases replace the tables. Planet trajectories, spin-axis directions and prime meridians remain approximate even inside the window, so the combined display is not a precision eclipse predictor. The Io eclipse demonstration deliberately aligns Io with the Sun.

## Rebuilding the assets

Existing assets need no preprocessing to build or run the app. To regenerate them, use Python with Pillow and NumPy:

```sh
python scripts/prepare-assets.py
python scripts/extra-assets.py
python scripts/fetch-ephemerides.py
```

Raw downloads are cached under the Git-ignored `.asset-cache/` directory. The scripts retain source URLs; new upstream data may differ from this frozen release. Terrain source downloads require approximately 1 GB of free space.

## Fonts and procedural graphics

Outfit and DM Sans are bundled through pinned Fontsource packages under SIL Open Font License 1.1. Copies of their licenses and Three.js's MIT license are in `public/licenses/`.

Icons, star fields, asteroid geometry, fracture shaders, eclipse rendering, crater deformations and impact particles were authored for Asterion. Incoming animation, shock ring, flash and vapor/dust plume are cinematic; the separately colored ejecta trajectories come from the numerical transport model described in the README.
