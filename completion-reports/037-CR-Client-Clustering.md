# 037 — Completion Report: Client-Side Clustering

| Field                 | Value                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| Status                | **Closed by the owner on 2026-10-21.** The GPU scale check passed with adaptive MSAA (`3ee7ebc`, below). |
| Implementation commit | `6d8e0e1e8afa726b105705ded9ae030e671cc4fe`                                                               |
| Run mode              | Attended; the owner asked for 037 on 2026-10-21                                                          |
| Clusterer license     | **No library was added** (see Deviations): the binning is the client's own code, so there is no license. |
| Screenshots           | None taken (compile-only run).                                                                           |
| Mock comparison       | Not made visually. Client cells are drawn by the same code and style as the backend's `agg=hex` cells.   |

## Results

- **Points become cells at low zoom, for the layers the backend does not aggregate.** While the
  view's tiles hold more than **5,000** point records across the layers (`CLUSTER_POINT_BUDGET`),
  every layer without `aggBelowZoom` draws its points as hexagon cells below map zoom **7**
  (`CLIENT_CLUSTER_BELOW_ZOOM`, the zoom the backend's aircraft layers declare). Above zoom 7 points
  are records, as before. Lines and polygons are drawn as before at every zoom.
- **Below the budget nothing changes.** The live earthquakes (914 on the local backend) stay points
  at the home view, so selection (014) and the existing checks work as they did. Clustering turns
  off again only under **4,000** (`CLUSTER_RELEASE_POINTS`), so a view near the budget does not
  switch back and forth.
- **Layers the backend aggregates keep the backend's cells.** A layer with `aggBelowZoom` is never
  clustered by the client.
- **One grid across the layers.** The cells are the backend's own grid, and they are merged across
  every clustering layer: a place holds one cell counting every layer's records there. Per-layer
  cells would have been about 36,000 translucent hexagons stacked on each other for the 035 scale
  stand-in (183 kinds of 200 points each), more costly to draw than the points they replace.
- **The same grid and look as the backend's cells.** A real backend tile was decoded on
  2026-10-21 to read its grid (`GET /v1/tiles/earthquake/3/1/3.mvt?agg=hex`):
  - hexagons are flat-topped, with a circumradius of 1/32 of the tile's width (128 of 4,096 units);
  - centers lie on a lattice with its origin at EPSG:3857's (0, 0);
  - rings start at the west vertex and run clockwise.

  `pointCells` builds exactly that, on the grid of the tile's zoom. Cells are drawn through the same
  code as the backend's (`drawCell`, `src/map/records/cellGeometry.ts`). They take the overlay
  style's aggregation ramp, opacity and outline (`clusterStyle`); every backend `--agg` layer in
  the live style uses the same ramp.

- **No blink at the switch.**
  - Into cells: the points stay on the map until the cell primitive holding their cells has been
    built (`MergedPrimitive.whenBuilt`), then go.
  - Back to points: the points are drawn at once, and the cells stay until the cell primitive is
    rebuilt without them.
  - Crossing zoom 7 by zooming does the same, since the switch is decided per view.
- **A click on a cell zooms into it.** The camera flies to fit the cell (`expandCell`), so its
  records show as finer cells or, past zoom 7, as records. The cell is not selected. This applies to
  the backend's cells too, so the two behave alike.
- **The callout of a cell** names its count, and for a cell counting several layers, "N layers,
  most <kind>". The rail marks a clustered kind "Hexagon counts below zoom 7".
- **Batched, as before.** Cells go into the shared cell primitives (one `Primitive` for fills, one
  for outlines), and points stay in the one `BillboardCollection`. Nothing is a Cesium `Entity` or a
  DOM node.
- **Viewport culling is unchanged.** Only the tiles the view plans are drawn or counted, and only
  their points count toward the budget.

## The GPU scale check

Run at the owner's request after this commit, on 2026-10-21, on the Radeon 780M:
`E2E_GPU=1 npx playwright test e2e/scale.e2e.ts`.

- **First run, with clustering alone (`c86d152`): failed.** World drew **0 points** and **1,224
  cells** counting 43,166 records, and its p95 frame was **53.3 ms** (53.6 ms before 037). The
  points were not the cost.
- **A GPU probe then measured where the time went:** the cells' translucent pass under 4× MSAA
  (28.7 ms of GPU time a frame, 14.1 ms at 1×). Points, draw calls, rebuilds and the globe were
  ruled out. The probe is written up in the 035 report and kept as
  `completion-reports/035-world-probe.json`.
- **Adaptive MSAA by zoom (`3ee7ebc`):** 1× below map zoom 4, the shipped 4× from zoom 4.5.
- **Second run, with adaptive MSAA (`f9ad25e`): passed** in 1.8 min, with no problems
  (`"problems":[]`) and at most one change stream open. Source: `test-results/035-scale-gpu.json`,
  written 2026-10-21T19:10:22Z.

| Measure                     | World                  | Region             | City               |
| --------------------------- | ---------------------- | ------------------ | ------------------ |
| MSAA                        | **1×**                 | 4×                 | **4×**             |
| Points drawn                | 0                      | 1,296              | 1                  |
| Cells drawn                 | 1,236                  | 150                | 0                  |
| Records counted in cells    | 43,292                 | 810                | 0                  |
| Settled after (s)           | 83.2                   | 8.6                | 2.6                |
| Frames in the 3 s pan (fps) | 180 (60.0)             | 180 (60.0)         | 180 (60.0)         |
| Frame p50 / p95 / p99 (ms)  | 16.7 / **17.7** / 21.6 | 16.7 / 17.4 / 20.9 | 16.6 / 18.7 / 20.9 |
| Longest frame (ms)          | 23.6                   | 24.1               | 30.1               |
| Frames over 33.3 ms         | 0                      | 0                  | 0                  |

World's p95 of 17.7 ms is within the 25 ms bar for 60 fps (`SIXTY_FPS_P95_MS`).

## What was built

- **`src/map/records/clientClusters.ts`:**
  - `pointCells`, the backend's hexagon grid;
  - `shouldCluster`, the budget with its release;
  - `clusterStyle`;
  - `CLIENT_CLUSTER_BELOW_ZOOM`, `CLUSTER_POINT_BUDGET`, `CLUSTER_RELEASE_POINTS`, `CELLS_PER_TILE`.
- **`src/map/records/clientCellLayer.ts`:** `ClientCellLayer` holds every clustering layer's cells
  per tile, merges them across layers, draws them, picks them, and tells when they show
  (`whenShown`).
- **`src/map/records/cellGeometry.ts`:** `drawCell`, `positions` and `boxMayHold`, shared by the
  backend's cells and the client's.
- **`src/map/records/recordLayers.ts`:**
  - `RecordLayer` gains `setClusterAllowed` and `pointsInView`;
  - points of a clustering layer are counted into cells per tile, and the points they replace are
    kept until the cells show;
  - the status adds `belowZoom` and `points`.
- **`src/map/records/recordLayerSet.ts`:**
  - the set decides clustering from every layer's points in view after each status flush, and
    owns the `ClientCellLayer`;
  - `DrawnTotals` adds `aggregated` (records the drawn cells count), `pointsShown` and `cellsShown`
    (what the map shows at this frame).
- **`src/map/records/recordBatch.ts`:** `MergedPrimitive.whenBuilt` and `drawnCount`.
- **`src/map/records/recordPicking.ts`:** a cell hit carries its `bounds`; `RecordPickId.layers`.
- **`src/map/focus.ts`:** `expandCell`.
- **`src/map/Viewer.tsx`:** a click on a cell expands it instead of selecting it.
- **`src/views/global/LayersRail.tsx`:** the aggregated label reads the status's `belowZoom`.
- **`src/map/stress/scaleScenario.ts`:** the city-against-world check counts the records the
  world's cells hold. Clustered, the world draws few records one by one.

## How it was checked

### Tests (written, not run)

- `map/records/clientClusters.test.ts` (5):
  - a point falls in the backend's own hexagon: the ring matches the decoded backend tile's within
    two tile units;
  - separate places give separate cells, keyed by zoom;
  - pole points are left out;
  - the budget and its release;
  - the cell style.
- `map/records/recordBatch.test.ts` (1 new, 1 extended): `whenBuilt` at once, after a build, after
  a build in flight, and when emptied; `drawnCount`.
- `map/records/recordPicking.test.ts` (2 extended): a cell hit's bounds; a several-layer cell's
  callout.
- `map/focus.test.ts` (1): `expandCell` flies to the cell's rectangle, and does nothing once the
  viewer is gone.
- `map/stress/scaleScenario.test.ts` (1 new): a clustered world holds the city's records in its
  cells.
- `views/global/LayersRail.test.tsx` (1 new): a client-clustered kind names zoom 7.
- **`e2e/scale.e2e.ts` (changed).** At **World**:
  - records drawn one by one at most the budget, and more than the budget counted in cells;
  - with `E2E_GPU=1`, **p95 ≤ 33.3 ms** (`SLOW_FRAME_MS`), and no problem at any zoom. Since
    `3ee7ebc`, World is held to **p95 ≤ 25 ms** (`SIXTY_FPS_P95_MS`) at MSAA 1×, and City to 4×.

  Region and city are held as before. Its GPU run is reported above; the other tests were not
  run.

- **`e2e/clustering.e2e.ts` (new, 2).**
  - The whole catalog clusters at world zoom. Zooming in past zoom 7 and back out is sampled every
    animation frame, and no frame shows neither points nor cells.
  - A click on the Northern California cell zooms in by more than 4× and selects nothing.

### Checks

| Check                                                       | Result                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| `npm run typecheck`                                         | Passed                                                         |
| `npm run lint`                                              | Passed                                                         |
| `npx prettier --check src e2e scripts`                      | Passed                                                         |
| `npm run build`                                             | Passed. `index` 896.27 kB (269.85 kB gzip)                     |
| `npm run verify:dist`                                       | "✓ dist is ready to deploy."                                   |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule), but for the GPU scale check above |
| Guard: `test_us_english.py`                                 | 14 tests OK (176.1 s)                                          |
| Guard: `check_us_english.py` over the project               | 804 hits, unchanged                                            |
| Guard: `check_us_english.py` over the new and changed files | 0 hits                                                         |

