# Asterion

A locally hosted 3D orbital observatory and asteroid-impact laboratory. Built with TypeScript, Three.js, custom planet/atmosphere shaders, and a separate numerical physics module. No API keys, telemetry, account, or external runtime assets.

## Run in Docker

From this directory:

```powershell
docker compose up -d --build web
```

Open **http://localhost:8787**. The single long-lived service is `asterion-web-1`, bound to loopback. Docker restarts it automatically. The container serves the production build through Nginx; simulation runs on the viewing device's GPU/CPU.

```powershell
docker compose ps
docker compose logs --tail 30 web
docker compose stop web
```

## Private Tailscale access

Find your host's Tailscale IPv4 address with `tailscale ip -4`. Once the private Serve route is enabled, open `http://<your-tailscale-ip>:8787` from a device connected to the same tailnet. Docker stays loopback-bound. There is no public Funnel or broad firewall exception.

To enable only this route, after inspecting existing routes:

```powershell
tailscale serve status
tailscale serve --bg --tcp 8787 tcp://127.0.0.1:8787
```

To remove only this route: `tailscale serve --tcp 8787 off`. Do not reset all Serve configuration; other projects use it.

## Explore

- Visit the Sun or any of the eight planets from the destination dock. On a phone, swipe the dock to reach the outer worlds.
- Drag to orbit; scroll or pinch to zoom. The + / − buttons and camera reset provide alternatives.
- Solar system view offers readable spacing or true orbital distances. Planet sizes are enlarged in both map modes.
- Set the simulation date and time speed, pause, or return to now. Space toggles pause; brackets change worlds.
- Explore includes physical data, cloud visibility, Venus surface reveal, optional 8K Earth imagery, and render resolution controls.
- Impact lab supports **1 m–100 km** diameters, **11–72 km/s** entry speeds, **5–90°** entry angles, and stony/iron/icy composition. Historical-size presets are adjustable experiments, not reconstructions of their original locations.
- Choose an impact site and tap the globe, then launch. Orbital time pauses so the event remains visible. Resume manually when ready.
- Results include atmospheric energy deposition, arrival speed, crater estimates, an entry profile, and model-specific limitations. Replay does not create another history entry or scar.
- The last 20 encounters persist in local storage in the current browser/origin. Export them as JSON. Scars last for the current page session (up to 16 per planet).
- Image capture downloads the 3D view. Sound is optional and represents an interface cue.

## Physics and accuracy

This is a scientific exploration app with an explicitly simplified impact model. It is **not** a high-precision ephemeris, validated hazard predictor, or shock-hydrodynamics solver.

### Solar system

Nine mutually interacting Newtonian point masses (Sun + eight planets), in AU, days, and solar masses. Velocity-Verlet steps never exceed 0.125 day. Initial positions and centered-difference velocities are derived from JPL SSD's approximate Keplerian elements and century rates. Initial dates are restricted to 1800–2050. Earth represents the Earth–Moon barycenter approximately, without a separate Moon mass. No relativity, satellites, tides, or small-body perturbations. UTC approximates ephemeris time. This is suitable for exploration, not spacecraft navigation.

Close-ups normalize the planet radius, retain rotation periods and approximate obliquities, and illuminate surfaces from the sunward direction. Prime-meridian alignment, seasons, cloud motion, and reference orbit guides are illustrative. The asteroid belt is decorative. Impacts do not change a planet's mass, spin, orbit, or global structure.

### Impact entry

SI units. Spherical initial mass `m = density × πD³/6`; entry energy `E = ½mv²`. Speed is specified at the model's entry altitude, not at infinity. Gravity is `GM/r²`. The descent uses 100 m maximum altitude steps and 0.1 s maximum time steps with exponential atmospheres, drag coefficient 1, heat-transfer coefficient 0.02, ablation, and dynamic-pressure fragmentation. Fragment cloud radius expands up to seven initial radii. Descent angle is constant; skip-out is not resolved. The solver ends at the surface, after hypervelocity is lost, after near-total ablation, or at a finite iteration limit. The latter is a safeguard, not a physical termination condition.

Material assumptions: stone density 3,000 kg/m³, strength 1 MPa; iron 7,800 kg/m³, 50 MPa; ice 1,000 kg/m³, 0.1 MPa. Ablation energies: 8 MJ/kg for rock/iron and 3 MJ/kg for ice. These are uncertain bulk approximations, not measurements of a specific asteroid.

### Craters and visualization

Dry-rock, gravity-regime transient crater diameter follows Collins, Melosh & Marcus (2005), equation 21. Simple/complex transition is scaled with gravity. Planetary target rock densities and atmosphere profiles are representative. Oceans, detailed target geology/strength, global climate, tsunamis, basin collapse, and disruption are outside the model. For gas/ice giants, atmosphere extrapolation is illustrative; no solid crater is reported.

Small scars have a minimum display radius for visibility. Incoming trajectory, flash, shock ring, debris and plumes are cinematic effects, played in about eight seconds independently of the modeled descent duration. The plotted profile is the numerical entry result. Quantitative predictions can have substantial uncertainty; relevant warnings appear with each result.

Sources:

- [JPL approximate planetary positions and elements](https://ssd.jpl.nasa.gov/planets/approx_pos.html)
- [JPL planetary physical parameters](https://ssd.jpl.nasa.gov/planets/phys_par.html)
- [Collins, Melosh & Marcus (2005), Earth Impact Effects Program](https://doi.org/10.1111/j.1945-5100.2005.tb00157.x)
- [NASA planetary fact sheets](https://nssdc.gsfc.nasa.gov/planetary/factsheet/)

## Verification

The production Docker build runs the numerical/asset tests and TypeScript checks before building. Browser tests run in a separate disposable Playwright container, with software WebGL rendering, no host ports, and a 1 GB shared-memory allocation:

```powershell
docker compose --profile test build tests
docker compose --profile test run --rm tests
```

Tests cover orbital residuals, a year of energy/momentum conservation, mass/energy scaling, gravitational acceleration in vacuum, airbursts, crater formation, gas-giant behavior, invalid inputs, and actual image-file signatures. Browser tests cover every planet, scale modes, launches, replay, rendering errors, mobile layout, cancellation, touch targeting, pinch zoom, export, persistence, and science documentation. Screenshots are saved under `test-results/`.

Local development (Node 24+): `npm ci`, `npm test`, `npm run dev`. Local Vite binds 127.0.0.1. Docker is the canonical running application.

## Assets

Planet maps are by **Solar System Scope / INOVE**, based on NASA data, under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See [ASSETS.md](ASSETS.md) for the source ledger. Fonts are locally bundled from Fontsource (Outfit and DM Sans, SIL Open Font License). The renderer adds lighting, clouds, atmosphere and procedural impact art; planetary map source files are otherwise unmodified.
