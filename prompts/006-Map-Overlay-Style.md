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
- `map/style/legend.tsx`: a legend panel built from the style model (product legends come with 009).
  Rows match the Conflict mock — **icon + label + severity color**; source and hex-count-zoom detail
  go in a **tooltip/expand**, not inline.
- Attribution surfaced from the structured attribution objects (never hard-coded): on-map display
  stays gated by `requiredDisplay`, and **all** source attributions are also listed on the
  **About/credits page** so nothing is uncredited when the backend leaves the flag off.
- **Kind labels:** an **acronym-aware prettifier** (AIS, APRS, RF, SIGINT, ADS-B, UAV, …) plus a small
  override table for any that prettify wrong — presentation only, in `lib/`, reused by the 007 layer
  rail. **Normalize icon display size** so oversized sprite icons render consistently.

**Done when.** The style model loads and exposes each kind's color/icon/`aggBelowZoom`; the legend
panel renders from it; sprites resolve. Unit test the parse for a representative style.

**Commit.** `006: Map Overlay Style`; `completion-reports/006-CR-Map-Overlay-Style.md` (hash + owner questions).
