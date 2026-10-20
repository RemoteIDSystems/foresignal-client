# 007 — Completion Report: Record Layers

| Field                 | Value                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------- |
| Status                | Complete                                                                                      |
| Implementation commit | `a6f646dcc9b2fb31a4811baedd8e062ca9d8e5ff`                                                    |
| Rendering decision    | Cesium primitives from decoded `.mvt` (owner's choice, 2026-10-19; planner `7d819ae`)         |
| 2D screenshot         | `review/007-record-layers-2d.png` (live backend, 1672×941, default view)                      |
| 3D screenshot         | `review/007-record-layers-3d.png` (live backend, after switching to 3D)                       |
| Layer off             | `review/007-layer-off-3d.png` (Earthquake unchecked: map empty, legend says no layers are on) |
| Close-up              | `review/007-closeup-2d-3d.png` (western US, 2D and 3D, 3× nearest-neighbor)                   |
| Lines and polygons    | `review/007-synthetic-lines-polygons.png` (**test data**, served by Playwright; see below)    |
| Sources tab           | `review/007-rail-sources.png` (rail grouped by source, filtered to "usgs")                    |
| Inset fix             | `review/007-inset-2d-zoomed.png` (before/after: zoomed 2D map, the Global View box)           |
| Mockups               | `review/007-vs-mockups.png` (Global mock and the Conflict mock's legend placement)            |

## What was built

### Rendering: decoded tiles drawn as batched Cesium primitives

The owner chose this over deck.gl when asked during this prompt. The reasons given then are in the
planner's `7d819ae`, which also rewrote prompts 007, 008 and 010 to match. deck.gl is not a
dependency.

- **`tileMath.ts`.** XYZ tile math at **MapLibre zoom** (512-px tiles), so a style `minzoom` and
  a layer's `aggBelowZoom` mean the same zoom here as in the backend's style.
  - `zoomForResolution` turns the view's ground resolution into that zoom.
  - `planTiles` takes the view rectangle ∩ the TileJSON bounds at `floor(zoom)` clamped to the
    layer's range, and steps the zoom down while more than 48 tiles would be needed. It handles a
    view across the antimeridian.
  - `boundsAround` reads a flat map's corners into a rectangle around its center longitude.
- **`tileTemplate.ts`.** Reads the TileJSON `tiles` template into `getTile`'s path and query.
  **A template carrying `asOf=latest` or `now` is refused**, so only concrete templates are used.
  Its host is ignored: requests go through the API client.
- **`tileSource.ts`.** The two network steps:
  - `loadLayerTiles` reads `getTileJson`: template, `minzoom`/`maxzoom`, `bounds`, and the
    `foresignal:aggBelowZoom` extension.
  - `fetchTile` calls `getTile` as binary with `Accept: application/vnd.mapbox-vector-tile` and
    decodes the result.
  - **Both go through the API client, so 429/503 retry per `Retry-After` is 002's,** tested here
    against msw.
- **`decodeTile.ts`.** `@mapbox/vector-tile` 3.0.0 over `pbf` 5.1.2 (both BSD-3-Clause, credited
  on the About page). Points, lines and polygons (with holes) are decoded to longitude/latitude.
  Points in the tile buffer are dropped, so a record is drawn by one tile only.
- **`featureStyle.ts`.** Resolves each record against the 006 style model:
  - its own source+kind style, else the kind's first style;
  - `minzoom`/`maxzoom` and geometry filters;
  - field-driven colors (severity `match`);
  - icon rotation by field;
  - zoom ramps.
  - A record with no style is drawn as a small gray circle or line, so a new kind shows up.
- **`symbolImages.ts`.** One image per distinct symbol, drawn from the 006 SDF sprite in the
  style's color and halo at the **006 `displaySize`** (`displayScale` applied), or a circle drawn at
  the device pixel ratio.
- **`recordLayers.ts`.** One `RecordLayer` per enabled layer:
  - **Points:** one `BillboardCollection` per layer. Each symbol is one shared texture
    (`setImage` by key). Billboards are `CLAMP_TO_GROUND` and are rotated and map-aligned when
    the style says so.
  - **Lines and outlines:** one `GroundPolylinePrimitive` per tile. **Fills:** one
    `GroundPrimitive` per tile.
  - **Edges are rhumb lines (`ArcType.RHUMB`).** A straight edge in a Mercator tile is a rhumb line,
    which is how MapLibre draws it. The geodesic default bowed long edges by a pixel or more.
  - **No per-feature `Entity` or DOM.**
  - At most 6 tile requests are in flight per layer. A tile the view no longer wants is aborted.
  - A new view's tiles are drawn before the old ones are removed, so a pan does not flash.
  - **Below `aggBelowZoom` the layer draws nothing and reports `aggregated`.** Hexagons are 008.
    The tile zoom is never planned below `aggBelowZoom`, where the backend sends aggregate cells.
- **`recordLayerSet.ts` / `RecordLayersBridge.tsx`.** Hold the enabled layers for one viewer:
  - re-read the view 150 ms after the camera rests, and after a morph completes;
  - rebuild the symbol images when the style changes;
  - report each layer's state and feature count.

### The LAYERS rail

- **`catalog.ts`.** Builds the rail from `listTileLayers` (596 live layers: 190 kinds, 406 sources),
  `listKinds` and the style:
  - **Kind layers** are labeled by the 006 prettifier and counted by `currentCount`. Their icon
    comes from the style of a source that supplies the kind now.
  - **Source layers** are labeled by the backend's `name`. They are counted only when the source is
    the sole source of each of its kinds; otherwise the count cannot be told.
  - Both lists are sorted by count, then label.
- **`LayersRail.tsx`.** Tabs Layers / Entities / Filters (the last two are stubs). On the Layers tab:
  - Kinds/Sources pills and a filter box;
  - "N on" with **Turn all off**;
  - one row per layer: checkbox, icon, label, a mark for **loading / did not load / zoom in to
    see**, and the count;
  - rows with no records now are set back at half opacity.
- **On by default:** every kind layer with records now. Live, that is Earthquake alone.
- **The enabled set lives in `GlobalDashboard` state** for now and moves to the store in 012, as
  the prompt says.

### The legend, scoped and placed

- **Scoped to the enabled layers:** only their kinds, and only the looks of the sources drawn. When
  none of those sources has a style, the legend shows the kind's first look, which is also what the
  map falls back to.
- **The summary reads "1 kind on the map" / "N kinds on the map".** With nothing on, it says to
  turn a layer on.
- **Placement settled against the Conflict mock:** the map's top-left, under the time box, above
  the Global View inset. It is open by default.

### Fixes found while checking in a real browser

1. **Switching to 3D stopped rendering** ("An error occurred while rendering. Rendering has
   stopped. DeveloperError: radians is required").
   - This is in the 005 camera readout, and the pre-007 build does it too.
   - Cause: mid-morph, `Camera.heading` is `undefined` (Cesium's `Camera.js` getter returns nothing
     while `SceneMode.MORPHING`).
   - Fix: the readout skips morphing frames.
2. **The zoomed 2D map was read as the whole world.**
   - Cesium's `computeViewRectangle` tests the 2D camera against a sphere at the origin. Once the
     map is zoomed in away from the origin, it returns `undefined`.
   - The record layers then asked for all 16 z2 tiles instead of the view's tiles.
   - Fix: `visibleRectangle` in `view.ts` reads the 2D view from the picked canvas corners.
   - **The 005 Global View inset used the same call.** It showed a dot instead of a box on a
     zoomed 2D map, and now shows the box (`review/007-inset-2d-zoomed.png`).
3. **A layer could request tiles below its `aggBelowZoom`** when the tile budget stepped the zoom
   down. The plan now never goes below it.

## How it was checked

### Tests

- **New unit tests:**
  - `tileMath` (13), `tileTemplate` (5), `decodeTile` (4), `featureStyle` (7), `catalog` (8);
  - `tileSource` (7, msw through the real client: retry on 429, decode, 404 vs other failures,
    abort);
  - `visibleRectangle` (4);
  - legend scope (model 2, component 1);
  - `LayersRail` (7);
  - an App test that the Global rail lists the backend's layers with records on by default.
- **New Playwright checks** (`npm run e2e`, `playwright.config.ts`, `e2e/record-layers.e2e.ts`).
  They use real Chromium with SwiftShader WebGL, the dev server, and the **live backend**.
  1. **2D:** Earthquake on by default → records drawn and **more than 200 pixels within ±24 of
     `#D9480F` in a real screenshot** → unchecked → drawn count 0 and fewer than a tenth of those
     pixels, legend "No layers on…" → checked → back, legend "1 kind on the map". It also asserts
     **no console errors**.
  2. **3D:** the same.
  3. **Zoom:** Aircraft (live `aggBelowZoom` 7) is turned on. While aggregated it requests nothing.
     Every Zoom in that requests earthquake tiles goes deeper, never back. Past zoom 7, Aircraft
     requests only tiles at z ≥ 7.
- **Each check was shown to fail without its fix:**
  - with the morph guard removed, the 3D check found 0 orange pixels;
  - with the 2D corner reading disabled, the zoom check failed on the step back (z3 → z2).
  - Both fixes were restored and all three pass.

### In a real browser, against the live backend

- **2D default view:** 502–508 earthquakes drawn from four z2 tiles. **3D:** 541–550; the count
  moved as the live feed updated (`currentCount` 540–547 during the session).
- **Icon color** is the USGS style's `#D9480F` ring with its dark halo, rendered independently from
  the sprite sheet for comparison. The 3D close-up shows rings on the terrain and a ring at the limb
  half-hidden by the globe.
- **Zoom steps** (2D, Zoom in ×8), tile zoom requested per step: 2 → 3 → 4 → (kept) → 5 → 6 →
  (kept) → 7 → 8. The view rectangle shrank each step. Aircraft went from `aggregated` to `ready`
  at zoom 7.7.
- **Requests:** no request left the dev server's origin; none to deck.gl or any CDN. No console
  errors in any run after the fixes.
- **Lines and polygons are not in the live data** (only `usgs-earthquakes` and
  `bluesky-jetstream` are enabled). They were checked with **test data**:
  - Playwright added `aviation-hazard` (source `awc-sigmets`) to `/v1/kinds`.
  - It answered that layer's tile requests with tiles built by the test encoder: a red "extreme"
    polygon with a hole, an amber "moderate" polygon crossing the z2 edge at −90°, and a blue
    "minor" line.
  - The TileJSON and the style were the live ones.
  - **Result:** fill, outline, hole and line all draw in 2D and 3D, in the severity colors, and the
    legend shows Aviation Hazard with its severity dots.
  - **The image is labeled TEST DATA.**

### Checks

| Check                                                         | Result                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------- |
| `npm run typecheck`                                           | Pass (now also covers `e2e/` and `playwright.config.ts`)            |
| `npm run lint`                                                | Pass                                                                |
| `npx prettier --check .`                                      | Pass                                                                |
| `npm test`                                                    | 41 files, 250 tests, all pass                                       |
| `npm run e2e`                                                 | 3 tests, all pass (live backend)                                    |
| `npm run build`                                               | Pass                                                                |
| `python3 ~/Documents/GitLab/meshdtn/style/test_us_english.py` | 14 tests, OK                                                        |
| `check_us_english.py`                                         | 793 hits: 777 in the generated API schema, 16 wire names, unchanged |

`check_us_english.py` ran over `src`, `scripts`, `completion-reports`, `README.md`,
`vite.config.ts`, both `public/*/README.md` files, `e2e` and `playwright.config.ts`. The 16 hits
outside the schema are the same as 006's: the `Attribution` license field names (13) and the OSM
data-center kind id (3). None comes from a 007 file.

## Compared to the mockups

`review/007-vs-mockups.png` puts the built 3D view beside the Global mock, and the built legend
beside the Conflict mock's.

**What matches:**

- the left rail: Layers / Entities / Filters tabs, one row per layer with checkbox, icon, label and
  a count badge, and "Add Layer" at the foot;
- records drawn in their category color on the night globe;
- **the legend where the Conflict mock has it:** the map's top-left, above the inset, compact rows
  of icon and label.

**Known differences:**

1. **The mock's rail has about a dozen categories** (Aircraft, Maritime, Weather, Infrastructure…).
   The API has no category for a kind, so the rail lists the 190 kinds (or 406 sources) themselves.
   See owner question 1.
2. **One kind is live, so the map is sparse.** The mock shows every category at once.
3. **The legend keeps its header, filter and severity squares** from 006; the mock's has none.
4. **No hexagons below a layer's aggregation zoom yet.** The rail shows a zoom-in mark until 008.

## Deviations from the prompt text

- **"retina `@2x` with `tileSize: 256`".** Record tiles have no `@2x`. The spec's tile paths are
  `/v1/tiles.json`, `/v1/tiles/{layer}.json` and `/v1/tiles/{layer}/{z}/{x}/{y}.mvt`; `@2x` exists
  only on the raster product tiles. Vector tiles are resolution-independent: the client draws them
  at MapLibre's 512-px zoom, as the backend's style is written.
- **Per-view counts.** The rail shows `listKinds` `currentCount` (the whole layer, not the view).
  Per-view counts come with 008's viewport work.

## Notes for later prompts

- **Decoding is on the main thread.** It is cheap at this data size: four z2 tiles, about 500
  points. Moving it to a worker belongs with 010 (dense layers).
- **The backend clips at tile edges,** so a polygon's outline may show a seam along a tile edge.
  The synthetic check used unclipped features and could not show this; it needs live polygon data.
- **`sizeField` is not interpreted.** Circles sized by data use the default 5 px radius.
- **A kind and one of its sources can both be on;** their shared records are then drawn twice.
  See owner question 3.
- **In the Sources tab, "1 on" with no row checked is correct.** The enabled layer is the
  earthquake kind layer, not the USGS source layer.
- **A test-infrastructure oddity, not 007's.** In this repo's msw 3 setup, a request with no
  handler went to the network (`getaddrinfo ENOTFOUND backend.test`) instead of failing as
  `onUnhandledFrame: 'error'` should. The App tests already did this for the overlay style since 006. The new rail test serves every endpoint it reaches.

## Backend observations

These are for the backend; the client works around none of them.

1. **Earthquake's kind display disagrees with the style.**
   - `listKinds` gives `display.icon: "circle"`, `#E03131`.
   - The style draws `usgs-earthquakes` (the only live source) as the orange `earthquake` icon,
     `#D9480F`. Its other earthquake sources (emsc-seismic, fdsn-geofon, fdsn-ingv) are red
     circles.
   - The client follows the style, using the sources `listKinds` says supply the kind now.
2. **`KindDisplay`'s color field name is the British spelling.** It crosses the wire, so it is
   left as is and reported per the US English rule. The client does not read it.
3. **No category or group for a kind**, needed for the mock's grouped rail (question 1).
4. **The `getTileJson` spec lists no 503,** while `getTile` lists 429 and 503. The client retries
   either way; noted in case the backend can return one.

## Owner questions

1. **Rail grouping.** The Global mock groups layers into about 12 categories; the API has no
   category. Options:
   - (a) the backend adds a category to `KindDisplay`;
   - (b) the client keeps a kind → category table;
   - (c) keep the flat, count-sorted list.
     **Default in place: (c).**
2. **Default layers.** Every kind with records now is on at start. That is one layer today and
   could be dozens once more sources run. Keep this, or start with a fixed set?
   **Default in place: kinds with records.**
3. **Kind and source both on.** Turning on `earthquake` and `usgs-earthquakes` draws USGS records
   twice. Should the rail turn the other off, or allow it?
   **Default in place: allowed.**

Earlier questions still open, with defaults in place:

- 004: the Alerts tab, the tagline and the user menu.
- 003: `security.openReads` missing from the live system response, and tile keys needing the agent
  scope.
- 002: `listObjectAnnotations` paging, and Retry-After as an HTTP date.
