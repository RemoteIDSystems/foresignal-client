# 038 — Completion Report: Basemap Styles

| Field                 | Value                                                               |
| --------------------- | ------------------------------------------------------------------- |
| Status                | Code-complete; compile-only (tests written, not run)                |
| Implementation commit | `ca1a8b1370f0a8b21bb1bc9c76ee174ab1f3b683`                          |
| Run mode              | Attended; the owner asked for 038 on 2026-10-21                     |
| Prompt revision       | Built to the revised prompt (`8ced905`): keyless OSM raster for Map |
| Screenshots           | None taken (compile-only run).                                      |
| Mock comparison       | The mocks show no basemap toggle; see "Compared to the mock".       |

## How the prompt changed during the run

The first prompt (`ba28de2`) said Map mode should draw CARTO with no key, "same as Shadowbroker".
Before writing code this was checked on 2026-10-21 (21:52 UTC), and it does not hold:

- **Unkeyed CARTO is a placeholder.** Every unkeyed CARTO raster tile requested came back as the
  same "API KEY REQUIRED · carto.com/basemaps/apikey" image:
  - `rastertiles/dark_all` at z0, z3 and z12, 2,513 B each, md5 `df9307c7…`;
  - `light_all` and `voyager`: a 2,049 B light placeholder.
- **Shadowbroker does not use unkeyed CARTO either.** Its `components/map/styles/mapStyles.ts`
  says unkeyed CARTO shows that watermark. With no key it uses OpenFreeMap _vector_ styles, and
  CARTO raster only with a configured key.

The owner revised the prompt (`8ced905`): with no key, Map draws OSM raster through Cesium's
OpenStreetMap provider. CARTO is used only with `VITE_CARTO_KEY`. Satellite stays Esri. This build
follows the revision.

The keyless sources were checked the same way on 2026-10-21:

- `https://tile.openstreetmap.org/12/655/1583.png` → 200, `image/png`, 30,018 B, a San Francisco
  street map.
- `…/World_Imagery/MapServer/tile/12/1583/655` → 200, `image/jpeg`, 15,857 B, San Francisco
  imagery.
- The service's metadata (`?f=json`) gives 256 px Web Mercator tiles (wkid 3857), 24 levels (0–23).

## Results

- **A Map / Satellite toggle** sits in the HUD, left of the 2D Map / 3D Globe toggle, in the same
  pill style (`role="tablist"`, "Basemap").
  - Map is the default.
  - The pick is shared by every map on the page.
  - The browser remembers the pick (`localStorage` `foresignal.basemapStyle`); an unknown stored
    value falls back to Map.
- **The zoom hand-off** reuses 005's adaptive-MSAA overview zoom (`msaa.ts`), dead band included:
  - the detailed basemap shows from map zoom **4.5** (`DETAIL_FROM_ZOOM`);
  - the NASA overview returns below zoom **4** (`OVERVIEW_BELOW_ZOOM`);
  - between 4 and 4.5 it keeps whatever it has.

  The zoom is read when the camera moves (`changed`, `moveEnd`) and after a 2D/3D morph. Layers
  change only at the crossing, not every frame.

- **The detailed sources** (`detailSourceFor`):

  | Pick      | No key                                                                | `VITE_CARTO_KEY` set                                                                |
  | --------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
  | Map       | OSM raster (`OpenStreetMapImageryProvider`, `tile.openstreetmap.org`) | CARTO `rastertiles/dark_all`, `{s}` = a–d, `@2x` at `devicePixelRatio ≥ 2`, `?key=` |
  | Satellite | Esri World Imagery (XYZ `…/tile/{z}/{y}/{x}`)                         | the same                                                                            |
  - CARTO is never asked without a key: `createDetailProvider('carto')` throws without one.
  - A blank key counts as no key.
  - Every detailed source stops at level 19 (`DETAIL_MAX_LEVEL`), OSM's last level; Cesium
    stretches level 19 closer in.

- **No blink, three ways:**
  1. **Zooming in.** The NASA overview layers stay on the globe at every zoom, so they are loaded
     under the detailed layer. Until a detailed tile arrives, Cesium draws the overview through it.
  2. **Zooming out.** The detailed layer is hidden, not removed, and the overview under it is
     already drawn.
  3. **Map ↔ Satellite while zoomed in.** The new layer goes on above the old one. The old one is
     removed once the globe's tile-load queue reaches 0 (`Globe.tileLoadProgressEvent`), or after
     10 s at most (`SWAP_TIMEOUT_MS`), in case a source never answers.