## Compared to the mock

The mocks show no clustered view. The cells match the backend's aggregate cells in grid, ramp,
opacity and outline (above).

## Decisions taken

1. **Cluster by budget, not always.** Clustering every point layer below zoom 7 would have turned
   the home view's earthquakes into cells and taken away their selection. Clustering starts when the
   view holds more points than the budget.
2. **The budget is 5,000 points, and the release 4,000.** The 035 GPU run drew 1,292 points at
   60 fps and 37,500 at 32 fps. 5,000 is a guess between them, to be set from the GPU check.
3. **Merged across layers.** Each place shows one cell. It is named after the layer with the most
   records in it and counts them all.
4. **The backend's grid, at the tile's zoom.** `CELLS_PER_TILE` is 32, the OpenAPI's default for
   `foresignal.tiles.cellsPerTile`.

## Deviations from the prompt text

- **"Add a permissively-licensed client clusterer (e.g. Supercluster)"**: no library was added.
  A point clusterer such as Supercluster returns clusters as weighted points at their records'
  mean position, not as cells of a grid. They cannot be drawn as the backend's hexagons, and the
  prompt requires the two to look the same. Counting points into the backend's own hexagon grid
  is a few dozen lines (`pointCells`), with no dependency. So there is no license to confirm.
  Supercluster's license was not checked, since it was not added. Owner question 1.
