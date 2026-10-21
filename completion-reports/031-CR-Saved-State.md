# 031 — Completion Report: Saved State

| Field                 | Value                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete)                          |
| Implementation commit | `321bd735b42624ad53703114f9f3b3768267ac1f`                                                                       |
| Run mode              | Unattended (owner's batch 023–036, no pausing)                                                                   |
| Screenshots           | None taken (compile-only run). `e2e/saved-state.e2e.ts` reads map pixels when it runs.                           |
| Mock comparison       | From the prompt's description and the existing rail entries in the code; no mock PNG was reread for this report. |

## Results

- **Saved views.**
  - **Save view** on the Global rail saves the drawn kinds, the map's view (bbox) and, when
    sources are hidden in Filters, the sources it keeps, as a view (`createView`). The slug comes
    from the name and is made unique against `listViews`.
  - **Reopening a view** draws it from **its own tiles** (`getViewTileJson`, the view tile
    template) and **its own live stream** (`streamView`), as one layer (`view:<id>`) in place of the
    kind layers. The map flies to the view's bbox. The rail's kinds are set to the view's kinds,
    so the layer toggles show the same state.
  - The rail shows the open view, with its layer's state (loading, ready and the record count,
    error), and a **Close saved view** button. Closing it draws the same kinds from the kind
    layers again.
  - The Saved dialog's **Views** tab lists the views, with **Open** and **Records** (the first 20
    of `getViewRecords`, each opening its record).
- **Places** (Places tab):
  - lists places (`listPlaces`) with **Fly to**, which recenters the map (a point from four times
    its radius, a polygon to its box);
  - **Weather** (`getPlaceWeather`): each weather section with the backend's status and value as it
    reports them, and an ECharts temperature chart, one line per forecast provider;
  - **New place**: a point place at the map's center (editable longitude, latitude, radius).
- **Watchlists** (Watchlists tab):
  - lists watchlists (`listWatchlists`); **Open** shows the items (`listWatchlistItems`);
  - **Add items** (`addWatchlistItems`): one per line, `value, label`; the reply's added and
    updated counts are shown;
  - **Current state**: the records of the watchlist's view (an `inWatchlist` view). Without one,
    **Track current state** creates it;
  - **Create alert for this watchlist** links to the 030 form (`/alerts?new=watchlist&ref=<id>`),
    which answers 030's owner question 4;
  - **New watchlist** (name and identity).
- **Entry points, as in the mock:**
  - Saved Views, Places and Watchlists on the Global rail (under Add Layer);
  - the Workbench WORKSPACE section;
  - the Analysis rail's **Saved Views** entry, which was a placeholder pointing to 031.

## What was built

- `src/saved/savedApi.ts`: the places, views and watchlists operations.
- `src/saved/savedView.ts`, which holds:
  - `slugOf`, `viewFromMap`;
  - `heightForBox`, `flyToBox`, `flyToView`, `geometryBox`, `flyToPlace`;
  - `pointPlace`, `parseItems`;
  - `weatherRows`, `temperatureSeries`;
  - `watchlistViewSlug`, `watchlistView`.
- `src/saved/openSaved.ts`: `openViewOnMap`, `flyToPlaceOnMap`.
- `src/saved/viewStream.ts`: `SavedViewStream`, a view's stream as the map's live areas.
- `src/saved/savedEntries.ts`: `SAVED_ENTRIES`, the three rail entries.
- Components:
  - `SavedRailSection.tsx`;
  - `SavedStateDialog.tsx`;
  - `ViewRecords.tsx`;
  - `PlacesTab.tsx`;
  - `WatchlistsTab.tsx`;
  - `Saved.module.css`.
- `src/map/records/`:
  - `viewLayers.ts` (`viewLayerId`, `viewIdOf`);
  - the view tile template in `tileTemplate.ts`;
  - the view TileJSON and tile reads in `tileSource.ts`;
  - `LiveAreaSource` in `liveChanges.ts`, with a `liveAreas` prop through `RecordLayersBridge` and
    `MapViewer`.
- Wiring:
  - `store.ts`: `LayersState.view` and `AppState.savedOpen`;
  - `Session.viewStream`;
  - the Global dashboard draws an open view in place of its kinds;
  - the dialog is rendered in the app shell;
  - the Analysis rail and Workbench entries.

## How it was checked

### Tests (written, not run)

- `map/records/viewLayers.test.ts` (3): the view layer names; a view tile template read into its
  view, keeping only the ticket; a view layer loaded from the view's TileJSON and a tile from the
  view's tile path (mock server).
- `saved/viewStream.test.ts` (1): the stream opens only while listened to, on
  `/v1/views/{id}/stream`; a change becomes the view layer's area; resync and reset reload;
  heartbeats and unreadable data are ignored; it closes when the last listener stops.
- `saved/savedView.test.ts` (8):
  - unique slugs;
  - the view built from the map, with sources only when some are hidden;
  - fly-to for boxes, across the antimeridian, and for point and polygon places;
  - a point place and watchlist items from text;
  - the watchlist view;
  - weather rows and forecast series as the backend reports them;
  - opening a view on the map, and flying to a place.
