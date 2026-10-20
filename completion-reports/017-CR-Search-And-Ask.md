# 017 — Completion Report: Search And Ask

| Field                 | Value                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                | Complete; the populated search and Ask paths are checked with stand-in answers (no token locally)                                                   |
| Implementation commit | `d247f4f0b0d86f49005efd23e8b1e492b98b3a32`                                                                                                          |
| Run mode              | Unattended (owner's batch 015–018, no review gates)                                                                                                 |
| Screenshots           | `review/017-search.png` (grouped results under the top bar's search); `review/017-ask.png` (the Ask panel's streamed answer with a citation chip)   |
| Mock comparison       | `review/017-vs-mocks-search-ask.png` (the Global mock's search box and the Conflict mock's TOOLS beside the built search, rail tools and Ask panel) |

## Results

The top bar's search, a find bar on the map, and an Ask ForeSignal panel opened from the left
rail now work against the backend. In `e2e/search-ask.e2e.ts`:

**Against the live backend, anonymously:**

- **Search:** the drop-down says "Search needs an access token, even with open reads. Add one in
  Settings." The live `search` answers 401 to an anonymous caller.
- **Search mode:** the line above the results reads "Text search: " followed by the live
  `getSearchStatus` reason, because semantic search is not enabled.
- **Ask:** says it needs a token and keeps the question in the box. Its Earlier questions view
  says the same.
- **Find bar, country:** "Japan", picked from the live reference countries, moves the map to
  Japan's label point (within 5 px of the middle) from 3,000 km.
- **Find bar, coordinates:** "33.9S 151.2E" moves the map there (within 5 px).
- **Console:** exactly three refusals logged (search, the Ask stream, the thread list), and
  nothing else.

**With stand-in search and Ask answers that name a live earthquake:**

- **Results:** grouped as Records (1) and Alerts (1).
- **Picking the earthquake:**
  - selects it (`data-selected`);
  - opens its live dossier;
  - centers the map on it (within 40 px).
- **Ask:** the streamed answer, "The strongest was" followed by the earthquake as a citation
  chip.
- **The chip:** with the selection cleared and the map moved to Africa, clicking it selects the
  earthquake again and brings the map back to it (within 40 px).

## What was built

- **`search/searchApi.ts`**:
  - `searchAll` sends `hybrid` while semantic search is ready and `text` otherwise, at most 20
    results;
  - `searchStatus`;
  - grouping by type (records, briefings, alerts);
  - each result's ref: a record's from its source and external id, `alert:<id>`,
    `briefing:<id>`;
  - plain-text snippets (the highlight tags dropped).
- **`app/SearchBox.tsx`**, the top bar's box, replacing the read-only input:
  - searches 300 ms after typing pauses (2 characters at least), canceling the older request;
  - the drop-down: the mode line, then the groups with their counts and, per result, an icon,
    title, snippet and kind;
  - the arrow keys, Enter and Escape work, and a click outside closes it;
  - **picking a result** selects its object (its dossier opens; 014). On the Global dashboard the
    selection moves the map. From another screen, it opens the Global dashboard and asks the map
    to move there.
- **`search/locate.ts`** and **`views/global/LocateBar.tsx`**, the find bar at the top of the map:
  - reads coordinates as `lat, lon`, or with N/S/E/W in either order;
  - matches countries by name, long name, alias or ISO code from the backend's bundled reference
    table (`listReferenceCountries`, open, read once);
  - picking one moves the map: a country from 3,000 km, a point from 250 km.
- **The store's `locate`** carries a request to move the map. The map flies there and clears it,
  including a request made before the map opened.
- **`search/askApi.ts`**:
  - `askStream` posts the question and reads the server-sent events over the API client (so it
    carries the token). Progress, text, citations and warnings go to handlers; it settles with
    the verified `done` answer. A refusal before the stream opens, or an `error` event, rejects
    with the problem. `allowActions` is always false.
  - `listAskThreads`, `getAskThread` and `deleteAskThread`.
- **`search/askView.ts`**:
  - each citation's ref (a record's `<source>:<id>` becomes `record:<source>/<id>`; a weather
    value selects nothing);
  - the answer split at its citation markers, with or without `@seq`;
  - the plain message for each refusal: no token, `LLM_NOT_CONFIGURED`, the model budget, a rate
    limit.
