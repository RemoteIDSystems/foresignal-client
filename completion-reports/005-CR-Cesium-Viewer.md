# 005 — Completion Report: Cesium Viewer

| Field                 | Value                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------- |
| Status                | Complete — fifth pass: 2× vertical exaggeration, per the owner's tweak of 2026-10-19          |
| Implementation commit | `ad2eb0c0567f69479b8ed3f522b10ca7e4292da3`                                                    |
| Earlier commits       | `df7acf0` (first viewer), `5a800db` (2D by default), `e114627` (basemap), `b818ce2` (terrain) |
| Screenshot            | `review/005-cesium-viewer.png` (1672×941, production build, 2D, pointer over Denver)          |
| 2D and 3D             | `review/005-cesium-viewer-2d-3d.png` (the same place in each mode)                            |
| 3D terrain            | `review/005-terrain-3d.png` (Southern Alps at 2×, ELEV under the pointer)                     |
| 2× and 1×, close      | `review/005-terrain-compare.png` (the same camera at 14 km, at 2× and at true scale)          |
| 2× and 1×, regional   | `review/005-terrain-regional-compare.png` (South Island from 250 km, at 2× and at 1×)         |
| About page            | `review/005-about.png` (unchanged since `b818ce2`)                                            |

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
4. **`b818ce2`: self-hosted 3D terrain** (planner `249c650`). ETOPO 2022 as quantized-mesh, levels
   0–6. It raises the globe in 3D and feeds ELEV.
5. **`ad2eb0c`: this pass** (planner `23e2e07`). It applies the owner's answers to the terrain
   questions:
   - **Vertical exaggeration:** set to 2×.
   - **Terrain level:** stays at 6, confirmed. No change.
   - **Vertex normals:** none, confirmed. The test that fails if they return is kept.
   - **Slope shading:** none needed, confirmed. No change.

## What was built in this pass

- **The setting:** `src/map/view.ts` exports `VERTICAL_EXAGGERATION = 2`, and `styleScene` sets
  Cesium's `scene.verticalExaggeration` to it. Cesium then draws terrain at twice its height in 3D.
  2D stays flat.
- **ELEV still shows true heights.** `TerrainSampler` reads the terrain data itself, not the drawn
  globe, so the exaggeration never reaches the readout. The browser run below checks this against
  the source.
- **LAT and LON in 3D** still come from where the view ray meets the drawn terrain, so they name the
  point the user sees on the raised surface.
- **Test:** `view.test.ts` checks that `styleScene` sets the exaggeration to 2.

## The terrain, from `b818ce2`

### Tiles: `public/terrain/` and `scripts/build-terrain.mjs`

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
  - In `dist`, terrain is 36.8 MB of 64.6 MB.
- **Accuracy** of level 6 against the source, measured with Cesium's own `interpolateHeight` at
  20,000 random points of each kind:

  | Points | Median | 90th percentile | 99th percentile |
  | ------ | ------ | --------------- | --------------- |
  | Land   | 26 m   | 139 m           | 319 m           |
  | Ocean  | 45 m   | 159 m           | 302 m           |

- **Deterministic rebuild.** Two builds gave the same output checksum, `f788f0d3…f20e5f8d2`. The
  README has the exact command.
- **Build tools:** `geotiff` 3.0.5 (MIT) and `@mapbox/martini` 0.2.0 (ISC). These are dev
  dependencies, used only by the build script.

### Two rendering faults found and fixed in the browser

1. **Night lights over the whole globe.**
   - **Cause:** terrain with vertex normals makes Cesium switch from day/night shading to per-vertex
     lighting (`@cesium/engine` `Scene/GlobeSurfaceShaderSet.js:327`). The night layer's blend exists
     only under day/night shading (`Shaders/GlobeFS.glsl:213`).
   - **Fix:** the tiles carry no normals. A test fails if `layer.json` declares them again.
