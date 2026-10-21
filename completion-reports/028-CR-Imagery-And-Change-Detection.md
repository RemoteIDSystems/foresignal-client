# 028 — Completion Report: Imagery & Change Detection

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete) |
| Implementation commit | `7ee65bb857293bffdae4b2f29be90414a4d53f29`                                              |
| Run mode              | Unattended (owner's batch 023–036, no pausing)                                          |
| Screenshots           | None taken (compile-only run). `e2e/imagery.e2e.ts` reads screen pixels when it runs.   |
| Mock comparison       | From `design/ForeSignal_Analysis_View.png` (read in this session) and the code.         |

## Results

- **Recent Imagery** lists the imagery over the last committed view, newest first. It draws from:
  - the selected object's dossier `imagery` section (`getObjectDossier`), with stored media fetched
    as thumbnails (`getMediaThumbnail`, 256 px);
  - each enabled satellite or imagery **raster product's newest frame** (`getLatestProductFrame`),
    rendered for the view (`getProductImage`, 256 × 160);
  - each enabled **external product's** latest instant (GIBS WMTS). These tiles are client-direct,
    as the backend's catalog entry says (`cors: "*"`);
  - **STAC scenes** acquired over the view in the last seven days (`listSensors`, kind `scene`).
- **Each tile** shows its thumbnail, satellite or product, source, time in UTC, and resolution and
  band. The filters are the mock's: All, Optical, SAR, Thermal, Change Detection.
- **Full-frame viewer.** Clicking an item opens a full-window dialog with the full frame:
  - stored media through `getMedia`;
  - a product frame at 1024 × 640;
  - a 3 × 3 tile mosaic for an external product.

  Beside the frame are the item's facts. For stored media the viewer also shows the media row
  (`getMediaMeta`): type, size, role, license and expiry. It shows the provider's attribution when
  the provider requires it, and **Open object →** for a scene or dossier item.

- **Imagery Comparison** is a working before/after **swipe** between two dated frames of one
  product. You can drag on the frames, or use the slider and its arrow keys. The product, Before
  and After are selects. It opens on a daily true-color product, a week apart.
- **Change metrics and the run action:**
  - the metric tiles Building count, Disturbed area and Confidence read `—`, because the backend
    supplies none;
  - **Run Change Detection →** is disabled, and its tooltip says why: the OpenAPI has no
    change-detection operation (owner question 1).
- **Where it appears:**
  - **The Imagery tab** (`/imagery`) replaces its placeholder. It has Recent Imagery and Change
    Detection tabs; `?tab=change` opens the comparison, as the Satellite view's rail links it.
  - **The Satellite view's bottom row** is now the mock's three panels: Upcoming Passes, Recent
    Imagery, Imagery Comparison.
  - **The Global dashboard's RECENT IMAGERY panel** replaces its placeholder data. It shows the
    newest picture large, with its time and title, and a strip of six. The tabs are Recent Imagery,
    Satellite, Area Search (scenes over the view) and Video, which says the backend stores no
    video.
- **Disabled products are left out**, as the map rail already does. Locally every product is
  `disabled`, so locally all three panels say there is no imagery (see Backend observations).

## What was built

- `src/imagery/imageryView.ts` (pure):
  - bands from names (`bandOf`); the filters;
  - ISO-8601 durations; an external product's instants (default lag, floored to its period, stepped
    back by at least an hour) in its time format;
  - Web Mercator tiles and mosaics, with columns wrapping across the antimeridian;
  - resolution text; frame `/image` templates; media ids from URLs;
  - item builders for product frames, external products, scenes and dossier entries;
  - comparison frames, the default pair, the change metrics, and the Global tabs.
- `src/imagery/imageryApi.ts`:
  - `getMediaBlob`, `getMediaThumbnailBlob`, `getMediaMeta`, `getProductImageBlob`;
  - `listFrames` (`listProductFrames`), `imageryProducts`;
  - `loadRecentImagery`, which reads all four sources in parallel. One that fails is named, and the
    rest still list. A product with no frame yet (404) is left out silently.
  - `loadComparisonFrames`: external instants with no request, or a raster product's frames in the
    last 72 h.
- `src/imagery/useImageUrl.ts`: fetches media and frames through the client (which adds the token)
  as object URLs, and revokes them afterward.
- `src/imagery/useRecentImagery.ts`: `useRecentImagery`, `useComparableProducts`,
  `useComparisonFrames`.
