# 010 — Completion Report: Dense Layer Rendering

| Field                 | Value                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------- |
| Status                | Complete; the full catalog measured on **stand-in records** (live, one kind has records) |
| Implementation commit | `8478c4eb6959e9b53994d391c8015299f7004780`                                               |
| Run mode              | Unattended (owner's batch 007–010, no review gates)                                      |
| Selection             | `review/010-selection.png` (stand-in quakes in the live earthquake style)                |
| Full catalog, 2D      | `review/010-stress-full-catalog.png` (**stand-in data**, the dev stress harness showing) |
| Full catalog, 3D      | `review/010-stress-full-catalog-3d.png` (**stand-in data**)                              |
| Mock comparison       | `review/010-vs-global-mock-selection.png` (the mock's selected entity beside the built)  |

## Results

The full catalog is **190 kind layers**, from the live `listTileLayers` (596 layers: 190 kinds and
406 sources; sources are the FILTERS tab, so a record is drawn once, by its kind). Live, only
`earthquake` has records, so the measurement uses stand-ins (`e2e/dense-support.ts`):

- 6 dense kinds (`aircraft`, `vessel`, `satellite`, `fire-detection`, `news-article`,
  `social-post`) aggregate below zoom 7, their hexagon tiles answered with the live earthquake
  cells;
- every other kind but `earthquake` (which keeps its live records) gets 200 points over the
  world, encoded as real vector tiles per tile request.

Measured at world zoom, the map panning continuously for 5 s (`measureFrames`), with every layer
loaded and every merged primitive built:

| Run                  | Mode | Records drawn | Cells | fps  | p50 ms | p95 ms | p99 ms |
| -------------------- | ---- | ------------- | ----- | ---- | ------ | ------ | ------ |
| GPU, no layers       | 2D   | 0             | 0     | 36.3 | 26.2   | 47.3   | 58.9   |
| GPU, 190 layers      | 2D   | 37,279        | 222   | 16.2 | 61.8   | 91.0   | 209.6  |
| GPU, no layers       | 3D   | 0             | 0     | 60.0 | 16.6   | 17.5   | 19.0   |
| GPU, 190 layers      | 3D   | 37,280        | 564   | 60.0 | 16.5   | 21.0   | 33.9   |
| Software, no layers  | 2D   | 0             | 0     | 7.4  | 130.1  | 249.2  | 258.9  |
| Software, 190 layers | 2D   | 37,278        | 222   | 0.6  | 1711.1 | 1723.6 | 1723.6 |
| Software, no layers  | 3D   | 0             | 0     | 8.2  | 65.6   | 325.5  | 637.0  |
| Software, 190 layers | 3D   | 37,278        | 222   | 2.5  | 332.8  | 674.0  | 674.0  |

GPU is `E2E_GPU=1` (Chromium on the machine's GPU through ANGLE's OpenGL backend); software is
SwiftShader, the default e2e run. The figures are the summary the e2e test prints (and writes to
`test-results/`, which Playwright clears on each run), from the two runs reported under Checks.
Repeated GPU runs vary by a few fps; earlier runs in this pass, before the last fixes, read 12.8
to 21.3 fps for the full catalog in 2D.

Turning one layer off and on with all 190 on (GPU): **1.0 ms** to remove it, **0.1 ms** to add it
back, **105 ms** until it had drawn again (from the shared tile cache, no request).

Loading the full catalog took **45 s** on the GPU run (67 s in software). That is the backend's rate
limit for anonymous clients (464 responses of 429 on the GPU run, 392 in software), which the map
now waits out (below).

**The frame budget, as checked:** on the GPU, the 3D globe stays above 30 fps with every kind on
(measured 60.0, the same as with none), and the 2D map above 10 fps (measured 16.2, against 36.3
with none). The 2D map is the costly mode: every symbol is in view at once, and at world zoom the
2D map is drawn in two viewports across the wrap. In software WebGL every fragment of 37,000
symbols is drawn on the CPU; there the check is only that the map renders and is correct.

## What was built

### One batched pipeline for every layer (`src/map/records/recordBatch.ts`)

Before, each layer had its own billboard collection and two ground primitives per tile. Now every
layer on a viewer draws into one `RecordBatch`:

- **one `BillboardCollection`** for every point, with one texture atlas in which each distinct
  symbol is stored once, drawn in **one translucent pass** (the default draws every point twice,
  opaque then translucent; the symbols' halos are translucent anyway);
- **one `GroundPrimitive`** for every polygon fill and **one `GroundPolylinePrimitive`** for every
  line and outline, across layers and tiles;
- **one `Primitive`** each for every layer's aggregate cell fills and outlines.

`MergedPrimitive` holds each owner's (a layer's tile, or a layer's cells) geometry instances and
rebuilds the one primitive after a burst of changes (80 ms). While a build is in flight, further
changes wait for it, so a full catalog arriving tile by tile costs a few builds (12 for the 2D
load, 73 by the end of the 3D measurement, on the GPU run), not one per tile. The primitive drawn
before stays until its replacement is ready, so nothing blinks. Cesium copies instances into its workers, so they are reused unchanged
by every rebuild (checked in `Primitive.js` and `GroundPrimitive.js`).

No `Entity` and no DOM node is made per record, on any layer. deck.gl was not needed.

**Points are clamped to the terrain only on the 3D globe.** A clamped point is rewritten each time
the terrain under it loads. Panning the flat 2D map paid that every frame for 37,000 points, for a
height nobody sees there. The batch switches clamping when the morph completes.

### The layer manager (`recordLayerSet.ts`, `recordLayers.ts`, `layerSources.ts`)

- **Sources are shared** (`LayerSources`, one per API client, so the split view's two maps share
  too):
  - each layer's TileJSON is read once;
  - decoded tiles are kept for 60 s (1,500 at most, least recently used out), so turning a layer
    back on, or going back to a view, draws from memory;
  - TileJSON and tile requests from every layer go through **one queue of 12**.
- **Rate limits are waited out.** The live backend answers a burst of anonymous requests with 429
  ("Too many anonymous requests from this client; retry after 1 s"). Before this pass, a layer
  whose TileJSON was refused after the client's three tries was marked an error and stayed empty
  until the camera moved. With the full catalog on, 103 of the 190 kinds drew nothing. Now a 429
  or 503 is a transient failure: the layer reports `loading`, waits (1 s doubling to 30 s, with
  jitter so 190 layers do not ask again together) and draws the view again.
- **Status changes are gathered** and told to the page once per 50 ms, not once per tile per
  layer. Each one re-renders the rail.
- **Styling** is the 006 model, as before (`resolveSymbol`, the aggregation ramp per kind);
  `aggBelowZoom` is per layer, as in 008.

### Picking and hover (`recordPicking.ts`, `mapPointer.ts`, `RecordMarker.tsx`)

- **Cesium's own left click and double click are removed.** They ran a GPU pick pass of the whole
  scene on every click and selected or flew to entities the map does not have.
- **Picking is on the CPU, tile by tile.** The pointer becomes a longitude, latitude and ground
  scale (on the terrain in 3D). Only the drawn tiles whose area, widened by 40 px, holds the
  pointer are tested (`tileMayHold`), so the cost follows the records near the pointer, not the
  37,000 drawn. Each tile keeps its records' shapes when it is drawn.
- **Hits are ranked** points over lines over areas, nearest first. A point is hit inside its
  symbol's box plus 4 px, a line within half its width plus 4 px, and a polygon or cell inside it.
- **Hover** is picked once per frame at most, and not while a button is held. It shows the
  callout and a pointer cursor.
- **Click selects; clicking nothing or pressing Escape clears.** The selection is the Global
  page's state, carried in the rail context as `selection` for 014's dossier. The map marks it as
  the Global mock marks the selected entity: a thin light cyan box and a callout with the title and
  kind. One DOM element follows the record each frame, without re-rendering React, and hides behind
  the globe.
- `data-hovered` and `data-selected` on the map name them, for checks.

### The stress harness (`src/map/stress/`)

`/global?stress`, in a **development build only**, adds a panel to the map:

- **Turn on all 190 kinds:** every kind is drawn, whether or not `listKinds` counts records for it.
- **Restore** and **World view**.
- **Measure 5 s:** pans the map and reports fps, p50/p95/p99 frame time and slow frames, then
  times turning one layer off and on.
- **Live totals:** layers (and how many are loading), records, cells, tiles, merged instances and
  builds, and requests active and waiting.

A production build leaves it out entirely: it is loaded lazily behind `import.meta.env.DEV`, and
`grep` finds none of its text in `dist/assets`. The engine is registered (on
`window.__foresignalEngine`, for the e2e checks) only in development builds.

### Also fixed

- **The map no longer re-renders with the camera.** The HUD reads the camera from a store
  (`LiveHud`), and the legend is built again only when what it shows changes. Before, every frame
  of a pan re-rendered the whole map component, including a legend of 190 kinds. A CPU profile of
  a 6.5 s pan with the full catalog on spent about 3.6 s in React's rendering.

## How it was checked

### Tests

- `recordPicking.test.ts`:
  - point, line, polygon (with a hole) and cell hits, at and past the tolerance;
  - across the antimeridian;
  - the ranking;
  - which tiles may hold a hit;
  - the callout's text.
- `recordBatch.test.ts`:
  - a burst of owners is built once;
  - the old primitive is kept until the new one is ready;
  - changes during a build wait for it;
  - a layer's owners are removed together;
  - destroy.
- `layerSources.test.ts`:
  - TileJSON is read once and a failure is read again later;
  - a rate-limited TileJSON is read again on the next ask;
  - tiles are reused while fresh and fetched again after;
  - at most 12 requests are in flight, and an aborted waiter is dropped.
- `frameStats.test.ts`: the frame statistics, and stress mode only with `?stress` in development.
- `tileSource.test.ts`: updated for the transient flag.
- `e2e/dense-rendering.e2e.ts`:
  1. **Picking.** Three stand-in quakes in the live style. Proven from where the browser laid the
     page out:
     - hovering one names it and shows the pointer cursor;
     - clicking puts the box's center within 3 px of the quake's screen position;
     - another click selects another;
     - the sea and Escape clear the selection;
     - a double click no longer moves the camera.
  2. **The full catalog.** The measurements above:
     - every non-dense kind draws all its points;
     - the dense kinds draw cells;
     - every layer draws in the end despite the rate limit;
     - the toggle cost;
     - the frame-budget guards on the GPU.

### Checks

| Check                                                         | Result                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `npx tsc --noEmit`                                            | Pass                                                                      |
| `npx eslint .`                                                | Pass                                                                      |
| `npx prettier --check .`                                      | Pass                                                                      |
| `npx vitest run`                                              | 53 files, 328 tests, all pass                                             |
| `npx playwright test` (software)                              | 12 tests, all pass (9.2 min)                                              |
| `E2E_GPU=1 npx playwright test e2e/dense-rendering.e2e.ts`    | 2 tests, both pass                                                        |
| `npx vite build`                                              | Pass; no stress harness text in the bundle                                |
| `python3 ~/Documents/GitLab/meshdtn/style/test_us_english.py` | 14 tests, OK                                                              |
| `check_us_english.py`                                         | 796 hits: 777 in the generated schema, 19 wire names (unchanged from 009) |

## Compared to the mock

`review/010-vs-global-mock-selection.png` sets the mock's selected Tropical Storm Florence beside a
selected stand-in quake.

- **What matches:**
  - a thin light cyan box around the selected thing;
  - a dark callout at its upper right with the name, then a detail line.
- **What differs:**
  - the mock's box is sized to the storm's imagery; the built box is sized to the symbol;
  - the mock's callout overlaps the box's edge; the built one sits beside it.
- **The SELECTED ENTITY panel** on the right still shows its placeholder. The selection reaches the
  page state now; 014 fills the dossier from it.

The full-catalog screenshots are a stress view, not a design: 37,000 symbols at world zoom.

## Decisions taken (unattended run)

1. **The full catalog is the 190 kind layers**, not the 596 index entries. Source layers are
   filters, so drawing them too would draw each record twice.
2. **Hover shows the callout; click selects** with box and callout; Escape or an empty click
   clears. The selection lives in the Global page and its rail context, for 014.
3. **Cesium's default click and double-click are removed** from the record map.
4. **Points are not clamped in 2D.**
5. **Tiles are reused for 60 s** after they arrive. Records are live; the kind counts refresh on
   the same minute.
6. **One request queue of 12** across layers. On a 429 or 503, a layer waits from 1 s, doubling
   to 30 s.
7. **The stress harness is `?stress`** on the Global page, in development builds only.
8. **The frame-budget guard** is 3D above 30 fps and 2D above 10 fps on the GPU.

## Deviations from the prompt text

- **"Interactive within a frame budget" holds in 3D, but the 2D map at world zoom with every kind
  on is 16 fps on this machine's GPU** (36.3 with none). It is drawing 37,000 individual symbols,
  all in view. Owner question 2 asks how to treat that.
- **Points and polygons of the full catalog are stand-ins:** live, one kind has records.

## Backend observations

1. **Anonymous requests are rate limited** ("Too many anonymous requests from this client; retry
   after 1 s"). The full catalog meets the limit at once: 190 TileJSON reads, then their tiles. The
   map now waits it out, but loading takes 45 to 67 s (392 to 464 responses of 429).
2. **TileJSON is per layer.** There is no batched read of the 190 templates. `listTileLayers`
   gives `aggBelowZoom` but not the template or zoom range.

## Owner questions

1. **The rate limit.** Should the full catalog load faster for an anonymous client? Options: a
   higher anonymous limit, a batched TileJSON read, or `listTileLayers` carrying each layer's
   template and zoom range. Saved views (`/v1/views/{id}/tiles`) would be one tile request for
   many layers, but they need a view written to the server first. **Default in place: the client
   waits the limit out.**
2. **Symbols at world zoom.** With every kind on, the 2D map draws 37,000 symbols at 16 fps on
   the GPU. Should non-dense kinds be decluttered or scaled down below some zoom on the client, or
   should more kinds get an `aggBelowZoom` on the backend? **Default in place: every record is
   drawn at full size, as the mock draws its symbols.**
3. **Hover.** Is the hover callout wanted? The mock shows only the selected entity's.
   **Default in place: hover shows the callout without the box.**

Questions still open from earlier reports (009: external products, loops, default products; 008,
007, 004, 003, 002) keep their defaults.
