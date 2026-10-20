# 013 — Completion Report: Time Machine

| Field                 | Value                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| Status                | Complete                                                                                           |
| Implementation commit | `5b655be75fe69e06143f13f09120cca0568e30f9`                                                         |
| Run mode              | Unattended (owner's batch 011–014, no review gates)                                                |
| Screenshots           | `review/013-live.png`, `review/013-paused.png`, `review/013-playback.png`, `review/013-trail.png`  |
| Paused vs live        | `review/013-paused-vs-live.png` (the same view, live above, pinned about 15 h back below)          |
| Mock comparison       | `review/013-vs-global-mock-scrubber.png` (the mock's scrubber, then the built one live and pinned) |

## Results

The time HUD over the Global map is now a working time machine.

**Pinning the map at an instant.** In `e2e/time-machine.e2e.ts`, run against the live backend:

1. Earthquakes are turned on and the map is live: 647 records drawn.
2. The scrubber's handle is dragged from Now to the middle of `−24h…−6h`.
3. On release, the map is pinned at `2026-10-20T02:49:01Z` (about 15 h back):
   - The badge reads HISTORY.
   - The date-time box shows that instant.
   - The layer's TileJSON is read with `asOf`.
   - Every tile request after that carries the `asOf` from the template the backend returned. The
     check compares the two.
   - 510 records are drawn.
   - The day/night basemap shows the night of that instant.

**Playback.** The play button loads `getHistoryFrames` from the pinned instant to now. The map shows
the keyframe, then each frame in order:

- `data-playback` steps past frame 3, and the handle moves right with it.
- Pause holds the frame.
- The frame's records are drawn with the same symbols.

**Back to live.** Clicking HISTORY (Return to live) puts the map back to `live`:

- The badge is LIVE again on the same stream connection (`data-connections` unchanged).
- Every tile after that is fetched without `asOf`.
- The records are drawn.

**Trail.** A record is selected and its track (`getRecordTrack`) is drawn as a ground polyline in
the accent color:

- In a screenshot, accent pixels went from 0 before the selection to 54 with the trail.
- The track is asked for up to now while live, and up to the pinned instant once the handle moves.
- Escape removes it.

## What was built

- **`time/scrub.ts`**: the track's piecewise mapping.
  - The mock's five labels are evenly spaced, so `−24h`, `−6h`, Now, `+6h` and `+24h` sit at 0,
    ¼, ½, ¾ and 1, and the scale is linear between them.
  - `formatHudTime` gives `2025-09-18 14:32:17Z`; `wholeSecondIso` gives the backend's `asOf`
    form.
  - `frameStep` spreads a span over about 120 frames, never under 10 s.
  - `clampInstant` keeps the cursor within the last day and the backend's retention, and never in
    the future.
- **`time/history.ts`**: `HistoryPlayback`.
  - Step 0 is the keyframe; step _i_ applies frames 1…_i_ (removals, then upserts), which the API
    defines as `asOf(tᵢ)`.
  - States are built forward once and kept.
  - `frameFeature` turns a frame entity into a tile-like point record: source and external id
    from its `<source>:<externalId>` id, its kind, its title and its tile properties.
- **`time/timeApi.ts`**: `loadTimeline`, `loadHistoryFrames` and `loadTrack`, through the API
  client.
- **`time/trail.ts`**: `trailOf` reads a track's multi-line, collapsing repeated positions.
- **`views/global/TimeHud.tsx`** replaces the 004 placeholder:
  - the date-time box, ticking while live;
  - the live badge, which becomes an amber **HISTORY** button while pinned;
  - the play/pause button (the mock's `›`) and, while playing, `Frame n of m`;
  - the scrubber: ticks at the five marks, the past filled, the handle, and a histogram of the
    drawn kinds in the view over the last day (`getTimeline`, read again every 5 minutes).
    History not retained (before `retainedFrom`) is shaded, and the future half is dimmed;
  - drag (pointer capture) and keys (arrows 10 min, Page keys 1 h, Home −24h, End live). A
    release within 1.5% of Now returns to live. Slider role and ARIA values;
  - a **≈ Approximate** chip when the histogram or the frames are approximate.
- **Store**: a `playback` key (the frames, the step, playing); `time` was already there (012).
- **Map**:
  - `LayerSources.layerTiles(layer, asOf)` keeps past instants' TileJSONs apart from the live one
    (the last 200). `forgetTiles()` drops the decoded tiles.
  - `RecordLayer` reads its TileJSON as of the context's `asOf`.
  - `RecordLayerSet.setAsOf` redraws every layer from that instant's template. While pinned, the
    stream's changes and resyncs are not applied; back at live, the tile cache is dropped so every
    tile is fetched afresh.
  - `RecordLayerSet.setFrame` shows a history step in place of the tiles, through the new
    `FrameLayer`: the same symbols, the same shared billboards, picked the same way.
  - `TrailBridge` draws the selected record's trail.
  - The scene clock follows the cursor, so the terminator stands at the pinned instant.
  - The map region carries `data-time`, `data-playback` and `data-trail`.

## How it was checked

### Tests

- `time/scrub.test.ts`: the mapping and its inverse, clamping, formats, step, instant clamp.
- `time/history.test.ts`: keyframe then frames, replacement and removal, stepping back,
  `timeAt`/`indexAt`, approximate, `frameFeature` (including an id with colons, and no position).
- `time/trail.test.ts`: segments and repeated positions, a stationary record, no geometry.
- `time/timeApi.test.ts`: the query each request sends.
- `map/records/layerSources.test.ts`: a new test covers the live and as-of TileJSON kept apart,
  tiles asked with the template's `asOf`, and `forgetTiles`.
- `views/global/TimeHud.test.tsx` (5 tests):
  - live time and handle at Now; the histogram request and bars; the approximate chip;
  - keys pin and return to live, never into the future;
  - drag shows the instant and pins on release; back near Now is live;
  - playback from six hours ago steps the store and the cursor, stops at the end, restarts,
    pauses, and ends on Return to live;
  - play is disabled with no layer on.
- `e2e/time-machine.e2e.ts` (2 tests): as in Results. The trail test serves one stand-in record
  and a stand-in track (see Backend observations).

### Checks

| Check                                                         | Result                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit -p .`                                       | clean                                                                                                                                                                                                                            |
| `npx eslint src e2e`                                          | clean                                                                                                                                                                                                                            |
| `npx prettier --check src e2e`                                | all files formatted                                                                                                                                                                                                              |
| `npx vitest run`                                              | 64 files, 400 tests passed                                                                                                                                                                                                       |
| `npm run build`                                               | built (the existing chunk-size warning only)                                                                                                                                                                                     |
| `npx playwright test` (full suite)                            | 16 of 17 passed. The 010 selection check failed: its stand-in records' tracks went to the backend and came back 404, logging 4 console errors. The fix: `standInQuakes` now also answers a stand-in record's track (stationary). |
| Re-run: the 010 selection check and `e2e/time-machine.e2e.ts` | 3 of 3 passed (49 s). Live 647 records; pinned at 02:49:01Z, 510; trail 0 → 54 accent pixels.                                                                                                                                    |
| Guard: `test_us_english.py`                                   | 14 tests, OK (243 s)                                                                                                                                                                                                             |
| Guard: `check_us_english.py --json …`                         | 796 hits, the same baseline as 012 (777 generated + 19 wire names); none in the new files                                                                                                                                        |

## Compared to the mock

`review/013-vs-global-mock-scrubber.png` sets the mock's HUD above the built one, live and pinned.

- **Matches:**
  - the date-time box and its format;
  - the green ◆ LIVE badge;
  - the `›` after it;
  - the scrubber box with `-24h -6h Now +6h +24h` evenly spaced, the handle at Now, the filled
    past and the tick at each mark.
- **Added:**
  - the histogram above the track, which the mock does not draw (the prompt asks for it);
  - the amber HISTORY state of the badge;
  - `Frame n of m` and ≈ Approximate beside the play button.
- **Differs:** the future half is dimmed, not plain. The mock shows forecast tracks there, and no
  product gives them yet.

## Decisions taken (unattended run)

1. **Evenly spaced marks, piecewise time.** The mock's labels are evenly spaced, so the track is
   linear between them, not across the whole day.
2. **No pinning in the future.** The cursor stops at Now. Forecast tracks are for a later prompt
   and need a product that provides them.
3. **Pin on release, not while dragging.** The box follows the drag; the map is pinned once, on
   release, so a drag costs one set of tiles.
4. **Resuming live.** The stream stays connected while pinned; its changes are not applied. At
   Now, the tile cache is dropped and every drawn tile is fetched afresh. That catches up exactly,
   from the tiles themselves, rather than replaying the changes from the frames' `watermarkSeq`.
5. **Playback draws frames, not tiles.** A step shows the frame entities at their positions,
   drawn with the layers' symbols. Pausing holds the frame; dragging or Return to live ends the
   playback. The frames' step is chosen for about 120 frames over the window, shown 600 ms each.
6. **Playback window.** It runs from the pinned instant, or six hours ago while live, to now.
7. **Trail window.** The trail covers the six hours before the cursor (the track's own default).
   During a playback it is read once, to the playback's end, not at each step.
8. **The scene clock follows the cursor,** so the day/night basemap matches the pinned instant.
9. **Histogram scope.** It counts the drawn kinds in the committed view, or every kind when none
   is on.

## Deviations from the prompt text

- **"Resume live from `watermarkSeq`":** done by fetching the tiles afresh while the one stream
  stays connected (decision 4). Nothing is replayed from `watermarkSeq`.
- **Re-pinning blinks.** Moving to a new instant redraws the layers from that instant's tiles, so
  the old instant's records go before the new ones land.

## Backend observations

- **Only earthquakes locally.** The local backend's changes feed holds earthquakes alone (1,000 of
  1,000 changes read were `earthquake`). An earthquake's track is one point repeated, so it draws no
  line. The trail check therefore serves a stand-in track for one stand-in record. The drawing,
  the request and its window are the app's own.
- **`step` accepts seconds and single units.** `300s`, `5m` and `90s` were accepted; `1h30m` and
  `5s` returned 400. The app sends whole seconds, never under 10.
- **`getTimeline` returned `approximate: true`** for the last day, with `retainedFrom` at the
  window's start. The chip shows it.

## Owner questions

1. **Forecast side.** Which product should draw tracks on the `+6h…+24h` half? **Default in place:
   dimmed, with no pinning in the future.**
2. **Product rasters while pinned.** Weather rasters stay live while the records are pinned. Should
   they take the product frame of the pinned instant? **Default in place: live.**
3. **Resume method.** Is fetching the tiles afresh at Now acceptable, or should the client replay
   changes from `watermarkSeq`? **Default in place: fetch afresh.**

Questions still open from earlier reports keep their defaults.
