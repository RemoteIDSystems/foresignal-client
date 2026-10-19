# 005 — Completion Report: Cesium Viewer

| Field                 | Value                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------- |
| Status                | Complete — fourth pass: self-hosted 3D terrain, per the owner's change of 2026-10-19        |
| Implementation commit | `b818ce2ef9873cd68eb25bed47156343fbb01adc`                                                  |
| Earlier commits       | `df7acf0` (first viewer), `5a800db` (2D by default), `e114627` (day/night basemap, credits) |
| Screenshot            | `review/005-cesium-viewer.png` (1672×941, production build, 2D, pointer over Denver)        |
| 2D and 3D             | `review/005-cesium-viewer-2d-3d.png` (the same place in each mode)                          |
| 3D terrain            | `review/005-terrain-3d.png` (Southern Alps, New Zealand, ELEV under the pointer)            |
| Terrain on and off    | `review/005-terrain-compare.png` (the same camera with the terrain and on the flat globe)   |
| About page            | `review/005-about.png`                                                                      |

## History of this prompt

1. **`df7acf0`: the first viewer.** It had a 2D / 3D / Split toggle, opened in 3D and used a
   Natural Earth II basemap.
2. **`5a800db`: the first rework.**
   - The map opens in 2D, and the toggle is 2D / 3D only.
   - Switching modes keeps the user's place.
3. **`e114627`: the day/night basemap.**
   - NASA Blue Marble by day and Black Marble by night.
   - The readout follows the pointer.
   - The Cesium logo moved to an About and credits page.
4. **`b818ce2`: this pass.** It applies the owner's change and the planner's `249c650` (prompt 005
   and Architecture §5):
   - **3D terrain.** Self-hosted quantized-mesh terrain from a public-domain DEM. It gives raised
     relief in 3D and feeds ELEV, and 2D stays flat.
   - **Basemap month.** It stays September, confirmed by the owner. No change.
   - **About wording.** Confirmed by the owner. No change, beyond adding the terrain's credit.

## What was built in this pass

### Terrain tiles: `public/terrain/` and `scripts/build-terrain.mjs`

- **Source:** NOAA ETOPO 2022, 60 arc-second, ice surface elevation.
  - GeoTIFF, 21600 × 10800 cells, 465,969,062 B, SHA-256 `9d27d4b8…4875a7fd08e`.
  - The file's GeoTIFF keys say "WGS 84 + EGM2008 height", so heights are above the geoid (sea
    level).
  - The data.gov record gives its license as CC0 1.0.
  - `public/terrain/README.md` has the full URL, checksum, citation (DOI 10.25921/fd45-gt74) and the
    license link.
- **Format:**
  - Cesium quantized-mesh-1.0 with a `layer.json`, in the geographic tiling scheme.
  - The tiles are served from the client's own origin: no Cesium Ion, no account, no tile service.
- **Size and resolution:**
  - Levels 0–6: 10,922 tiles, 36,810,618 B.
  - Level 6 tiles are 2.8125° wide and sample about every 4.9 km at the equator.
  - In `dist`, terrain is 36.8 MB of 64.6 MB. The basemap is 14.1 MB, Cesium 13.1 MB and the app
    0.6 MB.
- **Accuracy** of level 6 against the source, measured with Cesium's own `interpolateHeight` at
  20,000 random points of each kind:

  | Points | Median | 90th percentile | 99th percentile |
  | ------ | ------ | --------------- | --------------- |
  | Land   | 26 m   | 139 m           | 319 m           |
  | Ocean  | 45 m   | 159 m           | 302 m           |

- **Why this size.** Before choosing, I measured larger builds of the same source:
  - Level 6 with a 150 m budget: 87 MB. It brought the land 90th percentile from 139 m to 101 m.
  - Level 7: 84.9 MB. It brought it to 125 m.
  - Either one costs more than twice the download for that gain, so level 6 at 300 m is the version
    shipped.
- **How a tile is made:**
  - Each tile samples a 65 × 65 grid and is simplified with `@mapbox/martini`, keeping vertical error
    within a budget for its level.
  - The simplification measures heights above the tile's tangent plane, so large flat tiles keep
    enough triangles to stay round.
  - The header's bounding sphere and horizon point are computed with Cesium's own math.
  - `scripts/terrain/` holds the encoder and mesh builder.
