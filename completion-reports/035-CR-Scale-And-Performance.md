# 035 — Completion Report: Scale And Performance

| Field                 | Value                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Status                | Complete. Measured on 2026-10-21 on the GPU and in software WebGL. On the GPU the world zoom is over the frame budget. |
| Implementation commit | `5ef168ec451539a217318c0bf8e38b804b3c2116`                                                                             |
| Run mode              | Unattended (owner's batch 023–036, no pausing)                                                                         |
| Screenshots           | None taken (compile-only run).                                                                                         |
| Mock comparison       | Not applicable: the harness is a development-only panel (`?stress` in a development build).                            |

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
     requests in flight and waiting while settling, frame timing while panning (3 s), the
     JavaScript heap (Chromium's `performance.memory`) and the open event streams by path.

  It ends by timing one layer turned off and on. The report is shown as a table and kept as JSON
  (`data-testid="scale-report"`).

- **The report judges itself** (`scaleProblems`). It lists:
  - more than one change-stream connection open at once;
  - a zoom whose layers never settled;
  - a 95th-percentile frame over the 33.3 ms budget (30 fps);
  - more records drawn at city zoom than at world zoom, since raw records must load only in view.
- **SSE connections are counted.** Every server-sent event connection goes through one transport
  (`fetchSseTransport`), which now keeps a tally of the open connections by path (`openStreams()`).
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

## The numbers

Both runs were on 2026-10-21 against the local backend, with 190 kind layers on (stand-in records,
as 010). Heap is `usedJSHeapSize` in decimal MB.

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

- **The frame ceiling is the client's, at world zoom.** On the GPU the world view (37,500 records,
  396 cells, 792 merged instances) pans at 32 fps with a p95 of 53.6 ms: 27 of 97 frames are over
  budget. Region and city zooms hold 60 fps. Nothing on the backend is involved in drawing a
  frame, so this is the client's limit.
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

## What was built

- `src/map/stress/scaleScenario.ts`:
  - `SCALE_STEPS`, `runScaleScenario`, `settle`, `scaleProblems`, `heapBytes`;
  - `CHANGE_STREAM_PATH`, `STEP_FRAMES_MS`, `SETTLE_TIMEOUT_MS`;
  - the `ScaleReport` and `ScaleStepResult` types.
- `src/map/stress/StressHarness.tsx`: live **Streams** and **Heap** rows, the **Scale scenario**
  button, the report table and its JSON.
- `src/api/stream/sse.ts`: the open-connection tally and `openStreams()`.
- `src/map/products/productCatalog.ts`: `MAX_PRODUCT_LAYERS`, `OVER_LIMIT_MESSAGE`,
  `boundProductLayers`. `GlobalDashboard.tsx` draws the bounded list and marks the rest.

## How it was checked

### Tests (written, not run)

- `map/stress/scaleScenario.test.ts` (5):
  - no problems for one stream, settled layers and frames in budget;
  - every problem reported (three streams, unsettled, slow p95, a city fuller than the world);
  - settling after five quiet samples, with the peak of requests;
  - giving up at the timeout;
  - the scenario moving through each zoom and recording totals, frames, heap and streams.
- `api/stream/sse.test.ts` (1 more): the tally counts each connection by path while open, and once
  on close.
- `map/products/productCatalog.test.ts` (2): every layer under the bound; the top four past it,
  the rest named, and the message.
- `e2e/scale.e2e.ts` (1). It turns the full catalog on (stand-in records, as 010), runs the scale
  scenario and writes the JSON report. It then asserts:
  - the browser saw at most one `/v1/events/stream` open at once, and the client's tally agrees;
  - every zoom settled;
  - cells at world zoom (the dense kinds aggregate below zoom 7);
  - fewer records at city zoom than at world zoom;
  - no problems (frame timing only with `E2E_GPU=1`).

### Checks

| Check                                                       | Result                                                                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                         | Passed                                                                                                                                 |
| `npm run lint`                                              | Passed                                                                                                                                 |
| `npx prettier --check src e2e`                              | Passed (and `scripts`)                                                                                                                 |
| `npm run build`                                             | Passed. `index` 875.55 kB (263.29 kB gzip)                                                                                             |
| `npm run verify:dist`                                       | "✓ dist is ready to deploy."                                                                                                           |
| `npm test`, `npm run e2e`                                   | **Not run** at the time (standing rule). On 2026-10-21 the scale spec passed in software and **failed on the GPU** (world p95 53.6 ms) |
| Guard: `test_us_english.py`                                 | 14 tests OK (167.9 s)                                                                                                                  |
| Guard: `check_us_english.py` over the project               | 804 hits, unchanged                                                                                                                    |
| Guard: `check_us_english.py` over the new and changed files | 0 hits                                                                                                                                 |

## Compared to the mock

Not applicable: development tooling. The one visible change is a product layer over the bound,
which shows in the rail's existing error state with its message.

## Decisions taken (unattended run)

1. **The harness extends 010's** (`?stress`), rather than a second tool. It stays out of
   production builds: `stressModeOn` requires `import.meta.env.DEV`.
2. **The three zooms** are the world, a region and a city over the United States, where the local
   backend's live data is.
3. **Frame budget:** 30 fps (the existing `SLOW_FRAME_MS`), held at the 95th percentile.
4. **The overlay bound is 4**, keeping the top ones (the ones seen). The rest show an error rather
   than being turned off, so the person's choice is kept.
5. **The SSE tally lives in the shared transport,** so every stream (change, alerts, inbox, saved
   views) is counted, and only the change stream is required to be one.
6. **Memory** is Chromium's `performance.memory.usedJSHeapSize` where present. It is left out
   elsewhere, not estimated.

## Deviations from the prompt text

- **"Confirm the limit is the backend, not the client"**: answered in part. The frame limit at
  world zoom is the client's (above). The settle time is the tile queue: the client's cap of 12 in
  flight and the backend's response time together, which these runs do not separate.
- **The frame budget is not met at world zoom on the GPU** (p95 53.6 ms against 33.3 ms). Nothing
  was changed to meet it. That is owner question 1.

## Backend observations

- No backend call was made for this prompt. The scale run reads the live tile index and kinds,
  as 010's does, when the owner runs it.

## Owner questions

1. **World zoom over budget.** On the Radeon 780M the world view pans at 32 fps, with a p95 of
   53.6 ms. Should drawing at world zoom be made cheaper (fewer cells or merged instances drawn at
   once), or is 32 fps acceptable at that zoom? **Default in place: unchanged; the scale spec fails
   on the GPU.**
2. **Overlay bound.** Is 4 drawn product layers the right bound, and should the rail stop a fifth
   from being turned on, rather than showing it as not drawn? **Default in place: 4, the rest
   marked.**
3. **Frame budget.** Is 30 fps at the 95th percentile the budget, or 60 fps? **Default in place:
   30 fps.**
4. **Other streams.** Alerts and inbox each hold their own connection beside the change stream.
   Should they share it? **Default in place: separate, as 029 built them.**

Questions still open from earlier reports keep their defaults.
