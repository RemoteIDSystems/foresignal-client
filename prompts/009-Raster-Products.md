# 009 — Raster Products & Wind

**Goal.** Render raster/weather products (radar, satellite imagery, fields) as Cesium imagery layers
with legends and loop animation, **and** render wind — barbs, the speed raster, and animated
particles — the weather and wind overlays in the Global and Tropical-Storm views.

**Read first.** 008-CR; [Architecture.md](../docs/Architecture.md) §5.1. Design: Tropical-Storm map
(animated storm raster, official track); Global (Weather layer).

**Backend (OpenAPI only).**
- `GET /v1/products` [`listProducts`]; `GET /v1/products/{id}/tilejson` [`getProductTileJson`];
  `GET /v1/products/{id}/frames/latest` [`getLatestProductFrame`]; `GET /v1/products/{id}/frames`
  [`listProductFrames`].
- `GET /v1/products/{id}/tiles/{frameKey}/{z}/{x}/{y}.png` [`getProductTile`] (and `.webp`
  [`getProductTileWebp`]).
- `GET /v1/products/loop` [`getProductLoop`] — animation frames over a snapped box.
- `GET /v1/products/{id}/legend` [`getProductLegend`] (+ `.png` [`getProductLegendPng`]).
- **Wind:** `GET /v1/products/{id}/vectors/{frameKey}/{z}/{x}/{y}.mvt` [`getProductVectorTile`]
  (barbs); `GET /v1/products/{id}/fields/{frameKey}.png-uv` [`getProductFieldPngUv`],
  `…/fields/{frameKey}.velocity-json` [`getProductFieldVelocityJson`], and the manifest
  `…/fields/{frameKey}.json` [`getProductFieldManifest`] (particle field).

**Build.**
- Render a product as a Cesium **imagery layer** from the concrete frame template (never `latest`);
  swap the template on new frames (SSE in 011). Loop animation via `getProductLoop`; drop frames
  past `expiresAt`. Legend from the JSON legend; attribution from the product's structured object.
- **Wind barbs:** a symbol layer from the barb MVT (`getProductVectorTile`), rotated by `fromDeg`.
- **Wind speed raster:** the `wind-speed` style of the gfs/hrrr products as an imagery layer.
- **Animated wind particles:** a WebGL particle layer fed by the png-uv / velocity-json field
  (`getProductFieldPngUv` / `getProductFieldVelocityJson`), animated over the globe.

**Done when.** A weather product renders, animates through a loop, and shows a correct legend; wind
renders as barbs, as a speed raster, and as animated particles. Playwright captures an animated
overlay and the wind particles.

**Commit.** `009: Raster Products & Wind`;
`completion-reports/009-CR-Raster-Products-And-Wind.md` (hash + mockup comparison + owner questions).
