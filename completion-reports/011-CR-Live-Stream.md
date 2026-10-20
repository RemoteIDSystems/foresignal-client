# 011 — Completion Report: Live Stream

| Field                 | Value                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------- |
| Status                | Complete                                                                                  |
| Implementation commit | `68aa2ff968b92f0f258e0f0fea5d47d14fbf0b09`                                                |
| Run mode              | Unattended (owner's batch 011–014, no review gates)                                       |
| Live update           | `review/011-live-stream.png` (stand-in quakes: two drawn first, three more live)          |
| Mock comparison       | `review/011-vs-global-mock-live.png` (the mock's time HUD and LIVE chip beside the built) |

## Results

The page now holds **one** connection to `streamEvents` (`GET /v1/events/stream`, topic `changes`)
for as long as a view holds it. The connection is narrowed to the drawn kinds in the committed
view. The checks below ran against the real backend on `localhost:8080`:

- **Connects and stays connected.** `hello` arrives and the badge reads green `◆ LIVE`. The backend
  then sends heartbeats: a 40 s curl of the stream printed two after `hello`, consistent with the
  spec's 15 s default.
- **Re-filters in place.** Turning the earthquake layer on or off sends one
  `updateEventStreamFilter` PATCH, with the anonymous `Foresignal-Stream-Key`. The backend answers
  `filter-applied`, and the badge's filter version goes up by one. No second stream is opened.
- **Resumes after a forced reconnect.** The stream reconnects with `Last-Event-ID: c=<last seq>`
  and is live again. The browser recorded exactly two stream requests, and the first was closed.
- **Shows a live change on the map.** This needed a scripted stream, because live earthquakes
  arrive only a few times an hour. The run went like this:
  1. A `change` for a new quake arrives. The tile it falls in is fetched again, and the quake
     appears without the view moving: 2 → 3 records.
  2. The stream then drops. The reconnect first reads `listChanges?after=5001`, which returns the
     quake missed while the stream was down (3 → 4).
  3. It then opens with `Last-Event-ID: c=5002`. The server's replay of 5002 is not handed on
     twice, and 5003 is new (4 → 5).

  The page's listeners were handed exactly `[5001, 5002, 5003]`: nothing lost, nothing doubled.

## What was built

### The stream client (`src/api/stream/`)

- **`sse.ts`**:
  - `SseParser`: the WHATWG event-stream format. It handles CR, LF and CRLF endings, lines split
    across chunks, comments, multi-line data and the `id:` field.
  - `fetchSseTransport`: reads the stream over `fetch` rather than `EventSource`, because:
    - a reconnect can then send `Last-Event-ID` itself;
    - a refused stream's status, problem body and `Retry-After` can be read (410
      RESYNC_REQUIRED, 429 STREAM_LIMIT, 401). An `EventSource` reports only "error".
- **`ChangeStream.ts`**: the one stream.
  - **Filter.** `setFilter({kinds, bbox})` is debounced 400 ms (the spec asks for 300–500) and
    sent as a PATCH, one at a time. A filter swap stays pending until its `filter-applied`
    arrives. A 404 on the PATCH means the stream is gone, so a new one opens with the filter in
    its URL.
    - More than 100 kinds (the spec's `maxItems`) are not filtered by kind at all.
    - The whole world sends no bbox.
  - **Resume.** It keeps the composite cursor of the last `change` (`c=1001`, other topics' parts
    kept). Before any change arrives, `hello`'s `watermarkSeq` is the resume point.
  - **Catch-up.** Before every reconnect it pages `listChanges(after=lastSeq)` under the same
    filter, up to 10 pages of 1000. Changes are handed on once each, by seq.
  - **Liveness.**
    - 45 s of silence (three missed 15 s heartbeats) drops the connection.
    - Reconnects back off from 1 s, doubling to 30 s, with ×0.5–1.5 jitter, or wait the server's
      `Retry-After`.
  - **Resync.** These reload the drawn layers:
    - 410 RESYNC_REQUIRED from the stream or from catch-up;
    - `reset {reason: resync_required}`;
    - a `resync` event (the stream stays open);
    - a catch-up longer than 10 pages.
  - **Other events.**
    - `reset` with `resumeAfter` reconnects at once from that seq.
    - 400 INVALID_CURSOR drops the cursor and resyncs.
  - **Hidden page.** A page hidden for 60 s closes the stream (`paused`). It is caught up when the
    page shows again.
  - **Tickets.** With a token, each connection carries a fresh `?ticket=` from
    `createStreamTicket`. A 401 invalidates the ticket source.
  - **Sharing.** `retain()` shares the one connection. It closes 1 s after the last release, so
    React's development double effects and a quick route change back do not open a second.
  - **Status.** `getStatus` and `subscribeStatus` feed `useSyncExternalStore`.
- **`session.ts`**:
  - The session owns the page's one `ChangeStream`.
  - A token change reconnects it, so the new token's ticket applies.

### The map follows it

- **Records** (`liveChanges.ts`, `RecordLayer.refresh`, `RecordLayerSet.applyAreas`):
  - **Which tiles.** Each change, and each `live` position update, gives the boxes the record is
    in now and was in before (`bbox`, `prevPersistedBbox`, `prevLiveBbox` / `prevBbox`, or the
    point).
  - **Refetch.** The drawn tiles those boxes touch (widened by 1/32 of a tile for the vector
    buffer, hexagon tiles included) are dropped from the shared cache and fetched again. Each is
    drawn over itself, with no blink. A tile still in flight is asked for again, since it may
    predate the change.
  - **Throttle.** Changes are gathered per layer for 1 s, so a busy kind costs about one tile
    round per second. Past 200 boxes in one second, every drawn tile of the layer is fetched
    again.
  - **Resync.** Every drawn tile is fetched again.
- **Product frames** (`frameFeed.ts`, `FrameWatcher`):
  - A `raster-frame` change carries its frame inline (`RasterFrameEvent`, observation variant). It
    is handed to that product's layers, which swap to the frame's own content-addressed template
    (the 009 swap, without blinking).
  - While the stream is live, the 009 polling drops to every 10 minutes as a safety net. A frame
    older than the one drawn is ignored.
- **The LIVE badge** (`LiveBadge.tsx`) replaces the time HUD's static chip:
  - green `◆ LIVE` when connected, as in the mock;
  - amber `CONNECTING` or `RECONNECTING`, with the reason and next attempt in its title;
  - gray `PAUSED` or `OFFLINE`.
  - Its `data-*` attributes expose the state, filter version and last seq to the e2e checks.
- **The Global page** holds the stream while it shows. It filters to the drawn kinds, plus
  `raster-frame` when product layers are on, in the committed view. In development the engine
  probe exposes the stream to the e2e checks.

## How it was checked

### Tests

- `ChangeStream.test.ts` (19 tests, a fake event source and a fake backend):
  - one stream, its URL and filter, live on `hello`;
  - each change once, in seq order;
  - **heartbeat timeout:**
    - the reconnect catches up with `listChanges`, then sends `Last-Event-ID`;
    - the replayed seq is skipped;
  - **backoff:** 1, 2, 4, 8, 16, 30, 30 s, reset after a good connection;
  - `Retry-After`;
  - **resync:**
    - 410 from the stream;
    - 410 from catch-up;
    - a catch-up too long to read;
    - `reset` (both kinds);
    - the `resync` event;
  - **filter:**
    - debounced to one PATCH, with the stream key and the full `changes` block;
    - pending until `filter-applied`;
    - a 404 opens a new stream;
    - more than 100 kinds and the whole world;
  - **tickets:** a fresh ticket per connection with a token, none without;
  - the hidden page and the shared holder;
  - `withChangesCursor`.
- `sse.test.ts`:
  - the parser: the backend's format, CR/LF/CRLF, split chunks, comments;
  - the transport: headers, events, a refused stream's status, body and Retry-After, closing,
    network failure.
- `liveChanges.test.ts`:
  - change and live boxes;
  - point fallback;
  - raster frames excluded;
  - a tile's buffer and the antimeridian.
- `frameFeed.test.ts`:
  - reading a frame from a change;
  - forecast runs, tombstones and other kinds;
  - per-product delivery.
- `layerSources.test.ts`: a forgotten tile is fetched again, and only it.
- `LiveBadge.test.tsx`: OFFLINE → CONNECTING → LIVE → RECONNECTING from a real `ChangeStream`.
- `e2e/live-stream.e2e.ts`: the two checks under Results, one against the real stream and one
  scripted.

### Checks

| Check                                                         | Result                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `npx tsc --noEmit`                                            | Pass                                                                      |
| `npx eslint src e2e`                                          | Pass                                                                      |
| `npx prettier --check src e2e`                                | Pass                                                                      |
| `npx vitest run`                                              | 58 files, 369 tests, all pass                                             |
| `npx playwright test` (software, alone on the backend)        | 14 tests, all pass (9.3 min)                                              |
| `npm run build`                                               | Pass                                                                      |
| `python3 ~/Documents/GitLab/meshdtn/style/test_us_english.py` | 14 tests, OK (run on the implementation commit)                           |
| `check_us_english.py`                                         | 796 hits: 777 in the generated schema, 19 wire names (unchanged from 010) |

**The e2e suite and the rate limit.** Two suite runs that overlapped by mistake failed on 429s
(see Backend observations). After that, the suite was run again alone. Two changes to the checks
came out of it:

- **The checks' own backend reads** (`getBackend` in `e2e/support.ts`) wait out a 429, as the
  app's client does.
- **`collectProblems` ignores only the browser's line for a 429 response.** It is the line the 010
  stress test already filtered. The app waits and retries those requests by design, and any other
  console error still fails a check.

The products spec passed alone (3 of 3) before this change. It failed only after other specs had
used up the limit.

## Compared to the mock

`review/011-vs-global-mock-live.png` sets the mock's time HUD beside the built one.

- **What matches:** a green `◆ LIVE` chip on a dark green ground, beside the date-time box, at the
  top left of the map.
- **What differs:**
  - the mock has a small `›` after the chip; the built HUD does not (013 rebuilds the time HUD);
  - the date-time box and scrubber are still placeholders until 013.
- **The Activity Timeline** the prompt names under Design is still its placeholder. The code says
  015 fills it from `summarizeContext`, so it was left for 015 (owner question 3).

## Decisions taken (unattended run)

1. **`fetch`, not `EventSource`.** A fresh connection can then carry `Last-Event-ID`, and a refused
   stream says why.
2. **A ticket whenever there is a token.** The spec's ticket is the stream credential for clients
   that send no `Authorization`. This client could send the header over `fetch`, but tickets keep
   the token off a long-lived connection. Without a token, open reads apply.
3. **Topic `changes` only.** Alerts and notifications join the same stream in 017 and 018.
4. **The filter is the drawn kinds (plus `raster-frame` when products are on) in the committed
   view.**
5. **Live changes refresh tiles; they do not patch symbols in place.** Tiles are what the map
   draws, so a refetched tile is drawn with the backend's own styling properties and aggregation.
   The cost is one tile request per touched tile per second.
6. **Heartbeat timeout 45 s, hidden grace 60 s, release grace 1 s, catch-up cap 10 × 1000.**
7. **Raster frame swaps** use the observation variant. Forecast-run records are not drawn frame by
   frame by 009, so they are ignored.
8. **No `SharedWorker`.** The prompt makes it optional. One stream per tab, shared by every view in
   the tab.
9. **The 011 "per-key deltas to the store"** go to listeners on `ChangeStream` (`changes`, `live`,
   `resync`). 012 builds the store and routes them into its keys.

## Deviations from the prompt text

- **The visible live update was proven with a scripted stream.** Live earthquakes arrive a few
  times an hour, and nothing else has records. The real stream proved connection, re-filtering and
  resume.
- **410 was not reproduced live:** `purgeHorizon` is 0 on this backend. It is covered by the unit
  tests.

## Backend observations

1. **The heartbeat is about every 15 s**, as the spec says, and `hello` carries a `streamKey` for
   anonymous callers.
2. **A PATCH with `kind: []` is accepted (200).** The spec does not say whether an empty list means
   every kind or none, so the client never sends one: it always includes `raster-frame` or omits
   `kind`.
3. **A PATCH right after the client disconnected still answered 200**, presumably before the server
   noticed the close. The client treats a later 404 as "reopen".
4. **The anonymous rate limit carries across a suite of e2e checks.** Each check loads the whole
   map, and a check that follows the full-catalog stress test meets 429s. The app recovers, and
   the checks now tolerate it (above).

## Owner questions

1. **Live symbols between tile refreshes.** Moving kinds (aircraft, vessels) would be smoother if
   `live` positions moved their symbols in place rather than refreshing tiles once a second. Is
   that wanted? **Default in place: tile refresh, throttled to 1 s per layer.**
2. **Stream credentials.** Is the ticket the wanted credential when a token is set, or should the
   stream send `Authorization` over `fetch`? **Default in place: ticket.**
3. **Activity Timeline.** The 011 prompt points at it as design context; the placeholder says 015.
   Should it show stream changes as they arrive (earthquakes now), or wait for 015's
   `summarizeContext`? **Default in place: left for 015.**

Questions still open from earlier reports (010: rate limit, decluttering, hover; 009 and earlier)
keep their defaults.
