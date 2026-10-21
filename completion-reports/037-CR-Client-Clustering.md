# 037 — Completion Report: Client-Side Clustering

| Field                 | Value                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule). The GPU scale check runs after this commit, as the owner asked. |
| Implementation commit | `6d8e0e1e8afa726b105705ded9ae030e671cc4fe`                                                                        |
| Run mode              | Attended; the owner asked for 037 on 2026-10-21                                                                   |
| Clusterer license     | **No library was added** (see Deviations): the binning is the client's own code, so there is no license.          |
| Screenshots           | None taken (compile-only run).                                                                                    |
| Mock comparison       | Not made visually. Client cells are drawn by the same code and style as the backend's `agg=hex` cells.            |

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
  - with `E2E_GPU=1`, **p95 ≤ 33.3 ms** (`SLOW_FRAME_MS`), and no problem at any zoom.

  Region and city are held as before.

- **`e2e/clustering.e2e.ts` (new, 2).**
  - The whole catalog clusters at world zoom. Zooming in past zoom 7 and back out is sampled every
    animation frame, and no frame shows neither points nor cells.
  - A click on the Northern California cell zooms in by more than 4× and selects nothing.

### Checks

| Check                                                       | Result                                     |
| ----------------------------------------------------------- | ------------------------------------------ |
| `npm run typecheck`                                         | Passed                                     |
| `npm run lint`                                              | Passed                                     |
| `npx prettier --check src e2e scripts`                      | Passed                                     |
| `npm run build`                                             | Passed. `index` 896.27 kB (269.85 kB gzip) |
| `npm run verify:dist`                                       | "✓ dist is ready to deploy."               |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                |
| Guard: `test_us_english.py`                                 | 14 tests OK (176.1 s)                      |
| Guard: `check_us_english.py` over the project               | 804 hits, unchanged                        |
| Guard: `check_us_english.py` over the new and changed files | 0 hits                                     |

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
- **"Done when … World … ≤ 33.3 ms (60fps)"**: 33.3 ms is 30 fps. The spec holds the existing budget,
  33.3 ms (`SLOW_FRAME_MS`). Owner question 2.
- **"Update the 035 report's World zoom section once it passes"**: not done yet; it waits for the
  GPU check.

## Backend observations

- One read for the grid: `GET /v1/tiles/earthquake/3/1/3.mvt?agg=hex` (decoded above). No other
  backend call was made for this prompt.

## Owner questions

1. **No clusterer library.** Is counting points into the backend's hexagon grid (the client's own
   code) acceptable in place of a library such as Supercluster? **Default in place: own code, no
   dependency.**
2. **The world budget.** The prompt says "≤ 33.3 ms (60fps)": 33.3 ms is 30 fps, and 60 fps is
   16.7 ms. Which is the budget? **Default in place: 33.3 ms, as `SLOW_FRAME_MS`.**
3. **A click on the backend's cells** now zooms into them, as on the client's, instead of selecting
   them. Is that right for both? **Default in place: both zoom.**
4. **The budget of 5,000 points.** Should it be set from the GPU check's numbers? **Default in
   place: 5,000, release 4,000.**

Questions still open from earlier reports keep their defaults.
