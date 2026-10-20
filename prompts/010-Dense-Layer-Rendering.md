# 010 — Dense Layer Rendering

**Goal.** Prove and harden the batched-rendering path so the client can have a very large number of
layers enabled — up to the backend's full catalog — without becoming the bottleneck.

**Read first.** 007-CR, 008-CR; [Architecture.md](../docs/Architecture.md) §5.2, §15; Charter §6.2.

**Build.**
- Consolidate layer rendering through a batched pipeline of **Cesium primitive collections**
  (billboards / points / polylines / polygons) decoded from the MVT tiles — all record layers render
  in the Cesium scene. No per-feature DOM or per-feature Cesium `Entity` on any dense layer. deck.gl
  stays the reserved §5.2 escape hatch (camera-synced) for a layer that ever needs millions of points.
- A layer manager that adds/removes many layers cheaply, reuses sources, and drives styling from the
  006 style model; respects `aggBelowZoom` (008) per layer.
- Picking/hover that scales (tile-level feature picking), feeding selection (014).
- A dev stress harness that enables a large set of layers at once and reports frame timing.

**Done when.** With a large set of layers enabled (target: the full catalog at world zoom, dense
layers aggregated), the map stays interactive within a frame budget; enabling/disabling a layer is
cheap. Record the measured layer count and frame timing in the completion report.

**Commit.** `010: Dense Layer Rendering`; `completion-reports/010-CR-Dense-Layer-Rendering.md` (hash + numbers + owner questions).
