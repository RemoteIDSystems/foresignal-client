# 007 — Record Layers

**Goal.** Render backend record layers as vector tiles on the map, with the left LAYERS rail and
per-layer toggles — the core of the Global Dashboard.

**Read first.** 006-CR; [Architecture.md](../docs/Architecture.md) §5.1–5.2. Design: Global
Dashboard left panel (LAYERS/ENTITIES/FILTERS, per-layer counts and toggles).

**Backend (OpenAPI only).**
- `GET /v1/tiles.json` [`listTileLayers`] — the vector-tile layer index.
- `GET /v1/tiles/{layer}.json` [`getTileJson`] — TileJSON (concrete `tiles` template, `minzoom`,
  `maxzoom`, `bounds`).
- `GET /v1/tiles/{layer}/{z}/{x}/{y}.mvt` [`getTile`] — the record vector tile.
- `GET /v1/kinds` [`listKinds`] — kind list for layer definitions.

**Build.**
- Render each enabled layer by **decoding its `.mvt` tiles** and drawing the features with **batched
  Cesium primitive collections** per tile (`BillboardCollection`/`PointPrimitiveCollection` for
  points, `PolylineCollection` for lines, polygons/ground primitives for fills), styled from the 006
  `StyleModel` (icon/color/size by kind), applying the 006 `displayScale` to icon sizes. Rendering in
  the Cesium scene makes records align on WGS84, sit on the 2× terrain and occlude behind the globe,
  in 2D and 3D. **Batched — never one `Entity`/DOM node per feature.** deck.gl is **not** used here
  (Architecture §5.1–5.2); it does not align with this WGS84/terrain Cesium map.
- Take **concrete** tile templates from TileJSON (never `latest`/`now`); set `minzoom`/`maxzoom`/
  `bounds`; retina `@2x` with `tileSize: 256`.
- **Left LAYERS rail** from `listTileLayers` + the style model: per-layer toggle, count, icon;
  FILTERS tab stub. Enabled-layer set is held in the store (012). Labels use the 006 prettifier.
- **Scope the 006 legend to the enabled layers** (a kind whose layer is off is hidden), and settle
  the legend's placement against the Conflict mock now that the layer rail exists.
- Retry tiles on `503 RENDER_BUSY`/`429` per `Retry-After` (reuse 002's retry).

**Done when.** Toggling a layer shows/hides its features on the globe and 2D map; layers render
batched; a Playwright check shows features appearing when a layer is enabled.

**Commit.** `007: Record Layers`; `completion-reports/007-CR-Record-Layers.md` (hash + owner questions).