2. **Nothing drawn from a low camera.**
   - **Cause:** the hemisphere-wide level-0 tiles took their horizon culling point from the
     bounding-sphere center. That center is near the middle of the Earth, so from 70 km over New
     Zealand both tiles were culled, and nothing was drawn.
   - **Fix:** the point now lies along the tile rectangle's center. Tests check it with Cesium's
     `EllipsoidalOccluder`, and they fail on the old code.

## Verification

- **Checks.** `npm run typecheck`, `npm run lint`, `npx prettier --check .` and `npm run build`
  pass.
- **Tests.** `npx vitest run` passes: 27 files, 135 tests.
  - The normals guard (`src/map/terrain.test.ts`, "declares quantized-mesh in the geographic TMS
    scheme, without vertex normals") is still in place and passing.
- **In a real browser.**
  - **Setup:** Playwright and headless Chromium (SwiftShader WebGL), against `vite preview` of the
    production build, at 1672×941, about 2026-10-19 23:20 UTC.
  - **Camera placement:** the app has no place search yet, so the script placed the 3D cameras by
    reaching Cesium's viewer through React's fiber tree. The pointer moves are real mouse moves.
  - **The 1× comparisons:** the script set `scene.verticalExaggeration = 1` for those captures only.

  | Step                              | Mode    | LAT       | LON        | ELEV    | Source DEM | 2 × DEM |
  | --------------------------------- | ------- | --------- | ---------- | ------- | ---------- | ------- |
  | Pointer over Denver               | 2D      | 39.7493°  | -104.8041° | 1,715 m | 1,647 m    | 3,294 m |
  | Southern Alps, pointer on a ridge | 3D (2×) | -44.2308° | 169.6310°  | 1,162 m | 1,089 m    | 2,177 m |
  | South Island, Canterbury coast    | 3D (2×) | -44.2041° | 172.7068°  | -76 m   | -75 m      | -150 m  |
  - **ELEV is true height.** Every reading sits within the measured error of the source DEM, not of
    twice it.
  - **Earlier rows, from the `b818ce2` run.** Hawaii (1,021 m against 884 m) and Tonga (-5,697 m
    against -5,678 m) also read true heights. They come from the same sampler, which the exaggeration
    does not touch.
  - **Pointer off the map:** ELEV shows `—`, as in the 1× halves of both comparison images.
  - **Close view, 14 km** (`review/005-terrain-compare.png`): at 2× the ridges stand up as distinct
    peaks and the skyline is jagged. At 1× the same camera sees a low, rounded range.
  - **Regional view, 250 km** (`review/005-terrain-regional-compare.png`): at 2× the Southern Alps
    and the offshore canyons are a little sharper. At this distance the difference is small.
  - **Requests:** none left the client's origin.
  - **Console:** the run logged no page errors and no console errors or warnings.
  - I viewed every review image before committing.

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
- the readout and scale bar, with ELEV showing a real height

**Known differences:**

1. **2D, not a globe.** The map opens in 2D, as decided.
2. **Clouds and radar.** These are backend rasters (009), not the basemap.
3. **The night side follows the real clock.** Where it falls depends on when you look.
4. **Overlays and tool buttons.** These come in later prompts.

## Owner questions

1. **Is 2× enough at a distance?**
   - Up close, 2× is a clear change. From 250 km it adds only a little (see the regional
     comparison).
   - At whole-globe distance any exaggeration of a few times stays small: the Himalaya at 2× are
     about 0.3% of the Earth's radius.
   - If you want relief to read from farther out, 3× is a one-line change to `VERTICAL_EXAGGERATION`.
     Keep 2×?

Earlier questions still open, with defaults in place:

- 004: the Alerts tab, the tagline and the user menu.
- 003: `security.openReads` missing from the live system response, and tile keys needing the
  agent scope.
- 002: `listObjectAnnotations` paging, and Retry-After as an HTTP date.
