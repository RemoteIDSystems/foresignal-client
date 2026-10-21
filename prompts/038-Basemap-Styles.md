# 038 — Basemap Styles (Map / Satellite) with zoom hand-off

**Goal.** Match Shadowbroker: a **Map / Satellite** basemap selector, and as the user zooms in the
NASA Blue/Black Marble globe hands off to **detailed** tiles — CARTO (OSM-rendered street map) in
Map mode, **Esri World Imagery** in Satellite mode. NASA Marble stays the overview at low zoom (it is
sharp there); the detailed source takes over past a zoom threshold (where Marble blurs).

**Read first.** 005-CR (basemap + adaptive-MSAA zoom threshold), 037-CR; [Architecture.md](../docs/Architecture.md)
§5. Reference for the sources only — Shadowbroker's `components/map/styles/mapStyles.ts`,
`hooks/useBasemapConfig.ts` (do **not** copy its code; write our own Cesium providers).

**Tile sources (Cesium `UrlTemplateImageryProvider` / `ArcGisMapServerImageryProvider`).**
- **Map (CARTO raster, OSM-rendered):**
  `https://{s}.basemaps.cartocdn.com/rastertiles/{style}/{z}/{x}/{y}{@2x}.png` — subdomains `a,b,c,d`;
  `style` defaults to **`dark_all`** (matches the dark UI; `voyager` and `light_all` are alternates).
  The CARTO key is **optional**: append `?key=…` only if `VITE_CARTO_KEY` (or a backend
  `basemap-config`) provides one, and **fail open to unkeyed** (works at low volume) — same as
  Shadowbroker.
- **Satellite (Esri World Imagery):** `ArcGisMapServerImageryProvider.fromUrl(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer')`, or the XYZ form
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`.
- **Overview (unchanged):** the existing self-hosted NASA Blue/Black Marble day/night globe.

**Build.**
- A **basemap selector** in the map chrome (near the mode toggle): **Map** (default) and
  **Satellite**; persist the choice.
- **Zoom hand-off:** below the detail threshold (~continental/world — reuse/align with the 005
  MSAA/detail threshold) show the NASA Marble overview; above it swap in the selected detailed
  provider (CARTO or Esri). Switch on the zoom-threshold crossing (not per frame); keep the old
  imagery until the new tiles are in so it doesn't blink. Imagery drapes over the existing terrain in
  3D; retina `@2x` where `devicePixelRatio ≥ 2`.
- **Attribution (required, via the 006 attribution plumbing + the About/credits page):** CARTO
  "© CARTO, © OpenStreetMap contributors"; Esri World Imagery "Esri, Maxar, Earthstar Geographics,
  and the GIS User Community"; NASA Marble (public domain).

**Match the mock / Shadowbroker.** Same sources and the keyless fail-open behavior; the selector and
hand-off behave like Shadowbroker's map/satellite switch.

**Done when.** Selecting Map vs Satellite changes the detailed basemap; zooming in hands off from the
NASA overview to sharp CARTO/Esri tiles (no blink); it works with **no key**; attributions show.
Per the standing rule, **write the tests but do not run them** — compile only (typecheck/lint/build).

**Commit.** `038: Basemap Styles`; `completion-reports/038-CR-Basemap-Styles.md` (hash + attributions +
any owner questions).
