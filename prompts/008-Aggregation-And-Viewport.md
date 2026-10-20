# 008 — Aggregation And Viewport

**Goal.** Keep rendering bounded: hex-aggregate dense layers below their `aggBelowZoom`, scope
requests to the current viewport, and show aggregate counts — the mechanism that lets the whole
catalog be enabled without a client cap.

**Read first.** 007-CR; [Architecture.md](../docs/Architecture.md) §5.2, §15. Design: Global
Dashboard (per-layer counts; dense layers like Aircraft 5,842 / Maritime 3,917).

**Backend (OpenAPI only).**
- `GET /v1/tiles/{layer}/{z}/{x}/{y}.mvt` [`getTile`] with the `agg=hex` form below `aggBelowZoom`
  (from the style model / TileJSON).
- `POST /v1/context/summary` [`summarizeContext`] — viewport + time + filters → `layerCounts`
  (aggregate only), `activity`, `insights`, `related`.
- `GET /v1/glance` [`getGlance`] — compact counts for widgets.

**Build.**
- Below a layer's `aggBelowZoom`, switch its primitive set to the hex-aggregation tiles and render
  aggregated cells (count-driven styling); above it, switch to the raw record tiles.
- Track the committed viewport (bbox + zoom) in the store; debounce and feed it to `summarizeContext`
  and to any bbox-scoped tile/query requests.
- Wire per-layer counts in the LAYERS rail from `layerCounts` / `glance` (aggregates, not features).

**Done when.** Zooming out collapses dense layers to hex aggregates and back; layer counts come from
the summary; panning updates the scoped context. Verify frame rate stays interactive with several
dense layers on at world zoom.

**Commit.** `008: Aggregation And Viewport`; `completion-reports/008-CR-Aggregation-And-Viewport.md` (hash + owner questions).
