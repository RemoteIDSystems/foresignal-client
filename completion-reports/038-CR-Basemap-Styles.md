# 038 — Completion Report: Basemap Styles

| Field                 | Value                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Status                | **Approved by the owner on 2026-10-21**, with five answers applied in the fixup. Compile-only (tests written, not run). |
| Implementation commit | `ca1a8b1370f0a8b21bb1bc9c76ee174ab1f3b683`                                                                              |
| Fixup commit          | `b14860b55a8b4d1e12860c891a03fec0ba53e878` (the owner's review answers, below)                                          |
| Run mode              | Attended; the owner asked for 038 on 2026-10-21. It is the last prompt in the sequence.                                 |
| Prompt revision       | Built to the revised prompt (`8ced905`): keyless OSM raster for Map                                                     |
| Screenshots           | None taken (compile-only run).                                                                                          |
| Mock comparison       | The mocks show no basemap toggle; see "Compared to the mock".                                                           |

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
- The Esri service's metadata (`?f=json`, read again at 22:23 UTC) gives:
  - 256 px Web Mercator tiles (wkid 102100 / 3857);
  - 24 levels (0–23);
  - `copyrightText` "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community".

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

  | Pick      | No key                                                                         | `VITE_CARTO_KEY` set                                                                |
  | --------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
  | Map       | OSM raster (`OpenStreetMapImageryProvider`, `tile.openstreetmap.org`), to z19  | CARTO `rastertiles/dark_all`, `{s}` = a–d, `@2x` at `devicePixelRatio ≥ 2`, `?key=` |
  | Satellite | Esri World Imagery (`ArcGisMapServerImageryProvider.fromUrl`, the service URL) | the same                                                                            |
  - CARTO is never asked without a key: `createDetailProvider('carto')` throws without one.
  - A blank key counts as no key.
  - **Deepest levels** (`DETAIL_MAX_LEVELS`):
    - OSM: 19.
    - CARTO: held to 19, as it draws the same OSM data. This was not checked against CARTO,
      since no key was available.
    - Esri: whatever its service declares (24 levels when read). 23 is the default until the
      metadata is read.
  - **Esri's layer** is made at once (`ImageryLayer.fromProviderAsync`) and draws once the
    service's metadata is in. Until then, and if the metadata fails, the overview shows through.

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
- **Attribution on the map.** The attribution line always starts with the basemap shown:

  | Shown         | Credit on the map                                                                                                                         |
  | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
  | NASA overview | "NASA Blue Marble, Black Marble"                                                                                                          |
  | OSM           | "© OpenStreetMap contributors"                                                                                                            |
  | CARTO (keyed) | "© OpenStreetMap contributors, © CARTO"                                                                                                   |
  | Esri          | **The service's own `copyrightText`**, read live; on 2026-10-21 "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community" |

  Before Esri's metadata is read, the credit is the fallback "Esri, Vantor, Earthstar Geographics,
  and the GIS User Community". That is the live wording, without the service's "Source: " prefix.
  The backend's required attributions and the products' follow as before. Each credit links to its
  provider's page:
  - OSM: `openstreetmap.org/copyright`;
  - CARTO: `carto.com/attribution`;
  - Esri: the World Imagery item page on `arcgis.com`.

  All three links were checked with HTTP 200 on 2026-10-21.

- **The analysis Map tab's zoom cap is lifted** to the detailed basemap's deepest level.
  `sharpBasemap` still stops the camera where the basemap would be drawn at more than twice its
  resolution, but it now measures that from the shown detailed source's deepest level, not
  the NASA overview's level 5:
  - **OSM level 19:** about 215 m of span across a 1,438 px canvas. Before, the limit was about
    1,759 km.
  - **Esri:** its service's deepest level once read.
- **About and credits** lists OSM, CARTO and Esri World Imagery under "Imagery and terrain", after
  the NASA and NOAA entries. Esri's entry uses the live wording above.
- **`data-basemap`** (`map` / `satellite`) and **`data-basemap-detail`** (`overview` / `osm` /
  `carto` / `esri`) on the map region say what is drawn, for the e2e checks.

## The owner's review answers (fixup `b14860b`)

1. **Esri credit: the service's own `copyrightText`.**
   - Esri is now made with `ArcGisMapServerImageryProvider.fromUrl`, so Cesium reads the
     service's metadata. Its `copyrightText` becomes the provider's credit
     (`@cesium/engine` `ArcGisMapServerImageryProvider.js:224–228`), and the map shows it
     (`describeShown`).
   - The service's deepest level comes from the same metadata (`:155`).
   - The constant kept for the About page and the fallback is the live wording, "Esri, Vantor,
     Earthstar Geographics, and the GIS User Community". It was verified against the service at
     22:23 UTC.
2. **OSM policy: no change.** Keyless OSM stays the default; CARTO stays optional.
3. **Architecture §5:** "No Cesium Ion, no account, no external tile service." is replaced. It
   now says:
   - no Cesium Ion and no account;
   - the low-zoom overview is self-hosted (NASA Marble imagery and the terrain);
   - zooming in hands off to keyless external tile services, OSM raster (Map) and Esri World
     Imagery (Satellite), with CARTO as an optional keyed alternative for Map (prompt 038).
4. **The Map tab's zoom cap** is lifted to the detailed sources' native deepest levels (above).
   The hand-off threshold stays at 4 / 4.5.
5. **`docs/Deploy.md`** has a new section, "Basemap tiles and the optional CARTO key":
   - `VITE_CARTO_KEY` is the optional CARTO key, set at build time;
   - OSM is the keyless default when it is unset, and CARTO is never asked without a key;
   - the key is compiled into the bundle and sent with CARTO tile requests. `verify:dist`'s secret
     patterns (`scripts/release/verify.mjs:19–22`: `fs?_…` tokens, private keys, bearer headers)
     do not flag such a key.

## What was built

- **`src/map/basemapStyle.ts`:**
  - styles and sources;
  - `detailSourceFor`, `cartoKey`, `cartoTemplate`, `detailForZoom`;
  - `createDetailProvider` / `createDetailLayer`; Esri comes asynchronously from its service;
  - `DETAIL_MAX_LEVELS`, `detailMetersPerPixel`;
  - `describeShown`: the shown source's live credit and deepest level;
  - `DETAIL_ATTRIBUTIONS`, `OVERVIEW_ATTRIBUTION`;
  - the remembered pick (`basemapStyleStore`).
- **`src/map/basemapHandOff.ts`:** `BasemapHandOff`, the crossing and the blink-free swap. It
  reports the shown source and its layer.
- **`src/map/Basemap.tsx`:**
  - adds the NASA base layers (moved here from `SceneBridge`) and runs the hand-off inside the
    Resium viewer;
  - reports the shown basemap, and reports it again once its layer is ready.
- **`src/map/Viewer.tsx`:**
  - mounts `Basemap`;
  - passes the pick and its setter to the HUD and the shown basemap's credit to the attribution;
  - takes `sharpBasemap`'s limit from the shown basemap's deepest level;
  - adds the two data attributes.
- **`src/map/view.ts`:** `sharpestDistance` / `sharpestDistanceOf` take the basemap's meters per
  pixel.
- **`src/map/MapHud.tsx` / `.module.css`:** the basemap toggle. The two toggles share one
  top-right flex row (`.toggles`, which replaces `.sceneToggle`).
- **`src/map/style/attribution.tsx`:** a `basemap` credit, shown first whatever its
  `requiredDisplay`, and not repeated if the backend gives the same text.
- **`src/app/credits.ts`:** three data credits.
- **`src/vite-env.d.ts`:** `VITE_CARTO_KEY`.
- **`docs/Architecture.md` §5, `docs/Deploy.md`:** as above.

## How it was checked

### Tests (written, not run)

- **`map/basemapStyle.test.ts` (new, 15):**
  - OSM without a key, a blank key included, and never CARTO;
  - CARTO only with a key;
  - Esri for satellite;
  - the CARTO template: key encoding and `@2x` by pixel ratio;
  - each provider:
    - OSM and CARTO: URL, deepest level and credit;
    - CARTO refused without a key;
    - Esri made from its service URL through `fromUrl` (spied, no network), as a layer at once;
  - `describeShown`: the service's credit and deepest level once ready, the fallback before;
  - `detailMetersPerPixel`;
  - the attributions, Esri's fallback being the Vantor wording;
  - the hand-off dead band, against the MSAA constants;
  - the remembered pick, with its fallback and listeners.
- **`map/basemapHandOff.test.ts` (new, 9),** against a real `ImageryLayerCollection` with Cesium
  `Event`s and stand-in layers (no network):
  - nothing asked at world zoom;
  - the hand-off puts the layer right above the night layer, under an existing product layer;
  - the overview stays under the detailed layer; zooming out hides the layer and zooming back in
    reuses it;
  - the switch happens once per crossing;
  - a source swap keeps the old layer until the load queue reaches 0, then destroys it;
  - the swap timeout;
  - a source change while on the overview;
  - a morph is waited out;
  - `destroy` removes every layer and listener;
  - `onShown` carries the shown layer.
- **`map/view.test.ts` (1 new, 2 adjusted):** the limit at OSM's level 19 (about 215 m) and
  closer at Esri's 23. The existing checks now pass the meters per pixel.
- **`map/MapHud.test.tsx` (2 new):** no toggle unless given one; the toggle shows the pick and
  reports a new one.
- **`map/style/attribution.test.tsx` (2 new):** the basemap credit leads, whatever its license
  says; it is not repeated.
- **`app/App.test.tsx` (extended):** About credits OSM, CARTO and Esri (Vantor wording).
- **`e2e/basemap.e2e.ts` (new, 2), against the real tile servers:**
  1. **World, then a city, then World again.**
     - At world zoom: overview only, NASA credit, no external tile request.
     - At San Francisco from 40 km: `osm` with its credit, and real OSM image responses. No
       request to `cartocdn.com` at all.
     - Back at world zoom: the overview again.
  2. **Satellite while zoomed in.**
     - The map shows `esri` with the service's live credit ("Esri, Vantor, …"), and real Esri
       image responses.
     - The OSM layer is gone afterwards.
     - At every animation frame of the swap, at least one detailed layer is shown.
     - The pick survives a reload.
- **`e2e/analysis.e2e.ts` (adjusted):** the Map tab's limit is now under 1 km, the OSM level-19
  limit. Before, it was over 1,000 km.

### Checks (after the fixup)

| Check                                                       | Result                                                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                         | Passed                                                                                                          |
| `npm run lint`                                              | Passed                                                                                                          |
| `npx prettier --check src e2e scripts`                      | Passed                                                                                                          |
| `npm run build`                                             | Passed. `index` 902.92 kB (272.15 kB gzip)                                                                      |
| `npm run verify:dist`                                       | "✓ dist is ready to deploy."                                                                                    |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                                                                                     |
| Guard: `test_us_english.py`                                 | 14 tests OK (169.7 s)                                                                                           |
| Guard: `check_us_english.py` over the fixup's changed files | 6 hits, all `licence`, the OpenAPI `Attribution.licence` wire key (`schema.ts:21159`): left as is, per the rule |

The 6 `licence` hits:

- the four `licence:` fields in `basemapStyle.ts:78,84,90,102`, the attribution entries;
- two in `App.test.tsx:214,219`, which were already there.

The implementation commit also had one in `attribution.test.tsx:127`. The field name is the
backend's and crosses the wire, so it is not renamed.

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
2. **Esri through its map service** (`fromUrl`, since the fixup). This replaced the XYZ template,
   so the service's own credit and deepest level are used.
3. **The NASA overview is credited on the map too**, although its license asks for nothing, as the
   prompt lists it with the others.
4. **One top-right row for both toggles**, so neither covers the other at any width.
5. **The service's credit is shown verbatim**, its "Source: " prefix included, as the owner asked
   for the service's own text. The About page and the fallback carry the owner's wording,
   without the prefix.

## Owner questions

None open from this prompt; the five from review were answered and applied above.

Questions still open from earlier reports keep their defaults.
