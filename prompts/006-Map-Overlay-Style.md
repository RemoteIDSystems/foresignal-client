# 006 — Map Overlay Style

**Goal.** Load the backend's overlay style as the source of per-kind colors, icons and
`aggBelowZoom`, and render legends. Cesium does not consume the MapLibre style directly, so this
prompt turns it into a styling model the layer pipeline (007/010) uses.

**Read first.** 005-CR; [Architecture.md](../docs/Architecture.md) §5.1. Design: the Global and
Conflict mockups (layer icons/colors, map legend).

**Backend (OpenAPI only).**
- `GET /v1/map/style.json` [`getMapStyle`] — overlay style (per-kind `symbol`/`circle`/`line`/`fill`
  layers, `icon-color`, `rotateField`, `sizeField`, and `metadata.foresignal.layers` with kinds,
  attribution and `aggBelowZoom`).
- `GET /v1/map/sprites/{spriteFile}` [`getMapSprite`] — SDF sprite sheet/index.
- `GET /v1/map/icons/{name}.png` [`getMapIcon`] — single icon fallback.

**Build.**
- `map/style/loadOverlayStyle.ts`: fetch the style + sprite; parse into a `StyleModel`
  (per-kind color, icon, size/rotate fields, geometry filters, `aggBelowZoom`, attribution).
- `map/style/legend.tsx`: a legend panel built from the style model (and product legends later).
- Attribution surfaced from the structured attribution objects (never hard-coded), visible when
  `requiredDisplay` is set.

**Done when.** The style model loads and exposes each kind's color/icon/`aggBelowZoom`; the legend
panel renders from it; sprites resolve. Unit test the parse for a representative style.

**Commit.** `006: Map Overlay Style`; `completion-reports/006-CR-Map-Overlay-Style.md` (hash + owner questions).
