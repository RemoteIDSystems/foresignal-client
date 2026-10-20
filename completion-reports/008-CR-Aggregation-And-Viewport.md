# 008 — Completion Report: Aggregation And Viewport

| Field                 | Value                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Status                | Complete                                                                                     |
| Implementation commit | `29d6f7339bb2e2c72c5ee5033a3ced0bc9069d1b`                                                   |
| Run mode              | Unattended (owner's batch 007–010, no review gates)                                          |
| Hexagons, 2D          | `review/008-hex-aggregation-2d.png` (**stand-in data**, labeled; see below)                  |
| Hexagons, 3D          | `review/008-hex-aggregation-3d.png` (**stand-in data**, labeled)                             |
| Counts in view        | `review/008-rail-counts-in-view.png` (Global mock rail; built rail at world zoom, zoomed in) |

## What was built

### Hexagon aggregation below `aggBelowZoom`

- **A layer that aggregates switches between two kinds of tile by zoom** (`recordLayers.ts`).
  - **Below its `aggBelowZoom`:** it plans tiles below that zoom and asks for them with
    `agg=hex`. These hold the backend's hexagon cells.
  - **At or above it:** it asks for record tiles with `agg=none` and never plans them below that
    zoom.
  - **The other mode's tiles stay until the new ones are in,** so crossing the zoom does not
    blink.
  - `fetchTile` takes the `agg` value; the tile template's own query is kept.
- **Cells are merged across tiles** (`hexCells.ts`, `HexCellIndex`).
  - The backend sends a hexagon that straddles a tile edge in both tiles, each counting its own
    side. Checked live: the `agg=hex` tile 1/0/0 has cell outlines starting at x = −64, outside
    the tile.
  - Each cell is keyed by its center, rounded to 5 decimals, and its counts are summed.
  - So each cell is drawn once with its whole count. Drawn per tile, it would show as two
    overlapping halves.
- **Styling is driven by count, from the backend's style.**
  - A kind takes the `--agg` fill layer of one of its sources from the overlay style: the count
    ramp (interpolated linearly, as MapLibre does), `fill-opacity` and `fill-outline-color`.
  - Live, that is aircraft only: 16 sources, all with `aggBelowZoom` 7 and the same ramp.
  - A kind that aggregates with no `--agg` style falls back to a gray ramp.
  - The 006 legend already shows the ramp for such a kind.
- **Cells are ordinary primitives, not ground primitives.**
  - Each layer draws one fill `Primitive` and one outline `Primitive` at the ellipsoid.
  - The scene does not depth-test primitives against terrain (`depthTestAgainstTerrain` is never
    set), so cells draw over the relief and still hide behind the globe.
  - The first version used ground primitives and failed the frame-rate check (below).
- **Status:** the layer reports `aggregated` with its cell count and the records they count. The
  map region carries `data-record-cells` beside `data-record-features`. The rail's mark for the
  state is now a hexagon, labeled "Hexagon counts below zoom 7; zoom in to see records".

### The committed viewport, and counts from the summary

- **The viewport store** (`src/state/viewport.ts`) is exported from `src/state` beside the
  capabilities store, for 012 to take into the full store.
  - `ViewportTracker` lives in the viewer. It commits `{ bbox, zoom }` 300 ms after the camera
    rests, after a 2D/3D switch, and once at start.
  - The box is rounded **outward** to 3 decimals. It always covers the view, and the backend's
    per-context cache can answer it again.
- **`summarizeContext`** (`src/state/contextSummary.ts`):
  - It runs 400 ms after a new viewport and every 60 s.
  - The window is the last 24 hours, the start of the Global mock's time bar.
  - A request for an older viewport is canceled.
  - **A view across the antimeridian is asked about in two halves and the counts are added**
    (backend observation 1).
- **The rail's counts are the records in view** (`withViewCounts`, `CountBadge`).
  - Each kind and category shows its `layerCounts` count. A kind the summary does not list has
    none in view and is set back like any empty row.
  - The tooltip says "Records in view", or "Records now" before the first summary arrives.
  - **The rail's order and what is drawn still follow the `listKinds` counts,** so the rail does
    not reshuffle on every pan, and a layer is not dropped just because the view has none of its
    records.

### Two bugs found while checking

1. **Points went missing after a zoom step.** This came from 007's dedupe by record id.
   - **Cause:** while the map changes zoom, the new zoom's tiles load while the old ones are still
     drawn. Every point was already claimed by an old tile, so the new tiles skipped it. The old
     tiles were then removed and nothing redrew the skipped points.
   - **Seen live:** zoomed to west Texas, 0 drawn with 1 earthquake in view.
   - **Fix:** claims are per tile zoom, and a tile refused a record is drawn again when the holder
     goes (`RecordClaims.release` returns the waiting tiles).
   - **The new e2e check caught it:** with the bug, "0 drawn, 94 in view"; with the fix, passes.
2. **A deeply zoomed view sent an empty box,** and the backend answered 400 because "minLat below
   maxLat" failed.
   - Rounding to 3 decimals collapsed south onto north.
   - Rounding outward fixes it. The fix is tested, including a single-point view.

## How it was checked

### Tests

- **Unit tests (19 new):**
  - `hexCells` (5): cells from a tile, the center key, merging across tiles, the style lookup,
    and the ramp.
  - `viewport` (5): rounding outward, no empty box, clamping, antimeridian split, the store.
  - `contextSummary` (3, msw through the real client): the request body, two halves summed, and
    a refusal.
  - `tileSource` (+1): `agg=hex` / `agg=none` in the query.
  - `catalog` (+2): counts in view, order kept.
  - `LayersRail` (+1): counts in view, and "Records now" before them.
  - `recordFilter` (+2): claims per zoom, and redrawing waiting tiles.
- **Playwright, live backend** (`e2e/aggregation.e2e.ts`; helpers moved to `e2e/support.ts`):
  1. **Aggregation round trip.**
     - Aircraft (live `aggBelowZoom` 7) requests only `agg=hex` tiles below z7 and draws cells.
     - Zooming in, it switches to `agg=none` tiles at z ≥ 7, with none below, and the cells go.
     - Zooming back out, the cells return.
     - At every zoom step, **drawn earthquakes ≥ the summary's count in view**.
  2. **Counts in view.** Hazards counts in view and never more than `listKinds`. Zooming in sends
     a narrower box, and the count falls.
  3. **Frame rate.** See below.
- **Stand-in data.** Live aircraft has no records. The checks list one aircraft record and answer
  aircraft `agg=hex` tiles with the **live earthquake `agg=hex` tiles of the same address**: real
  backend cells, standing in. The screenshots say so in a red banner.

### Frame rate with several dense layers at world zoom

The check makes six kinds aggregate below z7 with stand-in cells, the same way: aircraft, vessel,
satellite, fire-detection, news-article and social-post. It turns them on in 2D at the opening
view and counts `requestAnimationFrame` frames over 5 s while the map is dragged back and forth.

| WebGL                               | Empty map | Six aggregated layers | Cells |
| ----------------------------------- | --------- | --------------------- | ----- |
| Software (SwiftShader, the default) | 14.7 fps  | 8.0 fps               | 342   |
| GPU (`E2E_GPU=1`, AMD Radeon 780M)  | 60.1 fps  | 43.2 fps              | 348   |

- **How the number was reached:**
  1. **Cells as ground primitives:** 1.4 of 12.3 fps in software. Without outlines 2.9 fps;
     without fills 1.5 fps.
  2. **Ordinary primitives:** 4.1 fps. Held still, the map ran at 13.9 fps, so drawing was not the
     cost.
  3. **A CPU profile** (DevTools protocol) showed 2.0 s of 5 s in `readPixels`, under Cesium's
     default click selection (`pickAndSelectObject`). The test's drag let go where it pressed, so
     Cesium took every pan for a click and rendered a pick pass. The drag now lets go elsewhere.
  4. **What is left is GPU-side.** The main thread is about 70% idle with the layers on.
- **The assertion depends on the renderer.**
  - On the GPU: more than 30 fps and more than 60% of the empty map's rate.
  - In software: more than 40% of the empty rate, which catches a regression such as the
    ground-primitive version.
- **`E2E_GPU=1` is new in `playwright.config.ts`.** It runs Chromium on the GPU through ANGLE's
  OpenGL backend. The default stays software, so any machine can run the suite.
- **For 010:** Cesium's default click selection picks on every click and renders a pick pass;
  010's picking should replace it.

### In a real browser, live backend

| Step                                      | Result                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| Aircraft (stand-in) and Earthquake on, 2D | 66 cells, 593 records; legend "2 kinds on the map"                      |
| 3D                                        | 93 cells                                                                |
| Rail at world zoom                        | Disasters / Hazards 325 in view (`listKinds`: about 640)                |
| Zoomed to west Texas (scale 20 km)        | Aircraft `ready`, 0 cells; Hazards 1 in view; 19 drawn                  |
| Summary boxes                             | `[-138.391,-3.493,-21.609,59.053]` → `[-104.215,29.494,-100.04,31.731]` |

- No console errors.
- The one earthquake in the west Texas view, M 2.5, 44 km NW of Toyah, sits under the legend
  panel. The tiles were decoded by hand to confirm it.

### Checks

| Check                                                         | Result                                                         |
| ------------------------------------------------------------- | -------------------------------------------------------------- |
| `npm run typecheck`                                           | Pass                                                           |
| `npm run lint`                                                | Pass                                                           |
| `npx prettier --check .`                                      | Pass                                                           |
| `npx vitest run`                                              | 46 files, 284 tests, all pass                                  |
| `npm run e2e`                                                 | 7 tests, all pass (live backend, software WebGL)               |
| `E2E_GPU=1` frame-rate check                                  | Pass (60.1 → 43.2 fps)                                         |
| `npm run build`                                               | Pass                                                           |
| `python3 ~/Documents/GitLab/meshdtn/style/test_us_english.py` | 14 tests, OK                                                   |
| `check_us_english.py`                                         | 795 hits: 777 in the generated schema, 18 wire names; none new |

## Compared to the mock

`review/008-rail-counts-in-view.png` puts the mock's rail beside the built rail at world zoom and
zoomed in.

- **What matches:**
  - a count on every category row, set as a pill, falling as the view narrows;
  - the same categories and order.
- **The mock's counts are bigger and on every row** (Aircraft 5,842, Maritime 3,917). Live, only
  earthquakes have records.
- **The mock draws aircraft as icons at a regional zoom.** The backend's style says hexagons below
  z7, and the client follows the style. The aircraft icons appear from z7.

## Decisions taken (unattended run)

1. **Hexagons are merged, not drawn per side.** Straddling cells are drawn once with the summed
   count. MapLibre with the backend's style would draw two halves with each side's color.
2. **The rail shows counts in view; order and drawing follow `listKinds`** (see above).
3. **The viewport store is a small store in `src/state` now**, not React state, as the prompt asks.
   012 takes it into the full store.
4. **The summary window is the last 24 hours.** It did not change the counts in any test (backend
   observation 2).

## Deviations from the prompt text

- **`getGlance` is not wired.** Its schema has no per-layer counts: only alerts, source health,
  `versionsLastHour`, `lastSeq` and links. The rail's counts come from `summarizeContext`
  `layerCounts` alone. See owner question 1.
- **"Bbox-scoped tile/query requests".** Record tiles are scoped by the tiles the view needs
  (007). The committed viewport feeds `summarizeContext` only; nothing else takes a bbox yet.

## Backend observations

1. **`summarizeContext` misreads a box across the antimeridian.** `[170,-60,-170,60]` gave 482
   earthquakes, the same as `[-170,-60,170,60]`. The two halves `[170,-60,180,60]` and
   `[-180,-60,-170,60]` gave 6 and 23. The client splits the box.
2. **`layerCounts` did not change with `timeRange.start`.** Starts of 2020-01-01, 2026-10-19T12:00Z
   and 2026-10-20T11:00Z all gave earthquake 639, which equalled `liveCount`. The counts look like
   the current state in the box, whatever the window.
3. **Only aircraft has `aggBelowZoom` live** (its 16 sources, 7). Maritime and the other dense
   categories in the mock have none.

## Owner questions

1. **Counts from `getGlance`.** The prompt names it for layer counts, but its schema has none. Is
   that a gap in the API, or is the summary the intended source? **Default in place: summary
   only.**
2. **The source filter does not reach hexagon cells.** Cells count every source of the kind
   together. Their `kinds` property breaks the count down by kind, never by source. Below z7 a
   hidden source's records are still counted. **Default in place: cells show every source.**

Questions still open from earlier reports (007: the empty default view and the long FILTERS list;
004, 003, 002) keep their defaults.