- **`views/global/AskPanel.tsx`**, over the map's left side:
  - the conversation: the question, then the answer as it streams (the current tool, the text,
    a caret), replaced by the verified answer when done;
  - citations as chips in the text where cited, the rest under "Sources:", and warnings under
    the answer;
  - a follow-up continues the thread; New question starts another;
  - Earlier questions lists the threads (title, last update, messages), opens one, and deletes
    one after "Confirm delete".
- **The left rail** gained a TOOLS section with Ask ForeSignal, as in the Conflict and Workbench
  mocks.
- **The "Placeholder panel data" chip** moved down to make room for the find bar.
- **A fix to the time machine (013): more than 100 kinds.**
  - The cause of the full-catalog check's intermittent 400. With every layer on, the scrubber's
    histogram asked `getTimeline` for all 190 kinds at once, and the backend refused it:
    `VALIDATION_FAILED`, "at most 100 values are allowed, got 190" (caught by logging the 400s in
    a repeat run, then reproduced with curl). `getHistoryFrames` refuses the same list the same way
    (curl).
  - `time/timeApi.ts` now asks in chunks of at most 100 kinds, in parallel, and merges the
    answers:
    - histograms summed by bucket time;
    - playback keyframes joined, and frames joined by time.

## How it was checked

### Tests

- `search/searchApi.test.ts` (3): the mode by readiness, grouping, refs.
- `search/locate.test.ts` (3): coordinate forms, refusals, country ranking.
- `search/askApi.test.ts` (3):
  - the stream, split across chunks with a heartbeat: progress, deltas, citation, warning, done;
    the Accept header, the bearer and the body;
  - a 409 `LLM_NOT_CONFIGURED`;
  - an `error` event, and a stream cut short.
- `search/askView.test.ts` (3): citation refs, answer pieces, refusal messages.
- `app/SearchBox.test.tsx` (4):
  - one debounced text-mode search, the mode line, the groups, a snippet, and the selection
    (no `locate` on the Global dashboard);
  - from another screen, Enter asks the map to move;
  - the token message;
  - plain snippets.
- `views/global/LocateBar.test.tsx` (2): a country, and coordinates on Enter.
- `views/global/AskPanel.test.tsx` (3):
  - a streamed answer, its chips selecting a record and an alert, and a follow-up in the same
    thread;
  - the `LLM_NOT_CONFIGURED` message with the question kept;
  - the thread list: open one, delete one after the confirm.
- `time/timeApi.test.ts` (+2):
  - 190 kinds are asked as 100 and 90, and the histograms summed;
  - 101 kinds' history frames are asked as 100 and 1, and the keyframes and frames joined by time.
- `e2e/search-ask.e2e.ts` (2): as in Results.

### Checks

| Check                                                       | Result                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `npx tsc --noEmit -p .`                                     | Passed                                                                             |
| `npx eslint .`                                              | Passed                                                                             |
| `npx prettier --check src e2e`                              | Passed                                                                             |
| `npm run build`                                             | Passed (the existing chunk-size warning)                                           |
| `npx vitest run`                                            | 83 files, 475 tests passed                                                         |
| `npx playwright test` (full, before the timeline fix)       | 24 passed, 1 failed: `dense-rendering.e2e.ts:140`, one console "400 (Bad Request)" |
| The same test, 3 runs alone with the 400s logged            | 1 passed, 2 failed; each 400 was `GET /v1/timeline` with 190 `kind` values         |
| The same test after the fix, 2 runs alone                   | 2 passed, no 400                                                                   |
| `e2e/time-machine.e2e.ts` after the fix                     | 2 passed                                                                           |
| `e2e/search-ask.e2e.ts`                                     | 2 passed (in the full run)                                                         |
| Guard: `test_us_english.py`                                 | 14 tests OK                                                                        |
| Guard: `check_us_english.py` over the project               | 796 hits, the baseline (777 generated, 19 wire names)                              |
| Guard: `check_us_english.py` over the new and changed files | `[]`                                                                               |

