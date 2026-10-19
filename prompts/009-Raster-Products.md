# 009 — Raster Products

**Goal.** Render raster/weather products (radar, satellite imagery, fields) as Cesium imagery
layers, with legends and loop animation — the weather overlay in the Global and Tropical-Storm
views.

**Read first.** 008-CR; [Architecture.md](../docs/Architecture.md) §5.1. Design: Tropical-Storm
map (animated storm raster, official track); Global (Weather layer).

**Backend (OpenAPI only).**
- `GET /v1/products` [`listProducts`] — raster/field/external products.
- `GET /v1/products/{id}/tilejson` [`getProductTileJson`], `GET /v1/products/{id}/frames/latest`
  [`getLatestProductFrame`], `GET /v1/products/{id}/frames` [`listProductFrames`].
- `GET /v1/products/{id}/tiles/{frameKey}/{z}/{x}/{y}.png` [`getProductTile`] (and `.webp`
  [`getProductTileWebp`]).
- `GET /v1/products/loop` [`getProductLoop`] — animation frames over a snapped box.
- `GET /v1/products/{id}/legend` [`getProductLegend`] (+ `.png` [`getProductLegendPng`]).

**Build.**
- Render a product as a Cesium **imagery layer** (`UrlTemplateImageryProvider`) from the concrete
  frame template (never `latest` in the template); swap the template on new frames (SSE in 011).
- Loop animation via `getProductLoop` (preferred) or N preloaded frame layers stepped by opacity;
  drop frames past `expiresAt`.
- Legend panel from the JSON legend; attribution from the product's structured attribution.
- Keep the number of simultaneously blended rasters small (restraint per §15).

**Done when.** A weather product renders as a translucent overlay, animates through a loop, and
shows a correct legend; frame swap works. Playwright captures an animated overlay.

**Commit.** `009: Raster Products`; `completion-reports/009-CR-Raster-Products.md` (hash + owner questions).
