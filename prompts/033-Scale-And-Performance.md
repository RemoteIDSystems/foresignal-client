# 033 — Scale And Performance

**Goal.** Prove the client is not the limiting factor: enable a very large number of layers (toward
the backend's full catalog) and confirm it stays interactive, relying on batching and server-side
aggregation.

**Read first.** 010-CR, 008-CR, 011-CR; [Architecture.md](../docs/Architecture.md) §15; Charter §6.2.

**Build.**
- A repeatable stress scenario: enable a large set of source layers at once at several zoom levels;
  confirm dense layers aggregate below `aggBelowZoom`, raw records load only in-view, and the single
  SSE stream re-filters rather than multiplying connections.
- Measure: frame timing under load, memory, number of concurrent network requests, SSE connection
  count (must stay at one). Add a perf harness/report.
- Fix any path that renders per-feature (DOM/`Entity`) or opens a stream per source; enforce
  batching and viewport scoping. Keep active raster overlays bounded.
- Document the measured ceiling (layers enabled, entities drawn, frame time) and confirm the limit
  is the backend, not the client.

**Done when.** With the large layer set enabled the client stays interactive within the frame budget,
holds one SSE connection, and draws only in-view/aggregated data. Numbers recorded in the report.

**Commit.** `033: Scale And Performance`; `completion-reports/033-CR-Scale-And-Performance.md` (hash + numbers + owner questions).