The 015 report put the same 400 down to a mid-run edit. This run found its real cause, the
100-kind limit.

## Compared to the mock

`review/017-vs-mocks-search-ask.png`.

- **Matches:**
  - the search box in the top bar with its placeholder;
  - the results drop down under it, grouped by type, each with an icon, title and summary;
  - Ask ForeSignal under TOOLS in the left rail;
  - cited objects are chips inline in the streamed answer.
- **Differs:**
  - The mocks do not draw the Ask panel. It is an overlay on the map's left side, in the panel
    style.
  - The Global dashboard's rail is the layers rail, so TOOLS sits at its foot and lists only Ask
    ForeSignal. The Conflict mock's Analysis Builder, Saved Views and Workspaces belong to later
    prompts.
  - The find bar is not in the Global mock. It sits at the top middle of the map.

## Decisions taken (unattended run)

1. **Search mode.** Hybrid while `getSearchStatus` says semantic search is enabled and not
   degraded; text otherwise. A degraded answer's `reason` is shown.
2. **Choosing a result** selects its object through its dossier, as a panel row does (015). A
   record result without its source falls back to moving the map to the result's geometry.
3. **Place lookup** uses the backend's reference countries plus typed coordinates. There is no
   open geocoder. `listPlaces` needs a token and lists saved places, not a gazetteer.
4. **The Ask panel** is an overlay opened from the rail's TOOLS, not a docked panel, so the map
   keeps its size.
5. **Answers render as text** with line breaks kept, not as Markdown. No Markdown library is in
   the project.
6. **Proposed actions are not shown or carried out** (`allowActions: false`). The prompt does not
   ask for them.
7. **Thread deletion asks once** ("Confirm delete") before calling `deleteAskThread`.

## Deviations from the prompt text

- **"Playwright: query → result → map centered; ask → answer with a clickable citation":** the
  search and the answer are stand-ins, because the backend always needs a token for them and the
  local setup has none. Minting one needs an admin token: `createToken` and `createPairingCode`
  are `admin` scope. The selected object, its dossier and the map are live.
- **"Show the `409 LLM_NOT_CONFIGURED` state":** checked in the unit tests. Anonymously, the live
  backend answers 401 before it would reach that check.

## Backend observations

- **Token-only operations.** These answer 401 "This endpoint always requires a token, even while
  open reads are on." for an anonymous caller (curl): `search`, `ask`, `askStream`,
  `listAskThreads`, `getAskThread`, `listPlaces`. `getSearchStatus` and `listReferenceCountries`
  are open.
- **Search status.** The local status is `semanticEnabled: false`, reason "No embedding provider
  is assigned; add one in /v1/llm/providers and assign it as embeddingProvider with PUT
  /v1/llm/settings", with 0 documents.
- **A limit the OpenAPI does not state.** `getTimeline` and `getHistoryFrames` refuse more than
  100 `kind` values (400 `VALIDATION_FAILED`, "at most 100 values are allowed, got 190", curl). The
  OpenAPI declares `kind` as an unbounded array.
- **Record identifiers.** The OpenAPI does not say what a record result's `docId` is, nor whether
  a citation's `<externalId>` is percent-encoded. The client uses the result's `record` (source
  and external id) and treats a citation's id as raw.

## Owner questions

1. **A token for local checks.** Can the local backend have a read token for the end-to-end
   checks, so search and Ask are checked against real answers? **Default in place: stand-in
   answers, with the live 401 states checked.**
2. **Record identifiers.** What is a record result's `docId`, and is a citation's external id
   percent-encoded? **Default in place: the result's `record`; a citation's id taken as raw.**
3. **Markdown.** Should answers render Markdown (a library would be added)? **Default in place:
   plain text with line breaks.**
4. **Proposed actions.** Should the panel show an answer's proposed actions for confirmation
   (`confirmAskAction`)? **Default in place: not shown, never carried out.**
5. **A gazetteer.** Is there, or will there be, an open place search beyond countries for the
   find bar? **Default in place: countries and coordinates.**

Questions still open from earlier reports keep their defaults.