- **Layer order.** Detailed layers go right above the Black Marble night layer. They sit under
  product overlays and records, so 009's rasters stay on top. In 3D the imagery drapes over the
  ETOPO terrain like the overview.
- **Attribution on the map.** The attribution line now always starts with the basemap shown:

  | Shown         | Credit on the map                                                |
  | ------------- | ---------------------------------------------------------------- |
  | NASA overview | "NASA Blue Marble, Black Marble"                                 |
  | OSM           | "© OpenStreetMap contributors"                                   |
  | CARTO (keyed) | "© OpenStreetMap contributors, © CARTO"                          |
  | Esri          | "Esri, Maxar, Earthstar Geographics, and the GIS User Community" |

  The backend's required attributions and the products' follow it as before. Each credit links to
  its provider's page:
  - OSM: `openstreetmap.org/copyright`;
  - CARTO: `carto.com/attribution`;
  - Esri: the World Imagery item page on `arcgis.com`.

  All three links were checked with HTTP 200 on 2026-10-21.

- **About and credits** lists OSM, CARTO and Esri World Imagery under "Imagery and terrain", after
  the NASA and NOAA entries.
- **`data-basemap`** (`map` / `satellite`) and **`data-basemap-detail`** (`overview` / `osm` /
  `carto` / `esri`) on the map region say what is drawn, for the e2e checks.

## What was built

- **`src/map/basemapStyle.ts`:**
  - styles and sources;
  - `detailSourceFor`, `cartoKey`, `cartoTemplate`, `detailForZoom`;
  - `createDetailProvider` / `createDetailLayer`;
  - `DETAIL_ATTRIBUTIONS`, `OVERVIEW_ATTRIBUTION`;
  - the remembered pick (`basemapStyleStore`).
- **`src/map/basemapHandOff.ts`:** `BasemapHandOff`, the crossing and the blink-free swap.
- **`src/map/Basemap.tsx`:** adds the NASA base layers (moved here from `SceneBridge`) and runs
  the hand-off inside the Resium viewer.
- **`src/map/Viewer.tsx`:**
  - mounts `Basemap`;
  - passes the pick and its setter to the HUD and the shown source's credit to the attribution;
  - adds the two data attributes.
- **`src/map/MapHud.tsx` / `.module.css`:** the basemap toggle. The two toggles share one
  top-right flex row (`.toggles`, which replaces `.sceneToggle`).
- **`src/map/style/attribution.tsx`:** a `basemap` credit, shown first whatever its
  `requiredDisplay`, and not repeated if the backend gives the same text.
- **`src/app/credits.ts`:** three data credits.
- **`src/vite-env.d.ts`:** `VITE_CARTO_KEY`.

## How it was checked

### Tests (written, not run)

- **`map/basemapStyle.test.ts` (new, 11):**
  - OSM without a key, a blank key included, and never CARTO;
  - CARTO only with a key;
  - Esri for satellite;
  - the CARTO template: key encoding and `@2x` by pixel ratio;
  - each provider's URL, maximum level and credit; CARTO refused without a key;
  - the attributions;
  - the hand-off dead band, against the MSAA constants;
  - the remembered pick, with its fallback and listeners.
- **`map/basemapHandOff.test.ts` (new, 9),** against a real `ImageryLayerCollection` with Cesium
  `Event`s:
  - nothing asked at world zoom;
  - the hand-off puts the layer right above the night layer, under an existing product layer;
  - the overview stays under the detailed layer; zooming out hides the layer and zooming back in
    reuses it;
  - the switch happens once per crossing;
  - a source swap keeps the old layer until the load queue reaches 0, then destroys it;
  - the swap timeout;
  - a source change while on the overview;
  - a morph is waited out;
  - `destroy` removes every layer and listener.
- **`map/MapHud.test.tsx` (2 new):** no toggle unless given one; the toggle shows the pick and
  reports a new one.
- **`map/style/attribution.test.tsx` (2 new):** the basemap credit leads, whatever its license
  says; it is not repeated.
