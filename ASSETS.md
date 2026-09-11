# Asset ledger

Planet textures: **Solar System Scope / INOVE**, [original collection](https://www.solarsystemscope.com/textures/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Based on NASA imagery and elevation data. The collection includes enhanced color and artistic infill of unmapped regions. Attribution is also available in the app's Science & sources dialog.

All files below live in `public/textures/`. They were retrieved on 2026-09-10 and are bundled in the production container; browsing the app does not contact these hosts.

| Local file | Publisher source filename |
|---|---|
| earth.jpg | 2k_earth_daymap.jpg |
| earth-hd.jpg | 8k_earth_daymap.jpg |
| earth-night.jpg | 2k_earth_nightmap.jpg |
| clouds.jpg | 2k_earth_clouds.jpg |
| mercury.jpg | 2k_mercury.jpg |
| venus.jpg | 2k_venus_atmosphere.jpg |
| venus-surface.jpg | 2k_venus_surface.jpg |
| mars.jpg | 2k_mars.jpg |
| jupiter.jpg | 2k_jupiter.jpg |
| saturn.jpg | 2k_saturn.jpg |
| saturn-ring.png | 2k_saturn_ring_alpha.png |
| uranus.jpg | 2k_uranus.jpg |
| neptune.jpg | 2k_neptune.jpg |
| sun.jpg | 2k_sun.jpg |
| moon.jpg | 2k_moon.jpg (reserved asset; not currently rendered) |

Publisher download base: `https://www.solarsystemscope.com/textures/download/`.

Mercury's publisher download returned 403. The identical attributed texture was obtained through [this Git LFS mirror](https://media.githubusercontent.com/media/TanvirAhmedArnab/SolarSystem/main/SourceAssets/ThirdParty/Textures/SolarSystemScope/2k_mercury.jpg). SHA-256: `5a5c80607f643496bac9a631e71957def35ed788895f18b678ac849c2b38e48a` (872,555 bytes), matching the mirror's content pointer.

Fonts: Outfit and DM Sans, via pinned Fontsource packages; SIL Open Font License 1.1. Their license files accompany the source packages in node_modules after `npm ci`.

Icons, star field, atmosphere shader, crater texture, impact glow and debris are procedural graphics authored for this app. No generated AI planetary imagery is used for scientific surfaces.