- **Deterministic rebuild.** Two builds gave the same output checksum,
  `f788f0d3…f20e5f8d2`. The README has the exact command. A rebuild replaces the tiles and keeps the
  README.
- **New dev dependencies:** `geotiff` 3.0.5 (MIT) and `@mapbox/martini` 0.2.0 (ISC). They are used
  only by the build script, so neither ships to the browser.

### In the app: `src/map/terrain.ts` and `Viewer.tsx`

- **3D:** the viewer loads the terrain, so the globe is raised and the basemap drapes over it.
- **2D:** Cesium draws the same terrain flat.
- **ELEV:**
  - It reads the terrain height under the pointer from the most detailed level (`TerrainSampler`,
    which caches 64 tiles), in both modes.
  - It shows `—` when the pointer is off the map, and also until the tile under the pointer loads.
    The tooltip says which.
  - It reads the terrain data, not the rendered globe. The rendered globe gave wrong heights in 2D.
- **LAT and LON in 3D:** these come from where the view ray meets the terrain, so over a mountain
  the readout names the point the user sees. Before, it named the point on the ellipsoid behind it.
- **About:** "Imagery and terrain" now credits ETOPO 2022 to NOAA NCEI, with its source page.

### Two rendering faults found and fixed in the browser

Both faults passed every unit test and showed only in a real browser.

1. **Night lights over the whole globe.**
   - **Symptom:** with terrain loaded, Hawaii at midday showed city lights, and New Zealand rendered
     white.
   - **Cause:**
     - When terrain has vertex normals, Cesium switches the globe from day/night shading to
       per-vertex lighting (`@cesium/engine` `Scene/GlobeSurfaceShaderSet.js:327`).
     - The day/night layer blend exists only under day/night shading (`Shaders/GlobeFS.glsl:213`).
     - So Black Marble was drawn at full strength everywhere.
   - **Fix:** the tiles carry no normals.
     - Slopes still read from the raised geometry and from the shaded relief in the Blue Marble
       imagery.
     - A test fails if `layer.json` ever declares normals again.
2. **Nothing drawn from a low camera.**
   - **Symptom:** at 70 km over New Zealand, Cesium drew zero tiles. I read
     `globe._surface._tilesToRender` in the page to confirm this.
   - **Cause:**
     - The two level-0 tiles each span a hemisphere, too wide for Cesium to compute a horizon culling
       point.
     - My fallback point used the direction of the tile's bounding-sphere center. For a hemisphere,
       that center is about 3 km from the middle of the Earth, so its direction means nothing.
     - From that camera, both root tiles tested as behind the Earth, so the whole globe was culled.
   - **Fix:** the point now lies far out along the tile rectangle's center.
     - A point there is above a camera's horizon exactly when the camera can see within 90° of the
       tile's center, which is the tile's edge.
     - New tests check it with Cesium's `EllipsoidalOccluder`: the tile stays in view from 70 km at
       30 places over it and past its edge, and is culled from the far side.
     - Both tests fail on the old code. I checked by putting it back.

## Verification

- **Checks.** `npm run typecheck`, `npm run lint`, `npx prettier --check .` and `npm run build`
  pass.
  - `public/terrain/layer.json` is in `.prettierignore`. It is build output, and reformatting it would
    change the recorded checksum.
- **Tests.** `npx vitest run` passes: 27 files, 135 tests. New in this pass:
  - **`scripts/terrain/terrain.test.mjs`** (13 tests):
    - zig-zag and high-water-mark encoding
    - tile layout and Cesium's geometric error
    - a synthetic cone world that round-trips through the decoder
    - the peak, the triangle winding, the edge lists and the bounding sphere
    - hemisphere horizon culling, from both sides
  - **`src/map/terrain.test.ts`:**
    - the terrain URL under the base path
    - `layer.json` is quantized-mesh in TMS and declares no normals
    - every declared tile exists on disk, and no deeper level does
  - **`src/map/TerrainSampler.test.ts`:**
    - it loads one tile and then answers from it
    - it retries when Cesium throttles a request
    - it evicts the least recently used tile
    - it gives no height from a tile that failed
  - **`MapHud.test.tsx`:** the elevation under the pointer, below sea level, and the dash while the
    tile loads.
  - **`App.test.tsx`:** the About page lists ETOPO 2022.
