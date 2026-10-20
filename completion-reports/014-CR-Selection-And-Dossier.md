# 014 — Completion Report: Selection And Dossier

| Field                 | Value                                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                | Complete                                                                                                                                                        |
| Implementation commit | `15934a17c0d89fe71f9643481ca9ac826823091a`                                                                                                                      |
| Run mode              | Unattended (owner's batch 011–014, no review gates)                                                                                                             |
| Screenshots           | `review/014-dossier.png` (a live earthquake's dossier, map kept in 2D); `review/014-dossier-3d.png` (a storm-like item: globe, actions, an unavailable section) |
| Mock comparison       | `review/014-vs-global-mock-panel.png` (the mock's SELECTED ENTITY panel beside the built one)                                                                   |

## Results

Clicking a record on the map now opens its dossier in the right-hand panel, read from
`getObjectDossier`. In `e2e/selection-dossier.e2e.ts`:

**A live earthquake** (from the backend's own records):

- The panel reaches `ready` for `record:usgs-earthquakes/<id>`.
- Its title is the one `getObject` gives for that ref.
- It shows the key fields (Type, three overview fields, Location, Last Update), the backend's
  Recent Updates (its versions), and "No imagery for this object." for the empty imagery section.
- An earthquake has no 3D view: the map stays in 2D. The record was already in view, so the map
  does not move (under 3 px).

**A storm-like item** (a stand-in record and a stand-in dossier):

- The scene switches to the 3D globe (`scene.mode` 3).
- The camera flies to look down on it: 1,000–3,000 km away, pitched below −30°, the item within
  40 px of the center.
- The imagery section is `unavailable`, and its message shows where the image would be, while the
  key fields and recent updates render.
- The envelope's three actions: Track and Add to Workspace as buttons, Annotate under `…`.
- The Impacts tab says it is not installed on this server.
- The Forecast Track mini-map shows.

**ETag.** The dossier is revalidated with `If-None-Match`, and a 304 reuses the kept copy:

- in the unit tests;
- against the live backend with curl, the dossier's `ETag` sent back gave `304`.

## What was built

- **`lib/objectRef.ts`**:
  - `parseObjectRef` reads a ref's type and id, and for a record its source, decoded external id
    and `@seq`.
  - `formatObjectRef`, `recordRef` (external id percent-encoded) and `refPathSegment`.
  - The API client encodes the `{ref}` path parameter as one segment, so the ref's own encoding is
    kept: `/` in an id goes as `%252F`.
- **`objects/objectApi.ts`**:
  - `getObject` and `resolveObjects`.
  - `DossierSource`, one per client, keeps the last 50 dossiers with their ETags. It sends
    `If-None-Match` and returns the kept dossier on 304.
- **`objects/useDossier.ts`**: reads the selected object's dossier.
  - It is read as of the time machine's instant while the map is pinned (013).
  - It is read again (by ETag) when the store's `layer:<kind>` says the stream changed that kind
    (012).
- **`objects/dossierView.ts`**:
  - the key facts after the mock's six rows;
  - field labels (`maxWind` reads Max Wind);
  - places as `28.4°N, 76.5°W` and times as `2025-09-18 14:00Z`;
  - each status's message (the backend's own message first);
  - the related count, action labels and status tones.
- **`objects/threeD.ts`**: the kinds with a 3D view.
  - Altitude: aircraft, derived aircraft, drones.
  - Orbit: satellites, satellite passes, launches, re-entries.
  - Storm structure: cyclones, their tracks, cones and forecast points, and storm tracks.
- **`map/focus.ts`** (contextual 3D):
  - An item with a 3D view writes `sceneMode` 3D to the store and, once the morph completes,
    flies to look down on it at 50°, from 2,500 km.
  - Any other item keeps the scene and is centered at the current height, unless it is already
    in the middle of the view.
  - The map runs this on each newly selected record, so a selection made elsewhere (search in
    017, related objects in 016) brings its item into view too. The selection a map opens with,
    restored from the store, does not move it.
- **`SelectedEntityPanel`** replaces the placeholder:
  - **Header**: the kind's icon from the overlay style, the title, the kind and status (and
    severity) badges, and `ID: …`.
  - **Tabs**: Overview, Imagery, Forecast, Impacts (with Analysis), Related (n).
  - **Overview**:
    - the latest image, or the imagery section's message;
    - the action buttons from the envelope (two shown, the rest under `…`);
    - the key fields;
    - the Forecast Track mini-map for storm-like kinds;
    - Recent Updates from the timeline section;
    - More fields.
  - **Sections**: each renders to its own `status`.
  - **Other states**: an empty state when nothing is selected, a note for a hexagon cell, a
    loading line, and the error when the dossier does not load.
- The page passes its store to the panel through the record-layers context.

## How it was checked

### Tests

- `lib/objectRef.test.ts` (5): parse, record parts and seq, encoding round trip, path segment,
  refusals.
- `objects/objectApi.test.ts` (4):
  - the ref sent as one segment;
  - resolve with missing refs;
  - ETag revalidation and 304 reuse, with an as-of dossier kept apart;
  - a problem raised.
- `objects/dossierView.test.ts` (8): key facts, field filtering, labels, formats, envelope point,
  section messages, related count, actions and tones.
- `objects/threeD.test.ts` (2).
- `views/global/SelectedEntityPanel.test.tsx` (6):
  - empty;
  - a cell;
  - the full dossier: header, facts, unavailable imagery, timeline, actions and overflow, a
    not-installed, an empty and a related tab;
  - revalidation on a stream change;
  - the as-of read;
  - the error.
- `e2e/selection-dossier.e2e.ts` (2): as in Results.

### Checks

| Check                                                                               | Result                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit -p .`                                                             | clean                                                                                                                                                                                                                                                 |
| `npx eslint src e2e`                                                                | clean                                                                                                                                                                                                                                                 |
| `npx prettier --check src e2e`                                                      | all files formatted                                                                                                                                                                                                                                   |
| `npx vitest run`                                                                    | 69 files, 425 tests passed                                                                                                                                                                                                                            |
| `npm run build`                                                                     | built (the existing chunk-size warning only)                                                                                                                                                                                                          |
| `npx playwright test` (full suite, 19 checks)                                       | 17 passed. 2 failed: the 010 selection check and 013's trail check select stand-in records, whose dossiers the new panel asked of the backend (404, logged as console errors). The fix: `standInQuakes` now also answers a stand-in record's dossier. |
| Re-run: those two, the rest of `time-machine.e2e.ts` and `selection-dossier.e2e.ts` | 5 of 5 passed (1.3 min)                                                                                                                                                                                                                               |
| Guard: `test_us_english.py`                                                         | 14 tests, OK (242 s)                                                                                                                                                                                                                                  |
| Guard: `check_us_english.py --json …`                                               | 796 hits, the same baseline (777 generated + 19 wire names); none in the new files                                                                                                                                                                    |

## Compared to the mock

`review/014-vs-global-mock-panel.png` sets the mock's SELECTED ENTITY panel beside the built one,
for the stand-in storm.

- **Matches:**
  - the header row with × and expand;
  - the icon box, title, kind and status badges and `ID:`;
  - the five tabs, with Related's count;
  - the image box on the left with the action buttons and `…` under it;
  - the key-fields column (Type, three fields, Location, Last Update);
  - FORECAST TRACK with its legend.
- **Differs:**
  - The image box shows the imagery section's message when there is no image.
  - The actions are disabled until their prompts wire them (025, 026).
  - The mini-map draws the storm's own track and current position; its Forecast and Cone legend
    entries read "(none)", because no dossier section carries forecast geometry.
  - Recent Updates and More fields sit under the key fields; the mock has neither in this panel
    (the Tropical Storm mock has Recent Updates).

## Decisions taken (unattended run)

1. **3D applicability is decided by kind, in the client.** The OpenAPI has no field for it. The
   search that would have found one: `grep -n -i "scene3d\|\"3d\"\|altitude\|preferred.*view\|view3d\|threeD\|globe"`
   on `openapi/OpenAPI.json`. Its hits are other things: a retention window's `3d` (days),
   altitude fields and the workspace topic's client kinds. `KindDisplay` has no such property.
   The list is in `objects/threeD.ts`.
2. **Earthquakes stay in 2D.** A hypocenter has depth, but the dossier shows no depth view.
3. **A 2D item already in view does not move the map.** "Fly/focus" is done only for an item
   outside the middle of the view, so picking on the map is not jolted.
4. **Actions:** all the envelope gives are shown (the backend lists only what the token may do).
   None has a client handler in 014. The prompt places add-to-workspace in 025 and annotate in 026,
   so they are disabled with a title saying so.
5. **The dossier follows the time machine** (asOf while pinned) and the live stream (revalidated
   by ETag when the kind changes).
6. **Selection stays a `RecordHit`.** The ref is derived from its source and external id;
   aggregate cells have none.
7. **Analysis is shown under Impacts.** The mock has no tab for it.

## Deviations from the prompt text

- **"Wire the read-scope ones":** rendered and disabled, not wired. Their targets come with
  025/026.
- **"Forecast Track mini-map":** drawn from the storm's own track (`getRecordTrack`), not from
  forecast points. The dossier's forecast section lists forecasts and questions but no track
  geometry.

## Backend observations

- **Anonymous actions.** For an anonymous caller the live earthquake's envelope has `actions: []`,
  so the action buttons were checked with a stand-in dossier.
- **Section statuses.** Every section of the live earthquake's dossier was `ok` or `empty`, so an
  `unavailable` section was also checked with the stand-in.
- **An unencoded slash in the ref.** `GET /v1/objects/record:usgs-earthquakes/nc75452571/dossier`
  returned 401, not 404. Encoded (`%2F`, or the whole ref with `%3A` too), it returned 200.
- **Only earthquakes locally.** The local backend's `listKinds` holds only `earthquake`, so the 3D
  case uses a stand-in `cyclone`. Aircraft points draw only from zoom 7 in the overlay style, so a
  stand-in aircraft could not be clicked at a 3D-switching view.

## Owner questions

1. **3D kinds.** Is the client list in `objects/threeD.ts` right, or should the backend declare a
   kind's 3D view (for example in `KindDisplay`)? **Default in place: the client list.**
2. **Focus in 2D.** Should picking a record on the 2D map always center it? **Default in place:
   only when it is outside the middle of the view.**
3. **Forecast geometry.** Which source should feed the Forecast Track's forecast points and cone?
   **Default in place: past track and current position only.**

Questions still open from earlier reports keep their defaults.