- **`app/App.test.tsx` (extended):** About credits OSM, CARTO and Esri.
- **`e2e/basemap.e2e.ts` (new, 2), against the real tile servers:**
  1. **World, then a city, then World again.**
     - At world zoom: overview only, NASA credit, no external tile request.
     - At San Francisco from 40 km: `osm` with its credit, and real OSM image responses. No
       request to `cartocdn.com` at all.
     - Back at world zoom: the overview again.
  2. **Satellite while zoomed in.**
     - The map shows `esri` with its credit, and real Esri image responses.
     - The OSM layer is gone afterwards.
     - At every animation frame of the swap, at least one detailed layer is shown.
     - The pick survives a reload.

### Checks

| Check                                                       | Result                                                                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                         | Passed                                                                                                           |
| `npm run lint`                                              | Passed                                                                                                           |
| `npx prettier --check src e2e scripts`                      | Passed                                                                                                           |
| `npm run build`                                             | Passed. `index` 902.29 kB (271.94 kB gzip)                                                                       |
| `npm run verify:dist`                                       | "✓ dist is ready to deploy."                                                                                     |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                                                                                      |
| Guard: `test_us_english.py`                                 | OK (2 min 57 s)                                                                                                  |
| Guard: `check_us_english.py` over the new and changed files | 15 hits, all `licence`, the OpenAPI `Attribution.licence` wire key (`schema.ts:21159`): left as is, per the rule |

The 15 `licence` hits:

- **New in this pass (5):**
  - the four `licence:` fields in `basemapStyle.ts:55,61,67,79`;
  - one in the new attribution test (`attribution.test.tsx:127`).
- **Already present (10):** in `attribution.test.tsx` and `App.test.tsx`.

The field name is the backend's and crosses the wire, so it is not renamed.

## Compared to the mock

The mocks show only the 2D Map / 3D Globe pill at top right and no basemap choice. The new Map /
Satellite pill uses the same pill style and sits beside it, on the same row. Every mock is drawn at
the world or continental overview, which is still the NASA Marble globe, so they match as before.

## Decisions taken

1. **The hand-off zoom is the MSAA overview zoom** (detail at 4.5, overview below 4), as the
   prompt asked.
   - Blue Marble is sharp to about Web Mercator zoom 6: level 5 is 16,384 px across.
   - So the handoff is earlier than Marble needs, and detailed tiles already show at continental
     scale.
2. **Esri through its XYZ template**, not `ArcGisMapServerImageryProvider.fromUrl`. `fromUrl`
   fetches the service's metadata before any tile, and is asynchronous. The XYZ form needs neither.
   The metadata's tiling (256 px, Web Mercator) was checked to match the template's defaults.
3. **The NASA overview is credited on the map too**, although its license asks for nothing, as the
   prompt lists it with the others.
4. **One top-right row for both toggles**, so neither covers the other at any width.

## Owner questions

1. **The Esri credit text.** The prompt gives "Esri, **Maxar**, Earthstar Geographics, and the GIS
   User Community". The service itself now says "Esri, **Vantor**, Earthstar Geographics, and the
   GIS User Community": its `copyrightText` and the item's `accessInformation`, read on
   2026-10-21. Which should the map show? **Default in place: the prompt's text.** It is one
   constant (`DETAIL_ATTRIBUTIONS.esri`) plus one in `credits.ts`.
2. **OpenStreetMap's tile usage policy.** `tile.openstreetmap.org` is run by volunteers. Its policy
   welcomes light use, but not heavy app traffic, and asks for a correct Referer. Should production
   keep OSM's own server as the keyless default, or should production builds set `VITE_CARTO_KEY`?
   **Default in place: OSM keyless, CARTO with a key, as the revised prompt says.**
3. **Architecture §5 now disagrees with the code.** It says "No Cesium Ion, no account, no external
   tile service", and the basemap now fetches tiles from OSM, CARTO and Esri. Should §5 change, or
   the code? The document was not edited.
4. **The analysis Map tab's `sharpBasemap` limit** still stops the camera where the NASA Marble
   would blur, about zoom 6–7. Detailed tiles show there from 4.5, but that tab cannot zoom
   closer. Lift it now that a sharp basemap exists? **Default in place: unchanged.**
5. **`VITE_CARTO_KEY` is in `vite-env.d.ts` and this report only.** `docs/Deploy.md` does not
   mention it. Should it?

Questions still open from earlier reports keep their defaults.
