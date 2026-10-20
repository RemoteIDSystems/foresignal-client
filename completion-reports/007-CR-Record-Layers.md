# 007 — Completion Report: Record Layers

| Field                 | Value                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Status                | Complete; rail restructured on approval                                                      |
| Implementation commit | `a6f646dcc9b2fb31a4811baedd8e062ca9d8e5ff` (record layers)                                   |
| Rail restructure      | `4d21f1e3c64cc929c32ed1c2a2310ccdb76a9432` (rail by category, sources as filter, defaults)   |
| Rendering decision    | Cesium primitives from decoded `.mvt` (owner's choice, 2026-10-19; planner `7d819ae`)        |
| Rail vs the mock      | `review/007-rail-vs-mock.png` (Global mock rail beside the built rail in three states)       |
| Default view          | `review/007-global-defaults-2d.png` (live backend, 1672×941, curated defaults)               |
| Source filter         | `review/007-source-filter-2d.png` (Earthquake on, then its source hidden in FILTERS)         |
| 2D / 3D               | `review/007-record-layers-2d.png`, `review/007-record-layers-3d.png` (first pass, flat rail) |
| Layer off             | `review/007-layer-off-3d.png` (first pass, flat rail)                                        |
| Close-up              | `review/007-closeup-2d-3d.png` (western US, 2D and 3D, 3× nearest-neighbor)                  |
| Lines and polygons    | `review/007-synthetic-lines-polygons.png` (**test data**, served by Playwright; see below)   |
| Inset fix             | `review/007-inset-2d-zoomed.png` (before/after: zoomed 2D map, the Global View box)          |
| Mockups               | `review/007-vs-mockups.png` (first pass: Global mock and the Conflict mock's legend)         |

`review/007-rail-sources.png` (the first pass's Sources pill) was removed: that tab no longer exists.

## This pass: the rail restructure

The owner approved 007 and asked for one change before 008: make the LAYERS rail match the Global
mock. The planner updated prompt 007 to match (pulled before starting). This answers first-pass
questions 1, 2 and 3 together.

### Kinds grouped into the mock's categories

- **`src/lib/kindCategories.ts`** is the client's category table. It is presentation only: the
  backend has no category for a kind.
  - The categories are the mock's, in its order and with its labels: Events, Aircraft (ADS-B),
    Maritime (AIS), Satellite Orbits, Weather, Imagery (Recent), RF / Spectrum, Infrastructure,
    Cyber / Network, Energy / Power, Disasters / Hazards, Conflicts / Security. **Other** comes last.
  - **All 190 live kinds are named.** `src/lib/fixtures/live-kinds.json` holds the live kind ids.
    A test checks that every one of them is in the table, apart from the three that are meant to
    be in Other.
  - Kinds per category: Events 21, Aircraft 16, Maritime 21, Satellites 9, Weather 40, Imagery 3,
    RF 11, Infrastructure 12, Cyber 13, Energy 10, Hazards 25, Conflicts 6.
  - **Other** holds bird-sighting, nature-observation and park-boundary, which fit no category in
    the mock. A kind the backend adds later also lands in Other until the table names it.
  - **Where a kind could go in two categories, it goes with the feed that produces it:**
    - `deception` is the position-integrity check, so RF.
    - `loiter`, `cpa` and `rendezvous` are derived from vessel tracks, so Maritime.
    - Space weather is under Weather.
- **The mock's "Global Overview" row is not a kind category.** It reads as the view itself, not a
  group of records, so it is not in the table.
- **Each category row** has:
  - a checkbox that turns all its kinds on or off. It shows **indeterminate** when only some are
    on.
  - the category's icon (lucide), its label, and the sum of its kinds' counts;
  - a chevron that opens the category to its kinds.
- **Kind rows under an open category** are the first pass's rows: checkbox, style icon, label,
  status mark, count. They are sorted by count, then label.
- **The filter box** matches kind labels and opens every category with a match.

### Sources are a filter, not toggles

- **The Kinds/Sources pills are gone.** Source layers are no longer drawn, so a record can no longer
  be drawn twice by a kind and its source together.
- **The FILTERS tab lists the sources of the enabled kinds.** It takes them from `listKinds` and
  from the overlay style. Sources supplying records now come first, then by count and name.
  - Unchecking a source hides its records within the enabled kinds.
  - The tab shows "All N shown" or "M of N shown", and **Show all** brings every source back.
  - It has its own filter box.
  - **With the defaults on it lists 167 sources.** Most have no records now. They are listed
    because the style links them to an enabled kind.
- **Hidden sources are filtered on the client from the tiles already decoded**
  (`recordFilter.ts`, `RecordLayer.setHiddenSources`).
  - Drawn tiles are redrawn from the records they keep. Nothing is fetched again.
  - A record that names no source is always kept.
- **The legend follows the filter.** A kind whose every source is hidden is not in the legend.

### Dedup by record id, as a safety

- `RecordClaims` keys a record by its `source` and `externalId`. A point that two tiles both carry
  is drawn by the first tile only. When that tile is removed, another may take the point.
- **This covers points only.** The backend clips lines and polygons at tile edges, so one record
  arrives as several pieces that together make up the shape. Claiming by id would drop pieces.

### Default-on is the mock's checked set

- **On at start:** the kinds of the three categories the mock shows checked: Events, Weather and
  Infrastructure. **That is 73 kinds.** The rail reads "73 on".
- **Today none of those 73 kinds has records, so the live map opens empty.** The only live kind is
  Earthquake, under Disasters / Hazards, which the mock shows unchecked. The legend says "The
  layers that are on have no records right now." See owner question 1.
- **Only enabled kinds with records are drawn.** A kind with none would only fetch empty tiles:
  with these defaults, about 70 layers of world tiles on every view change.
  - The rail refreshes `listKinds` counts every 60 seconds (`KINDS_REFRESH_MS`).
  - A default kind that starts getting records is drawn within a minute, with no reload.

### Two fixes found in the screenshots

1. **"Disasters / Hazards" was cut to "Disasters / Haza…"** when its count was three digits wide.
   The mock shows it whole. The category row's gaps, icon width and chevron are slightly narrower
   now. In the browser the label measures 108/108 (content/box), so it no longer overflows.
2. **Checked categories with no records looked faded.** The half-opacity for empty rows applied to
   the checkbox too, so the curated defaults looked faint next to the mock's bright checks. Now the
   checkbox keeps full strength in both category and kind rows.

## What the first pass built (still in place)

### Rendering: decoded tiles drawn as batched Cesium primitives

The owner chose this over deck.gl when asked during this prompt. The reasons are in the planner's
`7d819ae`. deck.gl is not a dependency.

- **`tileMath.ts`.** XYZ tile math at **MapLibre zoom** (512-px tiles), so a style `minzoom` and a
  layer's `aggBelowZoom` mean the same zoom here as in the backend's style.
  - `planTiles` covers the view rectangle within the TileJSON bounds. It caps the work at 48 tiles,
    handles the antimeridian, and never plans below `aggBelowZoom`.
- **`tileTemplate.ts`.** Reads the TileJSON `tiles` template. **A template with `asOf=latest` or
  `now` is refused**, so only concrete templates are used.
- **`tileSource.ts`.** `getTileJson` and binary `getTile` go through the API client, so the 429/503
  retry per `Retry-After` is 002's.
- **`decodeTile.ts`.** `@mapbox/vector-tile` 3.0.0 over `pbf` 5.1.2 (both BSD-3-Clause, credited on
  the About page).
- **`featureStyle.ts` / `symbolImages.ts`.** Each record is resolved against the 006 style model:
  icons from the SDF sprite at the 006 `displaySize`, colors from field values, rotation, and zoom
  ramps. A record with no style is drawn as a gray circle or line.
- **`recordLayers.ts`.**
  - **Points:** one `BillboardCollection` per layer, `CLAMP_TO_GROUND`.
  - **Lines:** `GroundPolylinePrimitive`; **fills:** `GroundPrimitive`. Edges are rhumb lines.
  - **No per-feature `Entity` or DOM.**
  - At most 6 tile requests in flight per layer; stale ones are aborted.

### First-pass fixes

1. **Switching to 3D stopped rendering.** The 005 camera readout read `Camera.heading` mid-morph.
   It now skips morphing frames.
2. **The zoomed 2D map was read as the whole world.** `visibleRectangle` now reads the 2D view from
   the canvas corners. The 005 Global View inset had the same fault and now shows its box.
3. **A layer could request tiles below its `aggBelowZoom`.** It no longer can.

## How it was checked

### Tests

- **Unit tests for this pass:**
  - `kindCategories` (6): the category order and labels, all 190 live kinds named, the three in
    Other, and new kinds falling into Other.
  - `catalog` (11): grouping and order, defaults, drawn layers, legend scope under hidden sources,
    and the FILTERS source list.
  - `recordFilter` (4): record id, hidden sources, claims.
  - `LayersRail` (9): category state including indeterminate, category on/off, expand and
    collapse, filter, status marks, the FILTERS tab and Show all, loading and error.
  - The App test now expects Events checked, Disasters / Hazards and Aircraft unchecked, "1 on".
- **Playwright** (`e2e/record-layers.e2e.ts`) runs real Chromium with SwiftShader WebGL against the
  dev server and the **live backend**. There are 5 checks:
  1. **The rail opens grouped,** with Events, Weather and Infrastructure on, Hazards off, every
     category collapsed, and the legend's no-records line.
  2. **2D:** Earthquake is checked under Disasters / Hazards.
     - On: **more than 200 pixels within ±24 of `#D9480F`** in a real screenshot, and the legend
       reads "1 kind on the map".
     - Unchecked: the drawn count is 0, the pixels drop below a tenth, and the legend says the
       layers that are on have no records.
     - Checked again: the records are back.
     - **No console errors.**
  3. **3D:** the same.
  4. **Source filter:** with Earthquake on, unchecking USGS Earthquakes in FILTERS takes its pixels
     off the map (drawn 0). **Show all** brings them back.
  5. **Zoom and aggregation.**
     - Live Aircraft has no records, so it would not be drawn. This check alone serves `listKinds`
       with one aircraft record. The TileJSON and tiles are the live backend's.
     - While aggregated, Aircraft requests nothing. Every zoom step that requests earthquake tiles
       goes deeper. Past zoom 7, Aircraft requests only tiles at z ≥ 7.

### In a real browser, against the live backend

Screenshot script, run at 1672×941:

| Step                     | Result                                                                |
| ------------------------ | --------------------------------------------------------------------- |
| Open `/global`           | Events, Weather and Infrastructure on, the rest off; "73 on"; 0 drawn |
| Open Disasters / Hazards | 25 kind rows, Earthquake first (552)                                  |
| Check Earthquake         | Hazards indeterminate; "74 on"; 510 drawn; "1 kind on the map"        |
| FILTERS                  | "All 167 shown", USGS Earthquakes first (552)                         |
| Uncheck USGS Earthquakes | 0 drawn; "166 of 167 shown"                                           |
| Show all                 | 510 drawn                                                             |

- No request left the dev server's origin.
- No console errors appeared.

### Checks

| Check                                                         | Result                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| `npm run typecheck`                                           | Pass                                                     |
| `npm run lint`                                                | Pass                                                     |
| `npx prettier --check .`                                      | Pass                                                     |
| `npx vitest run`                                              | 43 files, 265 tests, all pass                            |
| `npm run e2e`                                                 | 5 tests, all pass (live backend)                         |
| `npm run build`                                               | Pass                                                     |
| `python3 ~/Documents/GitLab/meshdtn/style/test_us_english.py` | 14 tests, OK                                             |
| `check_us_english.py`                                         | 795 hits: 777 in the generated API schema, 18 wire names |

`check_us_english.py` ran over `src`, `scripts`, `completion-reports`, `README.md`,
`vite.config.ts`, both `public/*/README.md` files, `e2e` and `playwright.config.ts`.

- **There were 16 wire-name hits before this pass:** the `Attribution` license field names (13) and
  the OSM data-center kind id (3).
- **This pass adds two, both that same kind id:** its entry in the category table and its line in
  the live-kinds fixture. It is the backend's id and persists, so it is reported, not changed.

## Compared to the mock

`review/007-rail-vs-mock.png` shows the mock's rail beside the built rail with the defaults on, with
Hazards opened and Earthquake on, and with FILTERS hiding one source.

**What matches:**

- **The same twelve categories,** in the same order, with the same labels.
- **One row per category:** checkbox, icon, label, count.
- **The same three checked by default:** Events, Weather and Infrastructure.
- **Row pitch:** 34.5 px built, about 35 px in the mock.
- **"Add Layer" at the foot.**

**Known differences:**

1. **The rail scrolls to reach the last categories.** The built rail has a filter box, an "N on /
   Turn all off" line and an Other row. The mock has none of these, so Conflicts / Security sits
   just below the fold.
2. **No "Global Overview" row** (see above).
3. **Counts are mostly 0.** One kind is live. The mock shows every category with data.
4. **A chevron per row.** It opens a category to its kinds. The mock does not show how a category
   opens.
5. **FILTERS lists sources only.** The mock does not show that tab's content.

## Deviations from the prompt text

- **"Enabled state is in the store (012)".** It is still in `GlobalDashboard` state, as is the
  hidden-source set. Both move when 012 adds the store.
- **Per-view counts.** The rail shows `listKinds` `currentCount` for the whole layer, not the view.
  Per-view counts come with 008's viewport work.

## Notes for later prompts

- **Decoding is on the main thread.** It is cheap at this size, about 500 points. A worker belongs
  with 010 (dense layers).
- **The backend clips at tile edges,** so a polygon outline may show a seam along a tile edge. The
  synthetic check could not show this; it needs live polygon data.
- **`sizeField` is not interpreted.** Circles sized by data use the default 5 px radius.
- **New kinds land in Other** until `kindCategories.ts` names them. The fixture test fails when the
  live list in the fixture names a kind the table does not. The fixture is updated by hand.
- **A test-infrastructure oddity, not 007's.** In this repo's msw 3 setup, a request with no handler
  went to the network instead of failing as `onUnhandledFrame: 'error'` should. The App tests serve
  every endpoint they reach.

## Backend observations

These are for the backend. The client works around none of them.

1. **Earthquake's kind display disagrees with the style.** `listKinds` gives a red circle; the style
   draws `usgs-earthquakes` as the orange `earthquake` icon. The client follows the style.
2. **`KindDisplay`'s color field name is the British spelling.** It crosses the wire, so it is left
   as is. The client does not read it.
3. **No category for a kind.** The client's table stands in for one. If the backend adds one, the
   table becomes a fallback.
4. **The `getTileJson` spec lists no 503,** while `getTile` lists 429 and 503. The client retries
   either way.

## Owner questions

First-pass questions 1–3 are answered by this pass: categories from a client table, the curated
defaults, and sources as a filter.

1. **The default view is empty today.** The curated set (Events, Weather, Infrastructure) has no
   live records. The one live kind, Earthquake, is under Disasters / Hazards, which the mock shows
   unchecked.
   - Keep the mock's set exactly? It fills in as those feeds run.
   - Or add Disasters / Hazards to the defaults?
   - **Default in place: the mock's set exactly.**
2. **FILTERS lists 167 sources with the defaults on,** most with no records now. Should it list
   only the sources supplying records now, and show the others when a kind gets records?
   **Default in place: every source the style or `listKinds` ties to an enabled kind.**

Earlier questions still open, with defaults in place:

- 004: the Alerts tab, the tagline and the user menu.
- 003: `security.openReads` missing from the live system response, and tile keys needing the agent
  scope.
- 002: `listObjectAnnotations` paging, and Retry-After as an HTTP date.