- `saved/Saved.test.tsx` (6):
  - the rail saves a view with the request body;
  - the open view's state, and closing it;
  - the dialog opens a view on `/global` and opens a record;
  - weather, a new place and fly-to;
  - watchlist items, adding items, the track and create-alert entries;
  - the token note.
- `e2e/saved-state.e2e.ts` (1), "save view → reopen restores layers". The views operations are
  stand-ins that keep what was saved; the view's tiles are the backend's real earthquake tiles.
  The spec checks:
  1. a person turns earthquakes on, saves the view, and the body names the earthquake kind;
  2. earthquakes are turned off, the view is reopened from **Saved Views**, and the open view
     shows ready;
  3. earthquake pixels are back on the map and the earthquake toggle is checked;
  4. closing the view keeps the records drawn;
  5. no console errors.

### Checks

| Check                                                       | Result                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run typecheck`                                         | Passed                                                                               |
| `npm run lint`                                              | Passed                                                                               |
| `npx prettier --check src e2e`                              | Passed                                                                               |
| `npm run build`                                             | Passed. `index` 847.07 kB (255.60 kB gzip)                                           |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                                                          |
| Guard: `test_us_english.py`                                 | 14 tests OK (170.8 s)                                                                |
| Guard: `check_us_english.py` over the project               | 803 hits, unchanged                                                                  |
| Guard: `check_us_english.py` over the new and changed files | 0 hits (`[]` for the working tree; "0 British spellings" over the commit's 34 files) |

## Compared to the mock

From the prompt's description and the code; no screenshot was taken.

- **Matches:**
  - Saved Views and Watchlists are entries in the left rails: the Global rail, the Workbench
    WORKSPACE section and the Analysis rail's existing Saved Views row;
  - each row opens;
  - places are areas of interest with fly-to;
  - a saved view reopens with the same layers.
- **Differs:**
  - **The mocks show the entries, not the screens they open.** The lists are one dialog with
    three tabs, styled like the other dialogs.
  - **Places** are a third rail entry beside Saved Views and Watchlists.

## Decisions taken (unattended run)

1. **An open view replaces the kind layers.** It is drawn as one layer from its own tiles and
   stream, as the prompt asks ("one source for a whole set"). The rail's kinds are set to the
   view's kinds, so closing the view leaves the same layers on.
2. **Choosing kinds closes the view**, since the map would no longer match it.
3. **Saving lives on the Global rail**, where the drawn kinds and hidden sources are known. The
   other rails open the list.
4. **Hidden sources are saved as an explicit `sources` list** of the drawn kinds' remaining sources.
   With nothing hidden, `sources` is left out (every source).
5. **Saved view defaults:** `timeField: effective`, `includeExpired: false`, as the Global map
   draws.
6. **A watchlist's current state** is an `inWatchlist` view with the slug `watchlist-<id>`, made
   when the person clicks **Track current state**, not silently.
7. **New places are points** at the map's center with a 20 km radius. Polygons are shown and flown
   to but not drawn here.
8. **The open view is not kept in the workspace** (027): a shared workspace keeps kinds, as before.
9. **`touch` stream events are ignored** (no geometry change); a view tile template's extra query
   (its version) is dropped and only a ticket is kept.
10. **Places and watchlists need a token**, as the backend says. Without one, the tab says so
    instead of asking.
11. **Backend values as is:** weather statuses, watchlist identities and item origins are shown as
    the backend names them.

## Deviations from the prompt text

- **`getPlace`** is wrapped in `savedApi.ts` but nothing calls it: the list carries what the screen
  shows.
- **The watchlist widget** is the Watchlists tab's **Current state** list, not a dashboard widget.
  No dashboard surface for widgets exists yet.

## Backend observations

These come from curl in this session:

- `GET /v1/views` answered `{"items":[],"nextCursor":null}`: no saved views locally.
- `GET /v1/places` answered **401**: "This endpoint always requires a token, even while open reads
  are on."
- `GET /v1/watchlists` answered **401**: "This endpoint requires a bearer token."
- The OpenAPI's view stream lists `change`, `live`, `touch`, `resync`, `reset` and `heartbeat`
  events.

## Owner questions

1. **Open view versus kinds.** Should an open view sit alongside the chosen kinds, rather than in
   place of them? **Default in place: in place of them, with the kinds set to the view's.**
2. **Saving filters.** Should a view also save the time machine's `asOf` and the find bar's text?
   **Default in place: kinds, kept sources and bbox only.**
3. **Watchlist views.** Should the backend make a watchlist's view itself (or offer a records read
   per watchlist)? **Default in place: a client-made `inWatchlist` view on request.**
4. **Place shapes.** Should drawing a polygon place on the map be part of this? **Default in
   place: point places only.**
5. **Workspace.** Should a shared workspace (027) carry the open view? **Default in place: no.**

Questions still open from earlier reports keep their defaults.
