# 012 — Completion Report: State Store

| Field                 | Value                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------- |
| Status                | Complete                                                                                    |
| Implementation commit | `af054b716091669074b007144e23f52fb1787ac2`                                                  |
| Run mode              | Unattended (owner's batch 011–014, no review gates)                                         |
| Screenshot            | `review/012-state-store.png` (the page left and come back to: 3D over Europe, layer on)     |
| Mock comparison       | `review/012-vs-global-mock-scene.png` (the mock's scene toggle beside the store-driven one) |

## Results

The app's shared state now lives in one keyed store (`src/state/store.ts`) on
`useSyncExternalStore`. Each key has its own listeners, so a write tells only the components that
read that key.

**Render counts.** `store.test.tsx` mounts six components, each reading one key, plus one reading
two keys, and counts their renders:

- **Toggling a layer** re-renders only the `layers` reader.
- **Moving the camera** re-renders only the `viewport` readers. The same view committed again
  re-renders nobody.
- **A stream delta of three earthquake changes** re-renders only the `layer:earthquake` reader, and
  only once. The `layer:vessel` reader does not move.
- **Switching to the globe** re-renders only the `sceneMode` readers.
- **A resync** re-renders the kinds the stream has spoken of, and no others.

**In the running app** (`e2e/state-store.e2e.ts`, against the live backend):

1. Turn earthquakes on, switch to the 3D globe, and move over Europe.
2. Leave for the Analyst view (the Global page and its map unmount), then come back.

The new map:

- is created in 3D (`scene.mode` is 3 at once, not morphed there);
- opens over Europe (10°E 50°N in the middle half of the canvas);
- still has earthquakes on and drawn.

Then the 2D tab switches it back through the store. Before 012 all of this was component state and
was lost on the way out.

## What was built

- **`state/store.ts`**:
  - `createStore` gives `get`, `set`, `update`, `merge`, `batch` (one notification per key for many
    writes), `subscribe(key)` and `keys`.
  - **Stable merge.** `reconcile` compares plain objects and arrays by content. An equal write keeps
    the held value and tells no one; a partly changed object keeps the identity of its unchanged
    parts. Class instances compare by identity.
  - `appStore` is the singleton.
  - `useStoreKey(key)` and `useStoreKeys([...])`. The second returns the same object until one value
    changes; its reader, `keysReader`, is exported for non-React use.
- **Keys** (`AppState`):
  - `sceneMode`;
  - `viewport` (bbox and zoom);
  - `layers`: enabled kinds and product keys (undefined until the user chooses, so the catalog
    defaults apply) and hidden sources, as sorted arrays;
  - `selection`;
  - `time` (`live`, or `asOf` and an instant);
  - `inbox` (`unread`);
  - `workspaceContextVersion`;
  - `layer:<kind>`: per-kind live state (last seq, change, live and resync counts, time).
- **`state/liveDeltas.ts`**: `connectStreamToStore` applies the 011 stream per key.
  - Each delivery's changes are batched, so a page of catch-up changes is one notification per kind.
  - Live updates bump their kind.
  - A resync bumps every kind seen.
  - The session wires it at start-up.
- **Wired through the store** instead of local state:
  - **Viewport.** `viewportStore` is now a view of the `viewport` key (`viewportOf`), so the
    `ViewportTracker`, the counts summary, product loops and the stream filter all read the store.
  - **Scene (005).** The toggle writes `sceneMode`; the map morphs to whatever the key says, so 014
    can switch it. A new map is created in the stored mode.
  - **Start view.** A new map opens over the stored viewport (the home view when there is none, or
    when it was the whole world).
  - **Layers (007/008).** The enabled kinds, enabled products and hidden sources live in the
    `layers` key. The rail and the map read them from the store, through the page.
  - **Selection (010).** The selection lives in the `selection` key.
- `MapViewer` and `GlobalDashboard` take an optional `store` (the app's by default). The session
  gets an isolated store in tests.

## How it was checked

### Tests

- `store.test.tsx` (7 tests):
  - `reconcile`: equal content kept, unchanged parts' identity kept, added and removed fields seen,
    class instances by identity;
  - per-key listeners, no notification for an equal write;
  - `merge`;
  - one notification per key in a batch;
  - unsubscribe;
  - the render-count test above, with the real hooks and `connectStreamToStore` on a stand-in
    stream.
- `e2e/state-store.e2e.ts`: as above.
- Every earlier unit test and e2e check runs over the store now (the rail toggles, the 2D/3D
  switches, the filters, the picking, the stream).

### Checks

| Check                                                         | Result                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `npx tsc --noEmit`                                            | Pass                                                                      |
| `npx eslint src e2e`                                          | Pass                                                                      |
| `npx prettier --check src e2e`                                | Pass                                                                      |
| `npx vitest run`                                              | 59 files, 376 tests, all pass                                             |
| `npx playwright test` (software, alone on the backend)        | 15 tests, all pass (9.5 min)                                              |
| `npm run build`                                               | Pass                                                                      |
| `python3 ~/Documents/GitLab/meshdtn/style/test_us_english.py` | 14 tests, OK                                                              |
| `check_us_english.py`                                         | 796 hits: 777 in the generated schema, 19 wire names (unchanged from 011) |

## Compared to the mock

The store has no look of its own. `review/012-vs-global-mock-scene.png` sets the mock's scene
toggle on 3D Globe beside the built toggle as the store restored it, after leaving and returning.

- **Matches:** the highlighted 3D Globe segment.
- **Differs:** the mock's Split segment is absent, as decided earlier (no Split mode).

The page in `review/012-state-store.png` is otherwise the 011 page.

## Decisions taken (unattended run)

1. **One store, keyed, hand-written.** Architecture §6.2's "small reactive singleton", with no
   dependency.
2. **Per-kind live keys are `layer:<kind>`.** Architecture §6.2 names `layers:<id>`. The prompt's
   key list has `layers` for the enabled set, so the per-kind keys are singular to keep the two
   apart.
3. **The stream's records do not go into the store.** The map draws from tiles and refreshes them
   (011); the store gets each kind's live counters. That is what a panel needs to know a kind
   changed, without the store holding every record.
4. **Sets are stored as sorted arrays,** so content comparison is cheap and stable.
5. **The camera itself is not in the store,** only the committed viewport. The camera moves every
   frame, and the HUD keeps its own frame-rate store (010).
6. **The selection stays a `RecordHit`.** 014 adds the object ref.

## Deviations from the prompt text

- **"The map and rail read from the store":** the rail reads it through the Global page's context,
  which is fed from the store. A component outside the page (another view) reads the store
  directly with the hooks.

## Owner questions

1. **Persisting across reloads.** The store outlives the page but not a browser reload. Should the
   layers, scene and viewport be saved (localStorage, or the backend's saved views)? **Default in
   place: not persisted.**
2. **One scene for every map.** `sceneMode` is one key, so two maps on one page (the mock's
   Split-Screen dashboard) would share it. Should each map have its own? **Default in place: one.**

Questions still open from earlier reports keep their defaults.