- Components:
  - `Picture.tsx`, `RecentImagery.tsx` (`RecentImageryGrid`, `ImageryTile`);
  - `ImageryViewer.tsx`, `ImageryComparison.tsx` (with `SwipeCompare`);
  - `Imagery.module.css`.
- `src/views/imagery/ImageryView.tsx` (+ CSS). The placeholder `ImageryView` was removed from
  `screens.tsx`, and `App.tsx` passes the API and the store.
- `ui/Modal` gains `size="full"`.
- The Global `RecentImageryPanel` is rewritten, and `PLACEHOLDER_IMAGERY` is removed.
- The Satellites bottom row now has three columns. Selected Satellite spans only the top row, as in
  the mock.

## How it was checked

### Tests (written, not run)

- `imagery/imageryView.test.ts` (13):
  - bands, durations, and the instants of a daily product and a ten-minute one;
  - resolution text;
  - tiles and mosaics, including the antimeridian wrap;
  - templates and media ids; which products count;
  - each item builder, filters and order;
  - view areas; comparison frames and default pairs; labels.

  Tile numbers and meters per pixel were worked out in node in this session.

- `imagery/imageryApi.test.ts` (5):
  - the four sources merged newest first, with no request for a disabled product and a seven-day
    scene window;
  - dossier imagery plus a named failure;
  - a 404 frame left out;
  - the media, thumbnail, meta and product-image requests;
  - comparison frames for both kinds.
- `imagery/Imagery.test.tsx` (8):
  - the grid's captions, a client-fetched picture, an external tile URL and opening an item;
  - the filters and the Change Detection text;
  - the viewer with stored media and its row; a scene with no picture;
  - the comparison: default product and dates, the 3 × 3 mosaic, swipe clipping, choosing a date;
  - a raster product's frames; the metrics and the disabled run action; no product.
- `views/global/RecentImageryPanel.test.tsx` (2): the large picture and strip, opening the viewer,
  and the Satellite, Area Search and Video tabs.
- `views/imagery/ImageryView.test.tsx` (2): the default tab, and `?tab=change`.
- `views/satellites/SatellitesScreen.test.tsx` (+1): the bottom row's imagery and comparison
  regions.
- `e2e/imagery.e2e.ts` (3). The catalog, frame and scene are stand-ins, and GIBS tiles are answered
  as solid colors. The specs check:
  - **the imagery strip renders:** four items; the frame decodes (`naturalWidth` > 0); the
    Thermal filter; the full-frame viewer opens and closes on Escape;
  - **the swipe compare renders:** red (before) and green (after) shares read from a real
    screenshot; a real mouse drag to 90% moves the handle, and the red share grows;
  - the Satellite view's bottom row shows both panels;
  - no console errors in any of them.

### Checks

| Check                                                       | Result                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                         | Passed                                                                                                                                                                                                                                                                                                |
| `npm run lint`                                              | Passed                                                                                                                                                                                                                                                                                                |
| `npx prettier --check src e2e`                              | Passed                                                                                                                                                                                                                                                                                                |
| `npm run build`                                             | Passed. `index` 765.18 kB (233.40 kB gzip); `SatellitesScreen` 45.01 kB (19.10 kB gzip)                                                                                                                                                                                                               |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                                                                                                                                                                                                                                                                           |
| Guard: `test_us_english.py`                                 | 14 tests OK (172.0 s)                                                                                                                                                                                                                                                                                 |
| Guard: `check_us_english.py` over the project               | 803 hits (797 before). The six new hits are the ones in the next row                                                                                                                                                                                                                                  |
| Guard: `check_us_english.py` over the new and changed files | Six hits, all backend names, so none was changed: the media row's license field, read in `ImageryViewer.tsx:92` and keyed in `imageryFixtures.ts` (lines 14, 162); the external catalog's source id (fixtures 24, 56); and a backend product title spelled the British way (`imageryView.test.ts:52`) |

## Compared to the mock

From `design/ForeSignal_Analysis_View.png` (bottom row) against the components; no screenshot was
taken.

- **Matches:**
  - Recent Imagery with All / Optical / SAR / Thermal / Change Detection, and tiles of thumbnail,
    satellite, place or source, date and `resolution · band`;
  - Imagery Comparison with the before and after dates in the frame's corners, the round ↔ handle
    on a vertical line, the three metric tiles, and **Run Change Detection →** at the bottom right;
  - the three panels side by side under the globe.
- **Differs:**
  - **Metrics read `—`**, not `+12 (+150%)` and so on, and the run button is disabled (no backend
    operation).
  - **The comparison's title** is the product and dates in selects, not "Kharkiv Region — Facility
    Change Detection"; there is no named analysis to title it.
  - **Tiles show a source or provider** where the mock shows a place name; items carry no place.
  - **Resolution** is known for scenes and external products (≈, from the native zoom), and is `—`
    for backend frames and dossier items.
  - **The panels have no close (×) button.**

