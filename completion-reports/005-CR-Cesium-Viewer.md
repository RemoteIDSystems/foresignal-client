# 005 — Completion Report: Cesium Viewer

| Field                 | Value                                                                    |
| --------------------- | ------------------------------------------------------------------------ |
| Status                | Complete — third pass, applying the owner's decisions of 2026-10-19      |
| Implementation commit | `e1146271f6f223b50f6a32192816912784fded63`                               |
| Earlier commits       | `df7acf0` (first viewer), `5a800db` (2D by default, no Split)            |
| Screenshot            | `review/005-cesium-viewer.png` (1672×941, production build, opens in 2D) |
| 2D and 3D             | `review/005-cesium-viewer-2d-3d.png` (the same place in each mode)       |
| About page            | `review/005-about.png`                                                   |

## History of this prompt

1. **`df7acf0`: the first viewer.**
   - It had a 2D / 3D / Split toggle, opened in 3D and used a Natural Earth II base map.
2. **`5a800db`: the first rework.**
   - The map opens in 2D, the toggle is 2D / 3D only, and switching keeps the user's place.
   - It followed the planner's `33cf4ff`.
3. **`e114627`: this pass.** It applies the owner's answers to the 005 questions and the
   planner's `c336639` (the basemap decision):
   - **Toggle:** the manual 2D / 3D toggle stays. It is how the user returns to 2D after a
     contextual jump to 3D (014).
   - **Basemap:** NASA Blue Marble by day and Black Marble night lights, blended by the day/night
     lighting.
   - **Cesium logo:** moved off the map to an About and credits page.
   - **Readout:** follows the mouse pointer and shows ground lat/lon plus terrain elevation.
   - **Map plugin:** `vite-plugin-cesium` is kept.

## What was built in this pass

### Day/night basemap: `src/map/imagery.ts` and `public/basemap/`

- **Day:** NASA Blue Marble: Next Generation, topography and bathymetry, September 2004.
  - It was cut from the 21600×10800 JPEG.
  - I picked September to match the mockup's 2025-09-18 timestamp.
- **Night:** NASA Black Marble 2016 color night lights, cut from the 13500×6750 (3 km) JPEG.
- **Downloads:** both came from the NASA download pages listed in `public/basemap/README.md`.
  That README also records the exact URLs, byte sizes and SHA-256 checksums. The source JPEGs are
  not in the repository.
- **Tiles:**
  - Each product is a pyramid in Cesium's geographic tiling scheme: levels 0–5, 256 px WebP at
    quality 80, 2,730 tiles each.
  - Level 5 covers the world at 16384×8192 px, about 2.4 km per pixel at the equator.
  - The bytes are 10,012,466 for Blue Marble and 4,035,726 for Black Marble, measured with
    `du -sb --apparent-size`.
  - I measured the alternatives before choosing: Blue Marble as JPEG at quality 85 would be
    19,271,057 B, and Black Marble stopping at level 4 would be 1,220,228 B.
  - `scripts/tile-basemap.py` (Pillow) rebuilds the tiles deterministically. The README has the
    commands.
- **Serving:** Vite copies `public/` into `dist/`, so the tiles are served from the client's own
  origin. `dist/basemap` measured 14,051,105 B.
- **Layers:**
  - Blue Marble is the base. Black Marble sits over it with `dayAlpha: 0` and `nightAlpha: 1`.
  - `globe.enableLighting` is on, so Cesium blends the two across the terminator.
  - The clock runs in real time (`shouldAnimate`), so the terminator moves. The 013 time machine
    takes the clock over.
- **Night brightness:**
  - With day/night shading on, Cesium lights the night side at 0.3. The floor is in
    `@cesium/engine` `Source/Shaders/GlobeFS.glsl:435`.
  - That made the city lights barely visible in my first capture.
  - The night layer's brightness is `1 / 0.3`, so the lights show at the brightness NASA
    published.
- **Inset:** the GLOBAL VIEW inset now uses the two level-0 Blue Marble tiles.

### Pointer readout: `src/map/Viewer.tsx` and `MapHud.tsx`

- **What it shows:**
  - LAT and LON are the ground point under the mouse pointer.
  - When the pointer is off the map, or over space in 3D, the readout shows the ground point at
    the view center.
  - The readout element's `data-source` says which (`pointer` or `center`).
- **ELEV:**
  - ELEV is ground elevation from the globe's terrain, in whole meters (`0 m`, `8,849 m`).
  - The map has no terrain source, so Cesium's globe is the plain ellipsoid. Every point would
    read `0 m`, including mountains, and that is not a measurement.
  - So until there is a terrain source, ELEV shows `—`, with the tooltip "No terrain elevation
    source is loaded". See question 1.
- **Unchanged:** the 2D/3D switch still keeps the view center and camera height, as before. Only
  the readout changed.

### About and credits: `src/app/AboutView.tsx` and `credits.ts`

- **Off the map:** Cesium's credits now render into a detached element (`creditContainer`), so
  nothing is drawn over the map.
- **`/about`:** linked from Settings ("About and credits"). It shows:
  - the client version
  - the Cesium logo (served from `/cesium/Assets/Images/cesium_credit.png`), with the CesiumJS
    version and its Apache License 2.0
  - both NASA imagery products with their source pages
  - every runtime package with its pinned version and license
- **Source of the list:** the versions come from `package.json` at build time
  (`__APP_DEPENDENCIES__`). A test checks that the list matches `package.json` and each package's
  own declared license.

## Verification

- **Checks.** `npm run typecheck`, `npm run lint`, `npx prettier --check .` and `npm run build`
  pass.
