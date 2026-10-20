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
  `bounds`. Record tiles are vector (MVT) and resolution-independent — **no `@2x`** (that is only for
  the raster products, 009).
- **Left LAYERS rail, matching the Global mock.** The rail is **kind-based**, grouped into the mock's
  ~12 categories (Events, Aircraft, Maritime, Satellites, Weather, Imagery, RF/Spectrum,
  Infrastructure, Cyber, Energy, Hazards, Conflicts) via a client **category table** (presentation,
  with an `Other` fallback for unmapped kinds). Each row: toggle, icon, label (006 prettifier), count.
  **Sources are a filter, not parallel toggles** — a FILTERS control restricts which sources show
  within the enabled kinds, so records are never drawn twice (dedup by record id as a safety).
  Default-on is the mock's **curated checked set**, not every kind with records. Enabled state is in
  the store (012).
- **Scope the 006 legend to the enabled layers**, placed top-left under the time box per the mock.
- Retry tiles on `503 RENDER_BUSY`/`429` per `Retry-After` (reuse 002's retry).

**Done when.** Toggling a layer shows/hides its features on the globe and 2D map; layers render
batched; a Playwright check shows features appearing when a layer is enabled.

**Commit.** `007: Record Layers`; `completion-reports/007-CR-Record-Layers.md` (hash + owner questions).
