# 037 — Client-Side Clustering

**Goal.** Make the whole catalog seamless at low zoom, not just the layers the backend aggregates.
Today only 17 of 596 layers declare `foresignal:aggBelowZoom` (the aircraft kind + its sources); the
other 189 kinds (vessels included) are `null` = never aggregate, so at world zoom they draw tens of
thousands of **raw** records and the world view runs ~32fps (035). Cluster **any** dense point layer
into cells at low zoom on the client, so the world-zoom-all-on view draws hundreds of cells at 60fps.

**Read first.** 035-CR (the GPU frame-budget finding), 008-CR, 010-CR; [Architecture.md](../docs/Architecture.md)
§5.2, §15. The viewport/aggregation machinery already exists: `src/map/records/recordLayers.ts`
(`plan()`, `aggregating()`, the hex-agg draw path), `src/map/ViewportTracker.tsx`, `src/map/records/tileMath.ts`.

**Build.**
- Add a **permissively-licensed client clusterer** (e.g. **Supercluster**, ISC — **confirm the
  license is MIT/ISC/BSD before adding**, per project policy) over each dense point layer's decoded
  tile features.
- **Only for layers that do NOT declare `aggBelowZoom`:** below a client-cluster zoom threshold,
  render **cluster cells** (count-driven styling) through the **existing aggregate-draw path**, and
  raw records above it. Layers that **do** declare `aggBelowZoom` keep using the backend `agg=hex`
  tiles (already working, cheaper — do **not** double-cluster them).
- Keep it **batched** (Cesium primitive collections — no per-feature `Entity`/DOM). Crossing the
  cluster threshold must **not blink** — keep the old cells/records until the new ones are in, the
  same way the existing hex crossover does.
- Clicking a cluster zooms to expand it (standard supercluster behavior); point selection (014) still
  works above the threshold. Line/polygon layers are unaffected.
- Respect viewport culling as today: cluster only the features in the planned (visible) tiles.

**Match the look.** Client cluster cells must match the backend hex-agg cells (same count-driven
styling), so aggregation looks identical whether it comes from the backend or the client.

**Done when (owner verifies on GPU).** Write the scale test so the **World** check expects
≤ 33.3 ms (**30fps** — the all-on-world stress bar; 60fps = 16.7 ms is the normal-use target, already
met at region/city) with all layers on; region/city unchanged; crossing the cluster zoom doesn't blink.
Per the standing rule, **write the test but do not run it** — the owner's `E2E_GPU=1` scale run then
confirms World is within budget. Update the 035 report's "World zoom" section once it passes.

**Commit.** `037: Client-Side Clustering`; `completion-reports/037-CR-Client-Clustering.md` (hash +
the clusterer's license + any owner questions).
