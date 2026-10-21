# 035 — Completion Report: Scale And Performance

| Field                 | Value                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Status                | Complete. The scale spec ran on 2026-10-21 in software WebGL and passed; its numbers are below. Not yet run on the GPU. |
| Implementation commit | `5ef168ec451539a217318c0bf8e38b804b3c2116`                                                                              |
| Run mode              | Unattended (owner's batch 023–036, no pausing)                                                                          |
| Screenshots           | None taken (compile-only run).                                                                                          |
| Mock comparison       | Not applicable: the harness is a development-only panel (`?stress` in a development build).                             |

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

Measured on 2026-10-21 by `npx playwright test e2e/scale.e2e.ts`, which passed in 2.0 min. The run
used **software WebGL (SwiftShader)** against the local backend, with 190 kind layers on. The source
is `test-results/035-scale-software.json`. Heap is `usedJSHeapSize` in decimal MB.

| Measure                                  | World         | Region        | City          |
| ---------------------------------------- | ------------- | ------------- | ------------- |
| Layers on                                | 190           | 190           | 190           |
| Records drawn                            | 37,482        | 1,286         | 1,286         |
| Cells drawn                              | 396           | 144           | 144           |
| Tiles                                    | 760           | 760           | 760           |
| Merged instances                         | 792           | 288           | 288           |
| Settled after (s)                        | 82.9          | 17.0          | 0.8           |
| Peak tile requests (in flight / waiting) | 12 / 519      | 12 / 731      | 0 / 0         |
| Frames in the 3 s pan                    | 1             | 3             | 2             |
| Frame p50 / p95 (ms)                     | 2,375 / 2,375 | 1,556 / 1,558 | 1,097 / 1,611 |
| Heap (MB)                                | 148           | 148           | 148           |
| Change-stream connections                | 1             | 1             | 1             |

Other figures:

- **Change streams.** The browser saw at most one `/v1/events/stream` open at once, and the client's
  tally agrees. The alerts stream is the only other one open.
- **Layer toggle.** One layer (`navaid`) turned off took 0.1 ms and back on 0 ms. The map then
  redrew in 389.5 ms.
- **Problems the report lists.** Region p95 1,558.1 ms and city p95 1,610.7 ms are over the 33.3 ms
  budget. The world zoom drew one frame in the pan, and `scaleProblems` judges only more than one
  (`scaleScenario.ts:202`). The spec checks frame timing only
  with `E2E_GPU=1`, so these do not fail it.

**What the numbers do and do not show.**

- Records load only in view: the city holds 1,286 against the world's 37,482.
- Tile requests peaked at 12 in flight, with up to 731 waiting. The world zoom took 82.9 s to
  settle. This run does not show how much of that was the queue.
- **Frame time here is SwiftShader's.** It draws every translucent pixel on the CPU, so it says
  nothing about a GPU. **The ceiling, and whether it is the backend's or the client's, is still not
  confirmed.** That needs the GPU run (`E2E_GPU=1 npm run e2e -- scale`), which has not been done.

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

| Check                                                       | Result                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm run typecheck`                                         | Passed                                                                                |
| `npm run lint`                                              | Passed                                                                                |
| `npx prettier --check src e2e`                              | Passed (and `scripts`)                                                                |
| `npm run build`                                             | Passed. `index` 875.55 kB (263.29 kB gzip)                                            |
| `npm run verify:dist`                                       | "✓ dist is ready to deploy."                                                          |
| `npm test`, `npm run e2e`                                   | **Not run** at the time (standing rule). The scale spec was run on 2026-10-21: passed |
| Guard: `test_us_english.py`                                 | 14 tests OK (167.9 s)                                                                 |
| Guard: `check_us_english.py` over the project               | 804 hits, unchanged                                                                   |
| Guard: `check_us_english.py` over the new and changed files | 0 hits                                                                                |

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

- **"Measure … record the numbers"**: measured on 2026-10-21 in software WebGL (above). There is no
  GPU run yet.
- **"Confirm the limit is the backend, not the client"**: not confirmed. Software WebGL's frame
  time bounds the run, so the GPU run is still needed.

## Backend observations

- No backend call was made for this prompt. The scale run reads the live tile index and kinds,
  as 010's does, when the owner runs it.

## Owner questions

1. **The ceiling.** The software-WebGL numbers are in the table. Should the GPU run
   (`E2E_GPU=1`) be run on the workstation to settle where the ceiling is? **Default in place:
   software numbers only.**
2. **Overlay bound.** Is 4 drawn product layers the right bound, and should the rail stop a fifth
   from being turned on, rather than showing it as not drawn? **Default in place: 4, the rest
   marked.**
3. **Frame budget.** Is 30 fps at the 95th percentile the budget, or 60 fps? **Default in place:
   30 fps.**
4. **Other streams.** Alerts and inbox each hold their own connection beside the change stream.
   Should they share it? **Default in place: separate, as 029 built them.**

Questions still open from earlier reports keep their defaults.
