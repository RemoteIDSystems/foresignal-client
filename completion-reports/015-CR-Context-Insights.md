# 015 — Completion Report: Context Insights

| Field                 | Value                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Status                | Complete                                                                                                              |
| Implementation commit | `2fb607b2b618b77ea7d55ebdfe41a972041a559a`                                                                            |
| Run mode              | Unattended (owner's batch 015–018, no review gates)                                                                   |
| Screenshots           | `review/015-context-insights.png` (both panels filled from a stand-in summary that names a live earthquake)           |
| Mock comparison       | `review/015-vs-global-mock-insights.png` (the mock's ACTIVITY TIMELINE and ANALYTICS & INSIGHTS above the built ones) |

## Results

The Activity Timeline and Analytics & Insights panels now come from `summarizeContext` for the
map's committed viewport. In `e2e/context-insights.e2e.ts`:

**Against the live backend:**

- Both panels say the view has nothing ("No activity in this view.", "No forecasts in this view.").
  The local backend answers every region with empty `activity`, `insights` and `related`: for the
  United States box over the last 24 hours, curl returned `"activity":[],"insights":[],"related":[]`
  with 367 earthquakes in `layerCounts`.
- Last Updated is the backend's own `generatedAt`.
- The window asked for is the 24 hours before now.
- Moving the map asks about the new view.

**With a stand-in summary** (its activity names a real live earthquake by its ref):

- Three activity rows, newest first, each with its HH:MM (UTC), icon and family chip; one with
  no family shows its type (Situation Change).
- Two numbered forecasts with their basis line, percent and ICD term.
- With the map moved away and the earthquake layer on, a click on the earthquake's row:
  - selects it on the map (`data-selected`);
  - opens its dossier from the live backend (014);
  - brings it to the middle of the map (within 40 px).
- The All Sources filter narrows the timeline to one family.

## What was built

- **`state/contextSummary.ts`**:
  - `summarizeViewport` now reads the whole summary, not just the counts: the activity (newest
    first), insights, related objects, `cacheAgeSeconds` and `truncated`.
  - A view across the antimeridian is asked about in two halves. Their counts are added; their
    rows are merged once each.
  - Pinned to an instant by the time machine (013), it asks with `asOf` over the 24 hours before
    that instant.
  - `useContextSummary` replaces `useViewCounts`:
    - it reads 400 ms after the viewport or instant settles, canceling an older request;
    - it reads again once the backend's cached copy has expired (30 s after it was made, by
      `cacheAgeSeconds`), and at least every minute;
    - a failed read keeps the last summary and says why.
  - The layer rail's counts (008) come from the same summary, so there is one request per view.
- **`objects/selectObject.ts`** (`hitForRef`): makes a selection from an object ref.
  - It reads the dossier, which is kept, so the panel opens it at once.
  - A record is selected as the map would pick it (kind, source, external id), so its marker
    shows.
  - Any other object carries its ref and has no map position.
  - The page's `selectRef` puts it in the store. When the dossier does not load, the object is
    still selected by its ref, so the panel says why.
- **The map's focus (014)** now follows every new selection, including one made in a panel. It
  skips aggregate cells and objects with no position.
- **`views/global/insightsView.ts`**:
  - each signal family's icon, color and chip, by its leading word, so `aviation-military` and
    `aviation-ops` share one; an item with no family looks by its type;
  - family labels, the filter, and the row time;
  - which insight kind each tab lists: Detections are findings, Hypotheses are band changes,
    Forecasts are forecasts;
  - the basis line (issuer, base rate, knowledge cutoff, and whether a language model wrote the
    text);
  - the percent, and the ICD term's tag and tone.
- **`ActivityTimelinePanel`**:
  - the All Sources filter (the families present);
  - the rows, each a button that selects its object;
  - loading, empty and error lines.
- **`InsightsPanel`**:
  - the four tabs; Related Events lists the summary's `related` objects (open situations);
  - numbered rows with title, basis, percent pill and ICD tag, each selecting its object;
  - View Full Analysis (disabled);
  - Last Updated from `generatedAt`.
- The panels' placeholder rows were deleted from `placeholderData.ts`.

## How it was checked

### Tests

- `state/contextSummary.test.ts` (5): the body, the antimeridian halves, the merge (newest
  first, deduplicated, oldest cache age, truncation), the as-of body, the refusal.
- `state/useContextSummary.test.tsx` (2):
  - the debounce, only the latest viewport, and the re-read after the cache expires (none at
    29 s, one by 31 s);
  - a failed read keeps the summary and gives the error.
- `objects/selectObject.test.ts` (2): a record (decoded id, kind from the overview, position) and
  a situation (by ref, no position).
- `views/global/insightsView.test.ts` (6): looks, labels, filter, time, tabs, basis, percent and
  term tags.
- `views/global/BottomPanels.test.tsx` (5):
  - the timeline rows, the filter and a selection;
  - the empty and error lines;
  - every insight tab with its rows, the related events and their selection;
  - the loading line.
- `e2e/context-insights.e2e.ts` (2): as in Results.

### Checks

| Check                               | Result                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit -p .`             | pass                                                                                                                                                                                                                                                                                                                                                       |
| `npx eslint .`                      | pass                                                                                                                                                                                                                                                                                                                                                       |
| `npx prettier --check src e2e`      | pass                                                                                                                                                                                                                                                                                                                                                       |
| `npx vite build`                    | pass (the existing chunk-size warning)                                                                                                                                                                                                                                                                                                                     |
| `npx vitest run`                    | 442 passed                                                                                                                                                                                                                                                                                                                                                 |
| `e2e/context-insights.e2e.ts` alone | 2 passed                                                                                                                                                                                                                                                                                                                                                   |
| Full e2e (`npx playwright test`)    | 20 passed, 1 failed: `dense-rendering` saw one `400 (Bad Request)` console error. Re-run alone with a temporary logger for 400 responses: passed, no 400 logged (the logger was removed; the file is unchanged). During the full run I edited a comment in `state/contextSummary.ts`, which the dev server reloads; the cause of the one 400 is not known. |
| `test_us_english.py` (guard)        | 14 tests OK                                                                                                                                                                                                                                                                                                                                                |
| `check_us_english.py` over the tree | 796 hits, the baseline (777 generated, 19 wire names); the new files return `[]`                                                                                                                                                                                                                                                                           |

## Compared to the mock

`review/015-vs-global-mock-insights.png` sets the mock's two panels above the built ones.

- **Matches:**
  - ACTIVITY TIMELINE with the All Sources selector;
  - rows with time, family icon, title and a colored family chip;
  - ANALYTICS & INSIGHTS with Detections, Hypotheses, Forecasts and Related Events (Forecasts
    first);
  - numbered rows with a title, a one-line basis, a percent pill and a tag;
  - View Full Analysis and Last Updated.
- **Differs:**
  - The tag after the percent is the ICD likelihood term (Likely, Unlikely), not Low, Medium or
    High. The backend's insight has no confidence field (see Owner questions).
  - The family chips are the backend's signal families (Seismic, AIS Loitering), not the mock's
    categories (Geologic, Maritime).
  - View Full Analysis is disabled: there is no analysis view yet.
  - The timeline's row count is whatever the backend gives; the mock shows ten.

## Decisions taken (unattended run)

1. **Window:** the 24 hours before now, or before the time machine's instant. The prompt names a
   "time window" without a length; the layer counts (008) already used 24 hours.
2. **Refresh:** after the backend's cache expires, at least every minute. A view's summary does
   not change faster than the backend's 30 s cache.
3. **Families:** looked up by the family's leading word. The registry is operator-extensible, so
   an unknown family gets a plain dot and its name.
4. **Tabs:** Detections are `finding`, Hypotheses are `band-change`, Forecasts are `forecast`, and
   Related Events are the summary's `related`.
5. **Rows select their objects** through the dossier, so a record is marked on the map and the map
   moves to it (014). A record whose layer is off is not marked on the map (010); its dossier
   still opens.
6. **View Full Analysis** is disabled until an analysis view exists.
7. **One request per view.** The layer counts and the two panels share the summary.

## Deviations from the prompt text

- **"Handle `409 WORKSPACE_CONTEXT_INCOMPLETE`":** the OpenAPI gives this error to
  `getWorkspaceSummary`, not to `summarizeContext` (whose responses are 200, 400, 401 and 429).
  The panels summarize the map's view, which always has a viewport and a window, so it cannot
  arise. Any refusal shows as the panels' error line, keeping the last summary.
- **"Show … confidence":** shown as the ICD term. The insight has no confidence field.
- **"Playwright: panels show live activity/insights for a region":** the local backend has none
  for any region, so the live run checks the empty state, and the filled rows use a stand-in
  summary (the selected object is real).

## Backend observations

- **Empty locally.** `activity`, `insights` and `related` are empty for every region; only
  `layerCounts` has data (earthquakes).
- **No confidence on insights.** The schema has `ConfidenceLevel` (low, moderate, high), but
  insights carry only `probability` and `estimativeTerm`.
- **`narrative`** is in the response, null locally, and not shown: the prompt does not ask for it.

## Owner questions

1. **Low/Medium/High tag.** Should insights carry the backend's `ConfidenceLevel`, so the mock's
   tag can show analytic confidence? **Default in place: the ICD likelihood term.**
2. **Window length.** Is 24 hours the right window for the view's activity? **Default in place:
   24 hours.**
3. **View Full Analysis.** Where should it go? **Default in place: disabled.**

Questions still open from earlier reports keep their defaults.