- **In a real browser.**
  - **Setup:** Playwright and headless Chromium (SwiftShader WebGL), against `vite preview` of the
    production build, at 1672×941, finishing 2026-10-19 22:59 UTC.
  - **Camera placement:** the app has no place search yet, so the script placed the 3D cameras by
    reaching Cesium's viewer through React's fiber tree. The pointer moves are real mouse moves.

  | Step                                    | Mode | LAT       | LON        | ELEV     | Source DEM at that point |
  | --------------------------------------- | ---- | --------- | ---------- | -------- | ------------------------ |
  | Pointer over Denver                     | 2D   | 39.7493°  | -105.0415° | 1,701 m  | 1,629 m                  |
  | Pointer moved off the map, switch to 3D | 3D   | 27.7802°  | -80.0000°  | —        | (off the map)            |
  | Southern Alps, pointer on a ridge       | 3D   | -44.1990° | 169.6677°  | 1,345 m  | 1,382 m                  |
  | Hawaii, Mauna Kea's flank               | 3D   | 19.3404°  | -155.4046° | 1,021 m  | 884 m                    |
  | Tonga, the seafloor                     | 3D   | -19.7489° | -172.1752° | -5,697 m | -5,678 m                 |
  - **Errors:** all four differences are inside the measured spread. Hawaii's 137 m is near the 90th
    percentile, on a steep flank.
  - **Relief:** in `review/005-terrain-compare.png`, the same camera, with the terrain off, shows the
    imagery painted on a smooth globe. With it on, the ridges stand up, block the valleys behind them
    and break the skyline.
  - **Requests:** 41 terrain requests (`layer.json` and tiles), all `200`. None left the client's
    origin.
  - **Console:** the final run logged no page errors and no console errors or warnings.
    - Earlier runs in this pass logged Chromium's "GPU stall due to ReadPixels" performance warning
      under SwiftShader. It did not recur in the final run.
  - **About page:** the Cesium logo loads at 118×30 px.
  - I viewed all five review images before committing.

- **US English.**
  - `python3 ~/Documents/GitLab/meshdtn/style/test_us_english.py` passes: 14 tests, OK.
  - `check_us_english.py` over a copy of `src`, `scripts`, `completion-reports`, `README.md`,
    `vite.config.ts` and both `public/*/README.md` files finds only the 777 hits in the generated API
    schema. Those cross the wire and are left as they are.

## Compared to the mockup

`design/Foresignal Global Intelligence Dashboard.png` against `review/005-cesium-viewer.png`.

**What matches:**

- the lit day side and night lights
- no logo on the map
- the toggle, compass, zoom and home at top right
- the time box at top left
- the GLOBAL VIEW inset
- the readout and scale bar

ELEV now shows a real height where the mockup shows a value.

**Known differences:**

1. **2D, not a globe.** The map opens in 2D, as decided.
2. **Clouds and radar.** These are backend rasters (009), not the basemap.
3. **The night side follows the real clock.** Where it falls depends on when you look.
4. **Overlays and tool buttons.** These come in later prompts.

## Owner questions

1. **Vertical exaggeration.**
   - The relief is at true scale. From 14 km up, the Southern Alps rise clearly, but at globe scale
     even the Himalaya are a small fraction of a percent of the Earth's radius, so the globe looks
     smooth.
   - Cesium can exaggerate heights (`scene.verticalExaggeration`, `@cesium/engine`
     `Scene/Scene.js:402`, default 1).
   - Do you want an exaggeration, for example 2× or 3×? The ELEV readout would still show true
     heights.
2. **Slope shading.**
   - Because of the day/night constraint above, the terrain has no sun shading of its own. Slopes
     show through the geometry and the Blue Marble imagery's own shaded relief.
   - Real sun-angle shading would mean replacing Cesium's day/night layer blend with our own. Is the
     current look enough?
3. **Download size.**
   - 36.8 MB of terrain is the largest part of the bundle, but tiles load only where the user looks.
     The final run made 41 terrain requests, `layer.json` included.
   - If you want a sharper close view, level 7 is 84.9 MB. Keep level 6?

Earlier questions still open, with defaults in place:

- 004: the Alerts tab, the tagline and the user menu.
- 003: `security.openReads` missing from the live system response, and tile keys needing the
  agent scope.
- 002: `listObjectAnnotations` paging, and Retry-After as an HTTP date.