- **Tests.** `npm test` passes: 24 files, 113 tests. New or changed in this pass:
  - **`imagery.test.ts`:**
    - the tile URL templates under the base URL, and the inset tiles
    - Blue Marble is shown by day and night, Black Marble only at night
    - the night brightness × 0.3 = 1
    - every tile of both pyramids exists on disk for levels 0–5, and no level 6 exists
  - **`readout.test.ts`:** elevation formatting, including below sea level and no "-0 m".
  - **`MapHud.test.tsx`:**
    - the readout shows the ground point and elevation, not the camera
    - `data-source` is set
    - a dash with the tooltip shows when there is no terrain
  - **`view.test.ts`:** the scene setup turns on globe lighting.
  - **`credits.test.ts`:**
    - every runtime dependency is credited and nothing else is
    - each license matches `node_modules/<package>/package.json`
    - the build-time versions equal `package.json`
  - **`App.test.tsx`:** Settings → "About and credits" opens the page. It shows the Cesium logo,
    both NASA products and the `cesium 1.146.0 Apache-2.0` row.
- **In a real browser.** Playwright and headless Chromium (SwiftShader WebGL) ran against
  `vite preview` of the production build, at 1672×941, at 2026-10-19 21:49 UTC.

  | Step                                       | Mode | Source  | LAT      | LON        | ELEV |
  | ------------------------------------------ | ---- | ------- | -------- | ---------- | ---- |
  | Load, no pointer                           | 2D   | center  | 28.0000° | -80.0000°  | —    |
  | Pointer at canvas center                   | 2D   | pointer | 28.0000° | -80.0000°  | —    |
  | Pointer 200 px left, 100 px up             | 2D   | pointer | 39.8680° | -103.7360° | —    |
  | Pointer moved off the map                  | 2D   | center  | 28.0000° | -80.0000°  | —    |
  | Click 3D Globe                             | 3D   | center  | 27.7804° | -80.0000°  | —    |
  | Pointer over space at the canvas left edge | 3D   | center  | 27.7804° | -80.0000°  | —    |
  - **Pointer:** 200 px left and 100 px up moved the readout by −23.736° and +11.868°, which is
    0.1187° per pixel on both axes, as an equirectangular 2D map should.
  - **Basemap:** in both modes the Americas are in daylight and the night side shows Black Marble
    lights: the US East Coast, the Gulf coast and the Caribbean islands. 21:49 UTC is 17:49 EDT, close
    to sunset on the East Coast. The lights begin before sunset because Cesium starts the night
    blend while the sun is still low (`GlobeFS.glsl:344`).
  - **Captures:** I checked that the map region of the full-page capture is pixel-identical to the
    canvas capture (mean absolute difference 0.0 on all three channels).
  - **Credits:** no Cesium credit element is inside the map (`.cesium-widget-credits` count 0).
  - **About page:** the Cesium logo loads at 118×30 px.
  - **Requests:** none left the client's origin. Basemap tiles came from `/basemap/blue-marble`
    and `/basemap/black-marble`.
  - There were no page or console errors or warnings.
  - I viewed all three review images before committing.

- **US English** (`check_us_english.py`):
  - I ran it over a copy of `src`, `completion-reports`, `scripts`, `README.md`, `vite.config.ts`
    and `public/basemap/README.md`.
  - The only hits are the 777 in the generated schema, which are left as they are.

## Compared to the mockup

`design/Foresignal Global Intelligence Dashboard.png` against `review/005-cesium-viewer.png`.

**What now matches:**

- the night-lights Earth with a lit day side
- no logo on the map
- the toggle, compass, zoom and home at top right
- the time box at top left
- the GLOBAL VIEW inset at bottom left
- the readout and scale bar at bottom right

**Known differences:**

1. **2D, not a globe.** The map opens in 2D, as decided. The mockup draws a 3D globe.
2. **Clouds and radar.** The mockup has clouds and weather radar. Those are backend rasters (009),
   not the basemap.
3. **ELEV.** The mockup reads `ELEV 0 m`; the build reads `—` until there is a terrain source.
   See question 1.
4. **Night-side placement.** The mockup's lights are over North America at night; the build's
   follow the real clock, so where the night side falls depends on when you look.
5. **Overlays and tool buttons.** Aircraft, ships, satellites, events, the storm and the five
   extra tool buttons come in later prompts.

## Owner questions

1. **Terrain elevation needs a source.**
   - The backend has no elevation operation. I searched every path, summary and operation in
     `openapi/OpenAPI.json` for `elevation`, `terrain`, `dem` and `height`. The only match was
     `createSituationAssessment`, which is not about elevation.
   - The client has no terrain either, so ELEV shows `—` rather than a false `0 m`.
   - Options:
     - **(a)** Bundle a public-domain elevation grid (for example NOAA's ETOPO), downsampled and
       self-hosted like the basemap, and use it only for the readout.
     - **(b)** Self-host quantized-mesh terrain, which also gives 3D relief. It is much larger.
     - **(c)** A backend elevation endpoint.

   Which do you want, and in which prompt?

2. **Blue Marble month.** I used September 2004, to match the mockup's date. NASA publishes one
   per month. Should the basemap follow the time machine's month in 013, or stay fixed?
3. **Credit wording.** The NASA download pages state no credit line (I checked both), so the
   About page names each product, "NASA Earth Observatory", and the source page. Is that the
   wording you want?

Earlier questions still open, with defaults in place:

- 004: the Alerts tab, the tagline and the user menu.
- 003: `security.openReads` missing from the live system response, and tile keys needing the
  agent scope.
- 002: `listObjectAnnotations` paging, and Retry-After as an HTTP date.
