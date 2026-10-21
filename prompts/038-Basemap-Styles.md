# 038 — Basemap Styles (Map / Satellite) with zoom hand-off

**Goal.** Match Shadowbroker's basemap structure: a **Map / Satellite** selector; as the user zooms
in, the NASA Blue/Black Marble globe hands off to **detailed** tiles — a **keyless OSM street map** in
Map mode, **Esri World Imagery** in Satellite mode. NASA Marble stays the overview at low zoom (it is
sharp there); the detailed source takes over past a zoom threshold (where Marble blurs).

**Read first.** 005-CR (basemap + adaptive-MSAA zoom threshold), 006-CR (attribution plumbing),
037-CR; [Architecture.md](../docs/Architecture.md) §5. Reference for the sources only — Shadowbroker's
`components/map/styles/mapStyles.ts` (do **not** copy its code; write our own Cesium providers).

**What Shadowbroker does, and the one forced difference.** Shadowbroker is MapLibre, so its keyless
default is **OpenFreeMap vector** styles (`tiles.openfreemap.org/styles/dark`), with CARTO raster kept
only as an **opt-in path when a `CARTO_API_KEY` is configured** (unkeyed CARTO returns an "API KEY
REQUIRED" tile — do **not** use CARTO without a key). **We are Cesium**, which draws **raster** imagery
layers, not MapLibre vector styles — OpenFreeMap's vector tiles do not drop into a Cesium imagery
provider, and bridging vector→Cesium is out of scope. So the keyless Map source here is **OSM raster**
(the Cesium-native equivalent of Shadowbroker's keyless OSM map). The structure is identical:
keyless map by default, CARTO only with a key, Esri satellite.

**Tile sources (Cesium imagery providers — verify the exact constructor against the pinned Cesium).**
- **Map, keyless default — OSM raster:** Cesium's built-in OpenStreetMap imagery provider, tile URL
  `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Attribution "© OpenStreetMap contributors".
- **Map, keyed upgrade (optional) — CARTO raster:** only if `VITE_CARTO_KEY` is set, use
  `https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{@2x}.png?key=…` (subdomains
  `a,b,c,d`; `@2x` where `devicePixelRatio ≥ 2`). Attribution "© OpenStreetMap contributors, © CARTO".
  **No key → OSM raster above; never request CARTO unkeyed.**
- **Satellite — Esri World Imagery (keyless):** `ArcGisMapServerImageryProvider.fromUrl(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer')`, or the XYZ form
  `.../World_Imagery/MapServer/tile/{z}/{y}/{x}`. Attribution "Esri, Maxar, Earthstar Geographics, and
  the GIS User Community".
- **Overview (unchanged):** the existing self-hosted NASA Blue/Black Marble day/night globe.

**Build.**
- A **basemap selector** in the map chrome (near the mode toggle): **Map** (default) and
  **Satellite**; persist the choice.
- **Zoom hand-off:** below the detail threshold (~continental/world — reuse/align with the 005
  MSAA/detail threshold) show the NASA Marble overview; above it swap in the selected detailed provider
  (OSM-or-CARTO for Map, Esri for Satellite). Switch on the zoom-threshold crossing (not per frame);
  keep the old imagery until the new tiles are in so it doesn't blink. Imagery drapes over the existing
  terrain in 3D.
- **Attribution (required, via the 006 plumbing + the About/credits page):** show the active source's
  credit (OSM, or OSM + CARTO when keyed, or the Esri credit); NASA Marble (public domain) for the
  overview.

**Match Shadowbroker.** Same structure: keyless map by default, CARTO only with a key, Esri satellite —
with OSM raster standing in for OpenFreeMap because our renderer is raster, not vector.

**Done when.** Selecting Map vs Satellite changes the detailed basemap; zooming in hands off from the
NASA overview to sharp OSM/Esri tiles (no blink); it works with **no key** (OSM + Esri, no watermark);
attributions show. Per the standing rule, **write the tests but do not run them** — compile only
(typecheck/lint/build).

**Commit.** `038: Basemap Styles`; `completion-reports/038-CR-Basemap-Styles.md` (hash + attributions +
any owner questions).
