# 035 — Completion Report: Scale And Performance

| Field                 | Value                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| Status                | **Closed by the owner on 2026-10-21.** The world-zoom frame gap is closed by adaptive MSAA (`3ee7ebc`, below). |
| Implementation commit | `5ef168ec451539a217318c0bf8e38b804b3c2116`; world-zoom fix `3ee7ebc660665cfea1759c0b41365d0a8412997c`          |
| Run mode              | Unattended (owner's batch 023–036, no pausing); the world-zoom fix was attended                                |
| Screenshots           | None taken.                                                                                                    |
| Mock comparison       | Not applicable: the harness is a development-only panel (`?stress` in a development build).                    |

## Results

- **A repeatable scale scenario** in the development stress harness (`/global?stress`, development
  builds only). **Scale scenario (3 zooms)** runs on the layers that are on (for example after
  **Turn on all N kinds**). It moves the camera to:
  - **World** (20,000 km);
  - **Region** (2,500 km over the central United States);
  - **City** (60 km over Houston).

  At each zoom it:
  1. waits for the layers to settle (nothing loading, no tile request waiting or in flight, no
     merged primitive building, for five samples in a row; at most 120 s);
  2. records what is drawn (layers, records, cells, tiles, merged instances), the peak of tile
     requests in flight and waiting while settling, frame timing while panning (3 s), the scene's
     MSAA samples (since `3ee7ebc`), the JavaScript heap (Chromium's `performance.memory`) and the
     open event streams by path.

  It ends by timing one layer turned off and on. The report is shown as a table and kept as JSON
  (`data-testid="scale-report"`).

- **The report judges itself** (`scaleProblems`). It lists:
  - more than one change-stream connection open at once;
  - a zoom whose layers never settled;
  - a 95th-percentile frame over the 33.3 ms budget (30 fps);
  - more records drawn at city zoom than at world zoom, since raw records must load only in view.
- **SSE connections are counted.** Every server-sent event connection goes through one transport
  (`fetchSseTransport`), which keeps a tally of the open connections by path (`openStreams()`).
  The harness shows it live and the scenario records it at each zoom. The end-to-end spec also
  counts `/v1/events/stream` requests from outside the page, through the browser's request events.
- **Raster overlays are bounded.** At most **4** product layers are drawn at once: the top ones in
  the rail's order. A layer that is on but over the bound shows as an error in the rail ("Not
  drawn: at most 4 overlays are drawn at once."). It is never silently missing.
- **Per-feature and per-source paths: the audit found none to fix.** The searches that ran:
  - `grep -rn "entities\.add\|new Entity(\|<Entity\b\|EntityCollection" src` (tests excluded) found
    only `src/map/AreaOutlines.tsx:28,37`. That draws one outline entity per area (a situation's
    or investigation's footprint, 019), not per record.
  - `grep -rn "new EventSubscription\|new EventSource\|openSse\|function openStream" src` (tests
    excluded) found three subscriptions:
    - `saved/viewStream.ts:37`: one per open saved view (031);
    - `alerts/InboxFeed.ts:48`: the inbox;
    - `alerts/AlertFeed.ts:46`: the alerts.

    The map's records follow the one `ChangeStream` (`/v1/events/stream`, 011), which re-filters
    by `setFilter` rather than reconnecting. No stream is opened per source or per layer.

  - `grep -rn "MAX_\w*PRODUCT\|MAX_\w*RASTER\|MAX_\w*OVERLAY\|maxProduct" src` found no bound
    before this change; `MAX_PRODUCT_LAYERS` is that bound now.

## The numbers (as first measured)

Both runs were on 2026-10-21 against the local backend, with 190 kind layers on (stand-in records,
as 010), before client clustering (037) and adaptive MSAA. Heap is `usedJSHeapSize` in decimal MB.

- **GPU:** `E2E_GPU=1 npx playwright test e2e/scale.e2e.ts`, 1.8 min, source
  `test-results/035-scale-gpu.json`. The renderer, read from `WEBGL_debug_renderer_info` under the
  same configuration, was `ANGLE (AMD, AMD Radeon 780M Graphics (radeonsi phoenix LLVM 20.1.2),
OpenGL 4.6)`. **The spec failed** on one problem: "World: p95 frame 53.6 ms is over the 33.3 ms
  budget."
- **Software:** `npx playwright test e2e/scale.e2e.ts`, 2.0 min, source
  `test-results/035-scale-software.json`. The renderer was SwiftShader. The spec passed, because it
  holds frame timing only on the GPU.

### GPU (Radeon 780M)

| Measure                                  | World              | Region             | City               |
| ---------------------------------------- | ------------------ | ------------------ | ------------------ |
| Layers on                                | 190                | 190                | 190                |
| Records drawn                            | 37,500             | 1,292              | 1                  |
| Cells drawn                              | 396                | 144                | 0                  |
| Tiles                                    | 760                | 760                | 1,140              |
| Merged instances                         | 792                | 288                | 0                  |
| Settled after (s)                        | 87.0               | 8.5                | 2.8                |
| Peak tile requests (in flight / waiting) | 12 / 517           | 12 / 736           | 12 / 1,114         |
| Frames in the 3 s pan (fps)              | 97 (32.3)          | 180 (60.0)         | 180 (60.0)         |
| Frame p50 / p95 / p99 (ms)               | 28.9 / 53.6 / 91.6 | 16.7 / 17.7 / 21.2 | 16.7 / 18.6 / 23.8 |
| Frames over 33.3 ms                      | 27                 | 0                  | 0                  |
| Heap (MB)                                | 148                | 148                | 148                |
| Change-stream connections                | 1                  | 1                  | 1                  |

The layer toggle (`aerodrome-osm`) took 0.2 ms off and 0.1 ms on, and the map redrew in 0.1 ms.

### Software (SwiftShader)

| Measure                                  | World         | Region        | City          |
| ---------------------------------------- | ------------- | ------------- | ------------- |
| Records drawn                            | 37,482        | 1,286         | 1,286         |
| Cells drawn                              | 396           | 144           | 144           |
| Settled after (s)                        | 82.9          | 17.0          | 0.8           |
| Peak tile requests (in flight / waiting) | 12 / 519      | 12 / 731      | 0 / 0         |
| Frames in the 3 s pan                    | 1             | 3             | 2             |
| Frame p50 / p95 (ms)                     | 2,375 / 2,375 | 1,556 / 1,558 | 1,097 / 1,611 |
| Heap (MB)                                | 148           | 148           | 148           |
| Change-stream connections                | 1             | 1             | 1             |

The layer toggle (`navaid`) took 0.1 ms off and 0 ms on, and the map redrew in 389.5 ms.
SwiftShader draws on the CPU, so its frame times say nothing about a GPU.

### What the numbers show

- **The frame ceiling was the client's, at world zoom.** Region and city zooms held 60 fps; the
  world view did not. Nothing on the backend is involved in drawing a frame. Where the time went is
  below ("World zoom").
- **The load ceiling is the tile queue.** Every zoom peaked at 12 requests in flight, which is the
  client's own cap (`MAX_TILE_REQUESTS`, `src/map/records/layerSources.ts:15`), with 517 to 1,114
  waiting. The world view took 87.0 s to settle on the GPU and 82.9 s in software, nearly the
  same, so drawing is not what holds settling back. These runs do not separate how much of that
  time is the cap and how much is the backend's response time, including its anonymous rate limit
  (429 with `Retry-After`).
- **Records load only in view.** The city view held 1 record on the GPU run and 1,286 in the
  software run. The two runs read the live backend at different times, so the counts differ.
- **One change stream.** Both runs saw at most one `/v1/events/stream` open at once, and the
  client's tally agrees. The alerts stream is the only other one open.
- **Heap reads exactly 148,000,000 bytes at every step of both runs.** That is a rounded figure,
  not a measurement of growth. The runs' launch arguments (`playwright.config.ts`) do not include
  Chromium's `--enable-precise-memory-info`.

## World zoom: closed by adaptive MSAA

### How it went

1. **First accepted, then reopened.** The owner first accepted world zoom's 32 fps as the worst
   case with stand-in data that does not aggregate. A check then found that only aircraft declares
   `aggBelowZoom` on the local backend (17 of 596 layers in `GET /v1/tiles.json`: the `aircraft`
   kind and 16 aircraft sources), so real records of the other kinds would draw raw at world zoom.
   The client does switch to the backend's cells from the backend's own value: probed with
   aircraft, its tiles were `agg=hex` at z1–z2 at 20,000 km.
2. **Client clustering (037) did not move it.** With 037 the world view drew **0 points** and
   **1,224 merged cells** counting 43,166 records, and its p95 was **53.3 ms** (GPU scale run,
   2026-10-21), against 53.6 ms before. The points were not the cost.
3. **The cost was measured, not guessed.** A GPU probe of the World view (2026-10-21, the same
   Radeon 780M, 984×527 canvas at 1× pixel ratio) timed every frame: the interval, Cesium's CPU
   time for the render (`preUpdate` to `postRender`), the GPU time (WebGL timer queries around the
   render), the draw commands and the globe tiles. It then hid one thing at a time, and took a CPU
   profile while panning. The findings are kept in `completion-reports/035-world-probe.json`.
4. **Fixed by adaptive MSAA** (`3ee7ebc`), decided by the owner on 2026-10-21.

### The probe's findings

No layers on (the basemap and terrain only):

| MSAA         | Frame p50 / p95 (still) | Cesium CPU p50 | GPU p50 / p95  |
| ------------ | ----------------------- | -------------- | -------------- |
| 4× (shipped) | 16.7 / 17.6 ms          | 1.1 ms         | 12.6 / 15.2 ms |
| 1×           | 16.7 / 17.4 ms          | 1.2 ms         | 2.8 / 3.2 ms   |

All 190 layers on, settled (0 points, 1,224 cells counting 43,236 records, no ground primitives,
12 draw commands):

| What was hidden                 | Frame p50 / p95 (still) | GPU p50     |
| ------------------------------- | ----------------------- | ----------- |
| Nothing                         | 28.9 / 53.4 ms          | 28.7 ms     |
| Cell fills                      | 23.2 / 42.2 ms          | 22.6 ms     |
| Cell outlines                   | 21.7 / 38.8 ms          | 21.9 ms     |
| All cells                       | 16.7 / 17.2 ms          | 11.5 ms     |
| Points (none at world zoom)     | 28.8 / 48.9 ms          | 28.6 ms     |
| Ground primitives (none)        | 28.0 / 50.6 ms          | 27.8 ms     |
| The globe (imagery and terrain) | 25.5 / 45.7 ms          | 25.6 ms     |
| **Nothing, with MSAA 1×**       | **16.7 / 17.4 ms**      | **14.1 ms** |

Panning gave the same picture (all on: GPU p50 28.0 ms; with MSAA 1×: 14.5 ms, frame p95 17.5 ms).
A repeat of "nothing hidden" at the end gave a GPU p50 of 27.6 ms.

- **The cost is GPU time in the cells' translucent pass under 4× MSAA.** Hiding the cells, or
  drawing without MSAA, brings the frame back to 60 fps. Fills alone add about 11 ms of GPU time
  and outlines alone about 10 ms, both about 17 ms, which reads as a mostly fixed cost of the
  translucent pass on a multisampled frame; which sub-pass it is was not measured.
- **Not the CPU.** Cesium's render takes about 2 ms a frame. Over 3.3 s of panning the JavaScript
  profile was about 2.0 s idle, and the app's own code took 79 ms in all.
- **Not draw calls.** 12 commands with every layer on, against 6–8 with none: the 190 layers and
  760 tiles are 3 primitives.
- **Not rebuilds.** The probe measured settled views (nothing building, the counts unchanged for
  5 s), and the still view was as slow as the panning one.
- **The globe** costs about 3 ms of GPU time; the basemap's own 4× MSAA about 10 ms.
- **Why the p95 is about twice the GPU time:** a frame that misses the display's refresh is shown a
  whole refresh later, so 28 ms of GPU time lands on 33 or 50 ms.

### The fix

`src/map/msaa.ts` and `src/map/adaptMsaa.ts`, mounted by `AdaptiveMsaa` in the map viewer:

- **Below map zoom 4** (`OVERVIEW_BELOW_ZOOM`) the scene is drawn **without MSAA**
  (`OVERVIEW_MSAA`, 1); **at or above zoom 4.5** (`DETAIL_FROM_ZOOM`) with the **shipped 4×**
  (`DETAIL_MSAA`, Cesium's default). Between the two it keeps what it has, so a view resting near
  the threshold does not switch back and forth.
- **It is decided on camera events, not per frame:** the camera's `changed` and `moveEnd`, and
  after a 2D/3D switch. `scene.msaaSamples` is written only when the value changes, so the
  framebuffers are rebuilt at the crossing only.
- **The map zoom** is the record layers' (`readRecordView`), at the center of the canvas.
- **Checked in the running client** (GPU, no layers on, 2026-10-21, `zoomProbe` in the probe file):

  | Step        | Map zoom | MSAA |
  | ----------- | -------- | ---- |
  | World       | 1.95     | 1    |
  | Region      | 4.94     | 4    |
  | City        | 10.32    | 4    |
  | World again | 1.95     | 1    |

- **The scale spec** (`e2e/scale.e2e.ts`) now holds world zoom to **60 fps**: with `E2E_GPU=1`,
  its p95 frame must be within `SIXTY_FPS_P95_MS`, 25 ms (one and a half frames: a frame that
  misses the refresh takes 33.3 ms, so a p95 under 25 ms means 95 frames in 100 met it). It also
  asserts the world step drawn at MSAA 1 and the city at 4. Region and city keep the 33.3 ms
  budget through `scaleProblems`.
- **The GPU scale run passed with the fix** (2026-10-21, after `f9ad25e`,
  `E2E_GPU=1 npx playwright test e2e/scale.e2e.ts`, 1.8 min, no problems):

  | Measure                    | World              | Region             | City               |
  | -------------------------- | ------------------ | ------------------ | ------------------ |
  | MSAA                       | 1×                 | 4×                 | 4×                 |
  | Points / cells drawn       | 0 / 1,236          | 1,296 / 150        | 1 / 0              |
  | Frames in 3 s (fps)        | 180 (60.0)         | 180 (60.0)         | 180 (60.0)         |
  | Frame p50 / p95 / p99 (ms) | 16.7 / 17.7 / 21.6 | 16.7 / 17.4 / 20.9 | 16.6 / 18.7 / 20.9 |
  | Frames over 33.3 ms        | 0                  | 0                  | 0                  |

  World's p95 went from 53.6 ms (before 037) and 53.3 ms (with 037 alone) to 17.7 ms.

## What was built

- `src/map/stress/scaleScenario.ts`:
  - `SCALE_STEPS`, `runScaleScenario`, `settle`, `scaleProblems`, `heapBytes`;
  - `CHANGE_STREAM_PATH`, `STEP_FRAMES_MS`, `SETTLE_TIMEOUT_MS`;
  - the `ScaleReport` and `ScaleStepResult` types (with `msaa` since `3ee7ebc`).
- `src/map/stress/StressHarness.tsx`: live **Streams** and **Heap** rows, the **Scale scenario**
  button, the report table and its JSON.
- `src/api/stream/sse.ts`: the open-connection tally and `openStreams()`.
- `src/map/products/productCatalog.ts`: `MAX_PRODUCT_LAYERS`, `OVER_LIMIT_MESSAGE`,
  `boundProductLayers`. `GlobalDashboard.tsx` draws the bounded list and marks the rest.
- **The world-zoom fix (`3ee7ebc`):**
  - `src/map/msaa.ts`: `msaaForZoom` and its constants;
  - `src/map/adaptMsaa.ts`: `adaptMsaa`;
  - `src/map/AdaptiveMsaa.tsx`, mounted in `src/map/Viewer.tsx`;
  - `src/map/stress/frameStats.ts`: `SIXTY_FPS_FRAME_MS`, `SIXTY_FPS_P95_MS`.

## How it was checked

### Tests (written, not run)

- `map/stress/scaleScenario.test.ts` (5):
  - no problems for one stream, settled layers and frames in budget;
  - every problem reported (three streams, unsettled, slow p95, a city fuller than the world);
  - settling after five quiet samples, with the peak of requests;
  - giving up at the timeout;
  - the scenario moving through each zoom and recording totals, frames, MSAA, heap and streams.
- `api/stream/sse.test.ts` (1 more): the tally counts each connection by path while open, and once
  on close.
- `map/products/productCatalog.test.ts` (2): every layer under the bound; the top four past it,
  the rest named, and the message.
- `map/msaa.test.ts` (4):
  - the overview gets 1×, a closer view 4×;
  - between the two zooms it keeps what it has;
  - the samples are written only at a crossing, on camera and morph events, and 4× is restored
    when stopped;
  - nothing is written mid-morph.
- `e2e/scale.e2e.ts` (1). It turns the full catalog on (stand-in records, as 010), runs the scale
  scenario and writes the JSON report. It then asserts:
  - the browser saw at most one `/v1/events/stream` open at once, and the client's tally agrees;
  - every zoom settled;
  - cells at world zoom, few records drawn one by one there and the rest counted in cells (037);
  - fewer records at city zoom than the world draws or counts;
  - MSAA 1 at the world step and 4 at the city;
  - with `E2E_GPU=1`, the world's p95 within 25 ms (60 fps) and no problems; otherwise no
    problems but frame timing.

### Checks

The world-zoom fix (`3ee7ebc`):

| Check                                                       | Result                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| `npm run typecheck`                                         | Passed                                                   |
| `npm run lint`                                              | Passed                                                   |
| `npx prettier --check src e2e scripts`                      | Passed                                                   |
| `npm run build`                                             | Passed. `index` 896.78 kB (269.98 kB gzip)               |
| `npm run verify:dist`                                       | "✓ dist is ready to deploy."                             |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule), but for the GPU scale check |
| Zoom probe (GPU, scratch, not a spec)                       | MSAA 1 at World, 4 at Region and City                    |
| `E2E_GPU=1 npx playwright test e2e/scale.e2e.ts`            | **Passed** (World p95 17.7 ms at 1×)                     |
| Guard: `test_us_english.py`                                 | 14 tests OK (176.2 s)                                    |
| Guard: `check_us_english.py` over the project               | 804 hits, unchanged                                      |
| Guard: `check_us_english.py` over the new and changed files | 0 hits                                                   |

The first build (`5ef168e`): typecheck, lint, Prettier, build (`index` 875.55 kB, 263.29 kB gzip)
and `verify:dist` passed; the guards passed (14 tests OK, 804 hits, 0 in changed files). The scale
spec then passed in software and failed on the GPU (world p95 53.6 ms), as above.

## Compared to the mock

Not applicable: development tooling. The visible changes are a product layer over the bound, which
shows in the rail's existing error state with its message, and, at the world and continental
overview, edges drawn without multisample antialiasing.

## Decisions taken

1. **The harness extends 010's** (`?stress`), rather than a second tool. It stays out of
   production builds: `stressModeOn` requires `import.meta.env.DEV`.
2. **The three zooms** are the world, a region and a city over the United States, where the local
   backend's live data is.
3. **Frame budget:** 30 fps (the existing `SLOW_FRAME_MS`) at the 95th percentile for every zoom,
   and 60 fps at world zoom since the fix (owner, 2026-10-21).
4. **The overlay bound is 4**, keeping the top ones (the ones seen). The rest show an error rather
   than being turned off, so the person's choice is kept.
5. **The SSE tally lives in the shared transport,** so every stream (change, alerts, inbox, saved
   views) is counted, and only the change stream is required to be one.
6. **Memory** is Chromium's `performance.memory.usedJSHeapSize` where present. It is left out
   elsewhere, not estimated.
7. **Adaptive MSAA thresholds:** 1× below zoom 4, 4× from zoom 4.5. World is zoom 1.95 and region
   4.94 at the e2e viewport, so the world and continental overview go without MSAA and the region
   keeps 4×, which it ran at 60 fps.
8. **The world's 60 fps check is a p95 within 25 ms**, not within 16.7 ms: frames are shown on the
   display's refresh, so a p95 of exactly one frame would fail on timer jitter alone (the probe's
   1× world p95 was 17.4 ms).

## Deviations from the prompt text

- **"Confirm the limit is the backend, not the client"**: answered in part. The frame limit at
  world zoom was the client's, and it is closed (above). The settle time is the tile queue: the
  client's cap of 12 in flight and the backend's response time together, which these runs do not
  separate.

## Backend observations

- No backend call was made for this prompt beyond the reads the scale run makes (the live tile
  index and kinds, as 010's does) and the `GET /v1/tiles.json` read for `aggBelowZoom` (above).

## Owner questions

1. **World zoom.** Closed by adaptive MSAA (owner, 2026-10-21). Still the backend's setting: only
   aircraft declares `aggBelowZoom`, so other dense kinds are counted into cells by the client
   (037) rather than the backend.
2. **Overlay bound.** Is 4 drawn product layers the right bound, and should the rail stop a fifth
   from being turned on, rather than showing it as not drawn? **Default in place: 4, the rest
   marked.**
3. **Frame budget elsewhere.** Region and city are held to 30 fps at the 95th percentile, and the
   world to 60 fps. Should region and city be held to 60 fps too? Both ran at 60 fps on the GPU.
   **Default in place: 30 fps.**
4. **Other streams.** Alerts and inbox each hold their own connection beside the change stream.
   Should they share it? **Default in place: separate, as 029 built them.**

Questions still open from earlier reports keep their defaults.