## Decisions taken (unattended run)

1. **Four sources for Recent Imagery** (dossier, product frames, external products, scenes). There
   is no list-media operation (the OpenAPI's `/v1/media` GETs are by id, plus outlets and
   providers), so "recent" means what the view and the selection can reach.
2. **Disabled products are left out**, matching the map rail.
3. **External products are drawn client-direct** from their `externalTemplate`, as the backend's
   catalog says.
   - Thumbnails are one tile at zoom 5; full frames and the comparison are a 3 × 3 mosaic at zoom 7
     (never above the native zoom).
   - The latest instant is now minus `defaultLag`, floored to the period.
   - The comparison offers 30 instants, at least an hour apart.
4. **Bands from names:** infrared, band 13, SST and temperature are Thermal; visible, true color,
   GeoColor, reflectance and MSI are Optical; SAR and Sentinel-1 are SAR. Anything else (water vapor,
   air mass, dust) is listed under All only. Product titles are shown as the backend
   writes them.
5. **Change Detection filter** lists nothing and says why.
6. **Default comparison:** a daily true-color product, a week apart; otherwise the first product,
   with its newest and oldest frames.
7. **Global tabs:**
   - Satellite is items from satellite-category products, scenes and SatDump;
   - Area Search is the scenes over the view;
   - Video says the backend stores no video. The `Media` content types are images, CZML and audio.
8. **The comparison's area** is the last committed view, in whole degrees.

## Deviations from the prompt text

- **"Showing the change metrics … supplied by the backend":** the backend supplies none, so the
  tiles read `—` with "not supplied by the backend".
- **"Run Change Detection: wire … to its backend operation":** there is none (owner question 1).
  The comparison works without it, as the prompt allows.
- **"From the dossier imagery section and `getMediaThumbnail`":** also from product frames,
  external products and scenes, so the grid has content without a selection.

## Backend observations

These come from curl and OpenAPI reads in this session:

- **No change-detection operation.** A search of `openapi/OpenAPI.json` paths, operation ids and
  summaries for `change.?detect|compare|comparison|diff` found only `compareForecasters`,
  `listSocialComparisons` and `getSocialComparison`. The only "change-detection" text in the file
  is `AnalystCursor`'s description ("Change-detection cursor of a profile").
- **No list-media operation.** The `/v1/media` GETs are `getMedia`, `getMediaThumbnail`,
  `getMediaMeta`, `listMediaOutlets`, `getMediaOutlet` and `listMediaProviders`.
- **Every product is disabled locally.** `GET /v1/products` counted 55 raster, 14 external and 5
  field products, all with `health: "disabled"`. `goes-east-vis/frames/latest` answered 404.
- **External GIBS entries** carry a `{time}` WMTS template, `timeDimension` (`P1D` /
  `YYYY-MM-DD` with lag `P1D` for VIIRS; `PT10M` / to the second with lag `PT40M` for GOES-East
  band 13), `maxNativeZoom` (9 and 6), `cors: "*"`, and an attribution with `requiredDisplay`.
- **No imagery records.** `/v1/records?kind=satdump-product`, `stac-scene` and `satellite-scene`
  answered `"items":[]`. `listSensors` with `kinds=scene,raster-product` over Texas answered raster
  products only.
- The water-vapor products' titles (`goes-east-wv8`, `goes-east-wv9`) use the British spelling.
  They are shown as the backend writes them.

## Owner questions

1. **Change detection.** Should the backend expose a change-detection operation and change metrics
   (building count, disturbed area, confidence) for a pair of frames? **Default in place: metrics
   `—`, Run Change Detection disabled with the reason; the swipe compare works on its own.**
2. **Enabling imagery locally.** Should the external catalog source and the GOES sources be enabled on the
   development backend, so the imagery panels have content there? **Default in place: disabled
   products are not used.**
3. **A recent-media listing.** Should there be a list operation for media (newest first, by area),
   so Recent Imagery can include SatDump composites without a selected object? **Default in place:
   the four sources above.**
4. **Imagery band.** Should products and scenes carry a band or sensor type, rather than the client
   reading it from names? **Default in place: read from names.**
5. **Item place names.** The mock captions tiles with a place ("Kharkiv Region"). Should imagery
   items carry one? **Default in place: the source or provider.**

Questions still open from earlier reports keep their defaults.
