# 009 — Completion Report: Raster Products And Wind

| Field                 | Value                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------- |
| Status                | Complete, proven on **stand-in frames** (every live product is disabled; see below)    |
| Implementation commit | `e5c3ae9cd37d0fc420a46feee51ebc4479e121a7`                                             |
| Run mode              | Unattended (owner's batch 007–010, no review gates)                                    |
| Weather products, 2D  | `review/009-weather-products-2d.png` (**stand-in data**, labeled)                      |
| Loop, three frames    | `review/009-weather-loop-frames.png` (**stand-in data**)                               |
| Wind, 2D and 3D       | `review/009-wind-2d.png`, `review/009-wind-3d.png` (**stand-in data**, labeled)        |
| Wind particles        | `review/009-wind-particles-2d.png` (**stand-in data**, labeled)                        |
| Mock comparison       | `review/009-vs-tropical-storm-mock.png` (Tropical-Storm mock map beside the built map) |

## The live backend has no product to draw

`GET /v1/products?limit=500` lists 74 products: 55 raster, 14 external, 5 field. **All 74 have
health `disabled`, reason "source disabled".** `GET /v1/products/mrms-reflectivity/frames/latest`
answers 404 UNKNOWN_FRAME, "Product mrms-reflectivity has no frame yet." The legends do answer
(`/v1/products/gfs/legend` gives 200).

So nothing in this pass could be drawn from live frames. It was built to the OpenAPI document and
proven with Playwright routes (`e2e/products-support.ts`):

- **What is intercepted.** The catalog's health for three products (`goes-east-ir`,
  `mrms-reflectivity`, `gfs`), and their latest frame, tiles, loop, loop images, wind vector
  tiles, field manifest and png-uv.
- **What is made up.** A tropical storm at 28.4° N, 76.5° W (where the Tropical-Storm mock puts
  Florence): its spiral radar bands, its cloud shield, and a vortex of winds on trades and
  westerlies.
- **What is real.** Everything else comes from the backend. That includes the legends, and the
  stand-in tiles are painted with the live legend stops.

Every screenshot says so in a red banner.

## What was built

### Products as imagery layers (`src/map/products/`)

- **`productApi.ts`** covers the product endpoints. Each uses the generated OpenAPI types:
  - `loadProducts`: all pages of `listProducts`.
  - `loadLatestFrame`: `getLatestProductFrame`, the newest frame.
  - `loadLegend`: `getProductLegend`, in metric units.
  - `loadLoop`: `getProductLoop`, the animation loop.
  - `fetchProductTile`: `getProductTile`, one tile.
  - `fetchLoopImage`: `getProductImage`, one loop frame.
  - `fetchWindTile`: `getProductVectorTile`, one wind vector tile.
  - `loadFieldManifest`: `getProductFieldManifest`, the wind field's manifest.
  - `fetchFieldPng`: `getProductFieldPngUv`, the wind field as png-uv.
- **Frame URLs are parsed, not fetched as they are.** A frame's expanded tile template, a loop's
  `/image` URL and a manifest's png-uv URL are read into the operation's path and query.
  - The host is ignored, so every request goes through the API client. It carries the
    credentials and is retried on 429 and on 503 RENDER_BUSY (002).
  - **A template whose frame key is `latest` or `now` is refused.**
- **The latest frame is resolved once, then drawn by its own key.** `latest` is asked for once,
  and the map draws the concrete `{timeKey}~{sha8}` frame it names.
  - It polls every half cadence, at most a minute, the backend's own max-age for `latest`. 011
    replaces this polling with the stream.
  - A new frame key adds a new layer over the old one, and the old one is removed 3 s later, so
    nothing blinks.
- **`ProductTileProvider` is a Cesium `ImageryProvider`** of 256-pixel WebMercatorQuad tiles:
  - levels within the product's `minZoom`..`maxZoom`; Cesium magnifies the deepest level;
  - the frame's bounds;
  - at most 8 requests in flight.
  - Opacity is `render.defaultOpacity`, else 0.7, translucent over the basemap.
- **Product layers are drawn under the records.** Rasters are imagery layers above the Blue and
  Black Marble base; records are primitives and draw on top.

### Loops (`getProductLoop`)

- **The loop control is in the product's legend block.** Play or pause, with "Frame n of N" and
  the frame's time.
- **One loop request per view.**
  - The request covers the committed viewport (008), clipped at the antimeridian.
  - It asks for 24 frames, at the canvas width capped at 1024.
  - A new viewport loads a new loop.
- **Frames come through the client.** Frames past `expiresAt` are dropped on arrival and as the
  loop plays.
  - Each image is **re-projected from Web Mercator to latitude/longitude** (`loopImage.ts`), the
    projection Cesium drapes a single image in. Each frame is then one imagery layer.