- **"Clicking a cluster zooms to expand it (standard supercluster behavior)"**: built as fitting
  the camera to the cell, which shows its records as finer cells or as records. Supercluster's
  expansion zoom is not available without it.
- **"Done when … World … ≤ 33.3 ms (60fps)"**: 33.3 ms is 30 fps. Resolved by the owner (owner
  question 2): World is held to p95 ≤ 25 ms, the bar for 60 fps.
- **"Update the 035 report's World zoom section once it passes"**: done. 035 records world zoom as
  closed by adaptive MSAA.

## Backend observations

- One read for the grid: `GET /v1/tiles/earthquake/3/1/3.mvt?agg=hex` (decoded above). No other
  backend call was made for this prompt.

## Owner questions

1. **No clusterer library.** Is counting points into the backend's hexagon grid (the client's own
   code) acceptable in place of a library such as Supercluster? **Default in place: own code, no
   dependency.**
2. **The world budget. Resolved by the owner on 2026-10-21.** The prompt's wording is clarified:
   33.3 ms is 30 fps, not 60 fps. World is held to a p95 frame **under 25 ms**, the bar for an
   effective 60 fps (`SIXTY_FPS_P95_MS`); region and city keep the 33.3 ms budget
   (`SLOW_FRAME_MS`). The GPU check passed at a World p95 of 17.7 ms.
3. **A click on the backend's cells** now zooms into them, as on the client's, instead of selecting
   them. Is that right for both? **Default in place: both zoom.**
4. **The budget of 5,000 points.** Should it be set from the GPU check's numbers? **Default in
   place: 5,000, release 4,000.**

Questions still open from earlier reports keep their defaults.
