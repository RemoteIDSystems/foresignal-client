# 018 — Completion Report: Glance Ticker

| Field                 | Value                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Status                | Complete                                                                                                                |
| Implementation commit | `76e4261b64a0106e3e86f26392cd397074d7d2b8`                                                                              |
| Run mode              | Unattended (owner's batch 015–018, no review gates)                                                                     |
| Screenshots           | `review/018-glance.png` (the status strip above the coordinates, the activity heat on the global-view inset; live data) |
| Mock comparison       | `review/018-vs-global-mock-chrome.png` (the mock's map foot beside the built one)                                       |

## Results

The Global dashboard shows the backend's status and the last 24 hours' activity in two small
widgets, from live data. In `e2e/glance.e2e.ts`:

- **The status strip** sits above the coordinates readout:
  - the backend's health, as `getGlance` gives it (`ok`, shown as Operational);
  - the record changes in the last 24 hours, equal to the sum of the live series the page was
    sent (`getStatsTimeseries`);
  - a sparkline with one point per hour of that series;
  - the busiest source with its count, matching the live `getStatsTop` (USGS Earthquakes);
  - the alerts line.
- **The global-view inset** shows the activity heat: the live `getStatsGrid` cells.
- **Refresh:** the status is read again on its interval, sending the last ETag
  (`If-None-Match`).

Against the live backend at the time of the screenshot (curl): `getGlance` status `ok`, no recent
alerts; `getStatsTimeseries` 25 hourly points totaling 473; `getStatsTop` by source,
`usgs-earthquakes` 473; `getStatsGrid` 63 cells. The strip read "Operational · 473 changes · 24 h ·
USGS Earthquakes 473 · Earthquake 473 · No recent alerts".

**The heat, read from the screenshot's pixels:** the committed screenshot's inset has 204 orange pixels, at Alaska, the
western United States, the Pacific rim and Indonesia. The first version drew each H3 cell as its
outline, which came to 8 pixels at the inset's size, so cells are now drawn as dots at their
centers.

## What was built

- **`glance/glanceApi.ts`**:
  - `readGlance` revalidates with the last ETag and keeps the last status on 304;
  - `statsWindow`: from the start of the hour a day ago to the current minute;
  - `loadTop` (by source or kind, top 3), `loadSeries` (hourly versions) and `loadGrid` (H3
    resolution 2, worldwide);
  - series points and totals.
- **`glance/useGlance.ts`**, one per page:
  - the status every 30 s (the backend caches it for 15 s);
  - the series, the top sources and kinds, and the grid every 5 minutes;
  - when the live stream (011) delivers changes, the status and series are read again once it
    has been quiet for 5 s;
  - a failed read keeps the last data and gives the reason (the strip's tooltip).
- **`glance/glanceView.ts`**:
  - the health in a word and its tone;
  - the alerts line: open counts by severity when the caller may see them, else the latest
    alert's short title, else "No recent alerts";
  - a ranking's leader;
  - the heat cells placed on the inset's equirectangular plane at their centers, weighted by the
    square root of their share of the largest.
- **`ui/Sparkline.tsx`**: a small SVG line with a faint fill and the last value marked, labeled
  for screen readers.
- **`views/global/GlanceStrip.tsx`**:
  - `GlanceStrip`: health, changes and sparkline, the leaders, alerts;
  - `InsetHeat`: the grid over the inset, one dot per cell, larger and brighter where there were
    more changes.
- **The map's HUD** takes an `insetOverlay`, drawn over the global-view inset under the
  visible-area box.
- **A fix to the layer catalog (007): waiting out a rate limit.**
  - The cause of the first full run's two failures (`dense-rendering.e2e.ts:48`,
    `state-store.e2e.ts:18`). Each page showed "The layer list did not load." With a logger on
    the catalog's requests, a re-run of the same sequence showed `/v1/kinds` refused three times
    with 429 ("Too many anonymous requests from this client; retry after 1 s"). The client's own
    retries were spent, and the page gave up for good.
  - The backend lets about 120 anonymous requests through in a burst, then answers 429 with
    `Retry-After: 1`. Measured with 150 back-to-back curl requests: 122 answered 200, 28 answered 429.
  - 018 adds five requests to each page load, which makes the burst more likely. The fix belongs
    in the catalog, though: without it the rail and map are empty.
  - `useLayerCatalog` now tries its first load again on a 429 or 503: up to 10 more times, each
    after `Retry-After` plus one second per earlier try (`catalogRetryDelay`). Any other failure
    still shows the error at once.

## How it was checked

### Tests

- `glance/glanceApi.test.ts` (3): ETag revalidation, and a 304 keeping the last status; the
  window; series totals.
- `glance/glanceView.test.ts` (4): the health, the alerts line by what the caller may see, a
  ranking's leader, heat cell placement and weight (including a cell split at the antimeridian).
- `glance/useGlance.test.tsx` (1): the first load, a reload once stream activity has settled, and
  the status interval.
- `ui/Sparkline.test.tsx` (2): point placement; a labeled line with its last value marked.
- `views/global/GlanceStrip.test.tsx` (3): the strip's contents; nothing before the first status;
  one dot per cell, and nothing without a grid.
- `map/records/useLayerCatalog.test.ts` (2, new): the wait for a 429 or 503 grows with each try
  and stops after 10; other failures are not retried.
- `e2e/glance.e2e.ts` (1): as in Results. It checks the strip against the series and top source
  the page was sent, and the status against the live `getGlance`.

### Checks

| Check                                                       | Result                                                                                                                                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit -p .`                                     | Passed                                                                                                                                                               |
| `npx eslint .`                                              | Passed                                                                                                                                                               |
| `npx prettier --check src e2e`                              | Passed                                                                                                                                                               |
| `npm run build`                                             | Passed (the existing chunk-size warning)                                                                                                                             |
| `npx vitest run`                                            | 89 files, 490 tests passed                                                                                                                                           |
| `e2e/glance.e2e.ts` alone                                   | 1 passed (before and after the heat change)                                                                                                                          |
| Full `npx playwright test`, run 1                           | 24 passed, 2 failed: `dense-rendering.e2e.ts:48` and `state-store.e2e.ts:18`, "The layer list did not load." (the catalog fix)                                       |
| The four-test sequence that reproduced it, before the fix   | 3 passed, 1 failed (`state-store`): `/v1/kinds` 429 three times                                                                                                      |
| The same sequence after the catalog fix                     | 4 passed                                                                                                                                                             |
| Full `npx playwright test`, run 2 (with the catalog fix)    | 25 passed, 1 failed: `dense-rendering.e2e.ts:140`, `live.map is not a function` in its stand-in `/v1/kinds` route                                                    |
| Full run 3, after the stand-in route fix                    | **Not run to the end.** Stopped at the owner's word ("3 times is more than enough"). The route fix in `e2e/dense-support.ts` is checked by type check and lint only. |
| Guard: `test_us_english.py`                                 | 14 tests OK                                                                                                                                                          |
| Guard: `check_us_english.py` over the project               | 796 hits, the baseline (777 generated, 19 wire names)                                                                                                                |
| Guard: `check_us_english.py` over the new and changed files | `[]`                                                                                                                                                                 |

**The stand-in route fix.** In the full-catalog check, the test's own read of `/v1/kinds` was
still rate limited after its 10 retries, and the route handler failed on the problem body. That
read's refusal is now passed to the page, which waits it out (the catalog fix).

## Compared to the mock

`review/018-vs-global-mock-chrome.png`.

- **Matches:**
  - the mock's global-view inset shows activity as small colored dots over the world map; the
    built inset shows the live grid the same way, in the accent orange;
  - the strip uses the coordinates readout's style (the dark translucent box, its border, the
    small type) and sits directly above it.
- **Differs:**
  - the mock has no status strip; the prompt asks for small status widgets in the available
    chrome, and the map's foot is where the mock keeps its other readout.

## Decisions taken (unattended run)

1. **Placement.** The strip sits above the coordinates readout at the map's foot, and the heat on
   the global-view inset. The prompt asks for small widgets in the available chrome, not a panel
   or a prominent ticker. The bottom middle collides with the coordinates readout on narrower
   maps.
2. **No chart library.** The project has none (`package.json` dependencies: Cesium, Resium,
   React, React Router, openapi-fetch, lucide and pbf). The sparkline and heat are small SVG. A
   library can replace `ui/Sparkline` when larger charts arrive.
3. **The window is the last 24 hours**, by hour, as the activity panels use (015).
4. **Live counts for anonymous callers.** `getGlance` gives anonymous callers no counts, so the
   strip's count is the 24-hour series total, refreshed after stream activity.
5. **Refresh.** The status every 30 s; the series after stream activity and every 5 minutes; the
   top lists and grid every 5 minutes.

## Deviations from the prompt text

- **"Using the chart lib":** there is no chart library in the project. The sparkline and heat are
  drawn as SVG (decision 2).

## Backend observations

- **Anonymous glance.** For an anonymous caller `getGlance` returns `serverTime`, `status`,
  `alerts.latest` (empty here) and `lastSeq`, with `ETag` and `Cache-Control: max-age=15, private`
  (curl). The OpenAPI says counts are omitted unless `glance.exposeCountsAnonymously`.
- **Stats need a window.** `getStatsTop` without `from` and `to` answers 400 (curl).
- **The grid** answers `application/geo+json` H3 cells, `Polygon` and `MultiPolygon` (63 cells
  over the last 24 hours, the largest 57).

## Owner questions

1. **A chart library.** Which library should the dashboard's charts use (the Architecture names
   ECharts or uPlot/visx as candidates)? **Default in place: small SVG, no dependency.**
2. **Counts for anonymous callers.** Should `glance.exposeCountsAnonymously` be on for this
   deployment, so the strip can show open alerts and source health without a token? **Default in
   place: the strip shows what an anonymous caller is given.**

Questions still open from earlier reports keep their defaults.