- **Frames are preloaded.** Every frame layer is shown at alpha 0, so Cesium loads all the
  textures and draws only the current one.
  - A frame shows for 0.5 s, and the newest holds for 2 s.
  - The newest frame's tiles hide while the loop plays, and come back when it stops.

### Legends and attribution

- **`ProductLegends` sits at the top of the map legend panel** (006), one block per product on the
  map, built from the JSON legend:
  - **continuous:** a gradient with stops placed by value, and its ticks;
  - **discrete:** one band per stop;
  - **categorical:** labeled chips;
  - **always:** units, the plain-language meanings in the bar's tooltip, and the frame time in UTC.
  - **A wind field adds** its barb key (5, 10, 25, 50, 65 kt) and a line on the particles.
- **`MapAttribution` takes the products' own structured attributions.** It shows them after the
  backend's, filtered by `requiredDisplay` as before.

### Wind

- **Speed raster.** It is the field product's own raster (`render.defaultStyle` `wind-speed@1`),
  drawn by the same `ProductRasterLayer` as any raster.
- **Barbs** (`WindBarbLayer`) come from `getProductVectorTile` (layer `wind`), and follow the view:
  - Tiles are at the view's zoom, clamped to the product's range, at most 32.
  - **Glyphs.** One billboard per point. The glyph is drawn per 5-kt `barbKt`: calm circle, half
    barb, full barbs, 50-kt pennants, white with a dark halo.
  - **Rotation.** Each barb is rotated by `fromDeg` and north-aligned, so it turns with the map.
- **Particles** (`WindParticleLayer`, `ParticleSystem`):
  - **The field.** It comes from the frame's manifest (run pinned to the frame's), then its png-uv
    encoding, decoded and sampled bilinearly. A full-circle 0..359 grid wraps.
  - **Motion.** 1,200 particles are advected on the CPU at 5 screen pixels per second per m/s, so
    the flow looks the same at every zoom. Each lives 40–110 frames.
  - **Trails.** A point is fixed every 1/15 s, so trail length does not depend on frame rate.
  - **Drawing.**
    - Each trail is a polyline in one `PolylineCollection`, all sharing one white material.
    - In 3D they are drawn at 12 km, so the raised relief does not hide them.
- **Facets.** In the rail, a wind field offers Speed, Barbs and Particles separately. Its checkbox
  turns on Speed and Particles.

### The rail

- **Where products are listed.** Products sit under the category they belong to (Weather: radar,
  satellite, models, lightning; Imagery: `imagery`), after its kinds, under "Products", grouped by
  their own category.
- **Products that cannot be drawn.** A disabled product is folded under "N unavailable", with its
  reason. Live, that is all 60 non-external products.
- **On at first:** `goes-east-ir` and `mrms-reflectivity` (`src/lib/productCategories.ts`), when they
  can be drawn. The mock has Weather checked, and its globe shows clouds and a storm.
- **The category checkbox** covers its kinds and its curated products. "Turn all off" turns products
  off too.

### Bugs found while checking

1. **Tiles were drawn upside down within each square.** WebGL cannot flip an `ImageBitmap` on
   upload. Cesium's own loader decodes with `imageOrientation: 'flipY'` (Cesium `Resource.js` line
   238), and the provider did not.
   - **How it showed:** the radar sat about 8° south of the storm in 2D, and north of it in 3D.
   - **How it was caught:** the loop, drawn by a separate path, put the storm in the right place.
   - **How it is guarded now:** an e2e check compares the radar's centroid from the tiles with the
     centroid from the loop. They now agree within 9 px; before the fix they were 112 px apart.
2. **Turning particles off stopped the map rendering.** The shared material was destroyed once per
   polyline, and Cesium throws from the second destroy on. The material's own `destroy` is now a
   no-op for the polylines, and the layer destroys it once. The e2e check turns particles off and
   asserts no console error.

## How it was checked

### Tests

- **Unit (`npx vitest run`): 49 files, 310 tests.**
  - New for products: 3 files, 24 tests. They cover:
    - template, image and png-uv URL parsing, including alias refusal;
    - paging, the loop query (antimeridian, width limits), tile fetch with a 503 retry;
    - poll interval, expired frames, barb parts, the Mercator row map;
    - wind field sampling and wrap, particle motion, trails and rebirth;
    - catalog entries and defaults, legend bars, the product legend component.
  - The rail test gains product rows: unavailable products folded, the category checkbox, facets.
  - The attribution test gains product attributions.
- **e2e (`npm run e2e`): 10 tests, all pass (live backend, software WebGL).** Three are new:
  1. **Defaults draw, with correct legends.** The default products draw. The radar legend has the
     live stops' 15 bands in their colors, and dBZ. A screenshot has 336 red and 794 green radar
     pixels; with the product turned off, 0 and 2.
  2. **The loop plays, from the right place.** The loop plays, 10 of 11 frames: the expired one is
     dropped. It is asked for with the committed bbox and a width ≤ 1024. The storm sits at the
     same place from tiles and loop (512,260 and 521,259). Between frames 4,295 pixels change.
  3. **Wind draws three ways.** The speed raster changes 407,410 pixels. The particles move: 87,340
     pixels differ 0.4 s apart. Barbs alone change 14,275 pixels from the bare map.

### Frame rate, wind on, home view

`E2E_GPU=1` is the AMD Radeon 780M; software is SwiftShader.

| Layers                   | GPU fps | Software fps |
| ------------------------ | ------- | ------------ |
| None                     | 60.1    | 17.8         |
| Speed raster             | 60.3    | —            |
| Speed raster + particles | 49.2    | 10.3         |

- **The first particle version ran at 24 fps on the GPU.**
- **Profiling showed one draw call per polyline**, since each had its own material.
  - Sharing one material: 35 fps.
  - 1,200 particles with 7-point trails: 49–53 fps.

### Checks

| Check                                                         | Result                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `npm run typecheck`                                           | Pass                                                                  |
| `npm run lint`                                                | Pass                                                                  |
| `npx prettier --check .`                                      | Pass                                                                  |
| `npx vitest run`                                              | 49 files, 310 tests, all pass                                         |
| `npm run e2e`                                                 | 10 tests, all pass                                                    |
| `npm run build`                                               | Pass                                                                  |
| `python3 ~/Documents/GitLab/meshdtn/style/test_us_english.py` | 14 tests, OK                                                          |
| `check_us_english.py`                                         | 796 hits: 777 in the generated schema, 19 wire names; none to correct |

The one new hit is the `Attribution` schema's license field, used as a key in the new attribution
test. It is a wire name and is left as it is.

## Compared to the mock

`review/009-vs-tropical-storm-mock.png` sets the mock's map beside the built one.

- **What matches:**
  - a translucent radar raster over the satellite basemap, in the NWS reflectivity colors, with
    the night lights showing through;
  - cloud cover over the ocean;
  - the legend beside the map.
- **The mock's storm is real imagery, close in.** The built one is a stand-in, at the Global home
  view.
- **The storm track, cone and storm card** in the mock are later prompts (019 Situations and
  014 Selection). So is the Tropical-Storm view itself (the screens route is a placeholder). This
  pass draws the products on the Global map.
- **The Global mock's globe shows clouds and a storm under its checked Weather row.** The
  defaults reproduce that when the products are healthy.

## Decisions taken (unattended run)

1. **The default products are `goes-east-ir` and `mrms-reflectivity`, when they can be drawn.**
   They are the Global mock's clouds and storm. A wind field's checkbox turns on Speed and
   Particles; Barbs are one click away.
2. **Product categories go to rail categories.** Radar, satellite, model and lightning go under
   Weather; `imagery` goes under Imagery (Recent).
3. **External products (14, GIBS and nowCOAST) are not listed.** They are drawn from a third
   party's tiles directly, and the prompt names only the backend's endpoints. See owner question 1.
4. **Loops play on request, not on their own.** The play button is in the legend block, and a loop
   covers the committed viewport.
5. **Particles are CPU-advected and drawn as Cesium polylines.** The alternative was a custom
   WebGL shader primitive. They are white, so they read over the speed raster. They were
   originally colored by the legend, and vanished into the raster.
6. **Default raster opacity is 0.7** where a product gives none (no product does).
7. **The southern hemisphere is not considered:** barbs carry their feathers on the right, as in the
   northern hemisphere.

## Deviations from the prompt text

- **`getProductTileJson`, `listProductFrames` and `getProductTileWebp` are not called.** The latest
  frame carries the concrete template the map needs. The loop covers animation.
- **`getProductFieldVelocityJson` is not used.** The particles read the png-uv encoding, which the
  manifest lists and which is smaller.
- **The Tropical-Storm view is not built** (above).

## Backend observations

1. **Every product is disabled** (74 of 74, "source disabled"), so no frame exists to draw.
2. **Coverage and bounds disagree.** 42 non-external products give a regional `coverage` (CONUS,
   or the radar stations' range for the NEXRAD products) while their `spatial.bounds` is the whole world, for example `goes-east-ir` and
   `mrms-reflectivity`. The map follows the bounds and the frame's own bounds. The rail shows the
   coverage as a label.

## Owner questions

1. **External products.** Should the map draw GIBS and nowCOAST layers from the third party's
   tiles, as `listProducts` `kind=external` describes ("client-direct")? **Default in place: not
   listed.**
2. **Loops.** Should a loop play automatically when a product is turned on, as the
   Tropical-Storm mock's storm animates? **Default in place: play on request.**
3. **The default products.** Are `goes-east-ir` and `mrms-reflectivity` the right defaults, or
   should the global wind field also be on? **Default in place: the two rasters.**

Questions still open from earlier reports (008: glance counts, source filter for cells; 007, 004,
003, 002) keep their defaults.
