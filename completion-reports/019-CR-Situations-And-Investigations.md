# 019 — Completion Report: Situations And Investigations

| Field                 | Value                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete)                                                           |
| Implementation commit | `b6cf6108d455efff35725bb457a4f7333b6ce0a6`                                                                                                        |
| Run mode              | Unattended (owner's batch 019–022, no review gates)                                                                                               |
| Screenshots           | None taken (compile-only run). `e2e/analysis.e2e.ts` writes `review/019-situation.png` and `review/019-investigation.png` when the owner runs it. |
| Mock comparison       | From the mocks and the code, not from a screenshot (below).                                                                                       |

## Results

- **The Intelligence tab** (`/intelligence`) lists:
  - situations by latest activity (`listSituations`), searchable and filtered by status
    (Emerging and Active on at first);
  - the investigations the caller can see (`listInvestigations`).

  Each opens its full-analysis view.

- **The full-analysis view** is at `/intelligence/situations/:id` or
  `/intelligence/investigations/:id`, with the open tab in `?tab=`.
- **Opening one from elsewhere.** Selecting a `situation:` or `investigation:` ref opens its view.
  This works from:
  - the Global dashboard's panel rows (insights, related entities), through `selectRef`;
  - a search result (`SearchBox`);
  - any other analysis view (`useOpenObject`).
- **A dossier's `open-investigation` action** is now carried out:
  - it creates an investigation titled after the object (`createInvestigation`);
  - pins the object as its first item (`addInvestigationItem`, an `object` item);
  - opens the workspace.
- **The local backend has no data for these views.** `listSituations` answers an empty list, and
  `listInvestigations` answers 401 to an anonymous caller (curl). The checks therefore use stand-in
  data (`src/intel/testing/fixtures.ts`), typed against the generated schema.

## What was built

- **`intel/situationApi.ts`**: `listSituations`, `getSituation`, `listSituationMembers`,
  `getSituationTimeline` (from a time) and `getSituationChanges` (since a time). Each reads one
  page of at most 500.
- **`intel/investigationApi.ts`**:
  - `listInvestigations`, `getInvestigation`, `updateInvestigation`, `createInvestigation`;
  - `addInvestigationItem`, `removeInvestigationItem`;
  - `exportInvestigation` (JSON, Markdown or GeoJSON, as text with its media type);
  - `getIntelEvent`.
- **`intel/useAnalysis.ts`** loads one analysis:
  - a situation's four parts at once, with the diff optional;
  - an investigation with its envelope, which says what the caller may do.

  It keeps the analysis current:
  - read again 5 s after the live stream (011) goes quiet following changes;
  - every 60 s;
  - after an edit.

  A failed refresh keeps the data and shows "Refresh failed" in the header.

- **`intel/analysisView.ts`** holds the view logic:
  - routes for refs;
  - duration and scope text, the confidence look, status and severity tones;
  - timeline rows, the what-changed lines;
  - the camera over a bounding box, an investigation's footprint from its items' snapshots;
  - item titles and refs;
  - whether the envelope offers a method on a path;
  - the members' layer categories.
- **`views/analysis/`**:
  - **`AnalysisRail`**: ANALYSIS and TOOLS, as the Conflict mock lists them. Entries open their
    tab. Those built later are disabled and name the prompt.
  - **`AnalysisHeader`**:
    - the breadcrumb, the title with its status badge, and the subline;
    - a Confidence gauge (a half circle with the percent and LOW, MODERATE or HIGH);
    - an Information Value meter, which says "Not assessed" until 021;
    - Last Updated with Auto-refresh;
    - Add Note (disabled until 026), Share (copies the link), Export (for investigations) and More.
  - **`AnalysisView`**: the frame, with Overview, Full Analysis, Timeline, Map, Entities (n) or
    Items (n), Evidence, Hypotheses, Forecasts, Related (n), Reports and Export. Tabs this prompt
    does not fill name the prompt that does: Full Analysis 023, Evidence 020, Hypotheses 021,
    Forecasts 022. Reports names no prompt yet.
  - **Overview, for a situation:**
    - the deterministic summary;
    - the LLM brief, labeled Speculation with its model and time, when there is one;
    - theme, severity and status, each with its basis;
    - regions and member count;
    - what changed over the window;
    - evidence by signal family with the corroboration roll-up;
    - the latest eight timeline entries.
  - **Overview, for an investigation:** the summary, tags, owner, visibility, TLP, items by type,
    and the linked hypothesis sets, questions and reports.
  - **Timeline:** members and log entries newest first, or an investigation's items by when added.
    A time range applies: 7, 30 or 90 days, or all. A member's row opens its object.
  - **Entities (situation):** the members table, filtered by role and signal family. An
    intelligence event opens its detail beside the table (`getIntelEvent`): confidence, evidence
    quality, explanation and members.
  - **Items (investigation):**
    - the items table;
    - an Add item form (type, reference, note) and Remove, after "Confirm remove";
    - both only when the investigation's envelope offers a `POST …/items` or `DELETE …/items/…`
      action. Otherwise the tab says it is read-only.
  - **Map:**
    - the tab's own map and store, so the Global dashboard's camera and layers are untouched;
    - flown to the bounding box, with the area outlined;
    - the member record kinds' live layers drawn, with a chip per category among them, and the
      legend.
  - **Related (n):** the relation graph's objects for the ref (`listRelatedObjects`, 016).
  - **Export (investigation):** Markdown report, JSON or GeoJSON, saved as `INV-….md`, `.json`
    or `.geojson`.
  - **`IntelligenceHome`**: the list screen.
- **The map** takes `areas`, drawn as ground-clamped outlines and dots (`map/AreaOutlines.tsx`,
  `map/areaOutline.ts`).
- **The dossier's actions** are now looked up per object (`useActionHandlers`) rather than from a
  fixed table, so `open-investigation` can reach the API and the router.

## How it was checked

### Tests (written, not run)

- `intel/situationApi.test.ts` (2): the list's query (text, statuses, area, limit 500); the
  situation, members, timeline (`from`) and changes (`since`) requests.
- `intel/investigationApi.test.ts` (3):
  - read, change, add and remove, with their bodies;
  - export as text with its media type, and a 401 raised;
  - opening an investigation from an object pins it.
- `intel/analysisView.test.ts` (13):
  - routes; durations as the mock writes them; scope; confidence levels; UTC text;
  - timeline rows; what-changed lines (and none);
  - focus; an investigation's footprint; member categories;
  - item refs (including those it cannot name); item rows; envelope permissions.
- `map/areaOutline.test.ts` (2): rings, lines and points; malformed positions skipped.
- `views/analysis/AnalysisView.test.tsx` (7):
  - **Situation:**
    - the header, gauge and tabs, the Overview and the 30-day `from`;
    - the timeline, the members filtered by role, and an event's detail;
    - a pending tab naming its prompt;
    - a missing situation.
  - **Investigation:**
    - the header, items, adding (body, then a refresh) and removing;
    - read-only without the envelope's actions;
    - the token message.
- `views/analysis/IntelligenceHome.test.tsx` (1): the situations list and its default statuses,
  the investigations token message, and opening a situation.
- `views/global/SelectedEntityPanel.test.tsx`: the render is now inside a router, as the panel's
  actions navigate.
- `e2e/analysis.e2e.ts` (2):
  - **Situation:** open it from the Intelligence list; the header, What changed, Timeline,
    Entities with an event's detail, and the Map tab with the area and the earthquake layer on.
  - **Investigation:** the header, Overview and Items; add and remove an item; the Timeline.

  The map, style and tiles in this spec are the live backend's; the situation and investigation
  reads are stand-ins.

### Checks

| Check                                                       | Result                                                |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| `npm run typecheck`                                         | Passed                                                |
| `npm run lint`                                              | Passed                                                |
| `npx prettier --check src e2e`                              | Passed                                                |
| `npm run build`                                             | Passed (the existing chunk-size warning)              |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                           |
| Guard: `test_us_english.py`                                 | 14 tests OK                                           |
| Guard: `check_us_english.py` over the project               | 796 hits, the baseline (777 generated, 19 wire names) |
| Guard: `check_us_english.py` over the new and changed files | `[]`                                                  |

## Compared to the mock

Compared by reading the Conflict and Tropical-Storm mocks against the components; no screenshot
was taken.

- **Matches:**
  - the header, as the Conflict mock draws it: the breadcrumb, the title with ACTIVE, the subline
    (theme, started date, duration, scope), the Confidence gauge with its percent and word,
    Information Value, Last Updated with Auto-refresh, Add Note, Share and `…`;
  - the tab strip in the mock's order, with counts on Entities and Related;
  - the left ANALYSIS rail (Situations, Analytic Findings, Hypotheses, Forecasts, Indicators,
    Base Rates, Comparisons, Reports) and TOOLS;
  - the Map tab's layer chips and time range;
  - the Tropical-Storm workspace's header (ID INV-…, the date range, UTC) in the same frame.
- **Differs:**
  - Information Value reads "Not assessed" until 021 supplies it.
  - The Map tab's chips are the categories present among the members' kinds, not a fixed
    Conflicts / Military / Infrastructure / Energy / Displacement / Custom set. The time range
    drives the timeline and what-changed; the map shows the current records.
  - The mock's DATA rail section is not repeated here: the Global dashboard's layers rail is that
    list.
  - The Tropical-Storm mock's Key Findings, Filters and Sources rails are not built. Its findings
    are 020's.
  - Overview is a grid of cards (summary, what changed, evidence by family, latest). The Conflict
    mock's Full Analysis layout of map, AI analysis and metrics belongs to 020–023.

## Decisions taken (unattended run)

1. **Confidence is the corroboration share.** A situation has no confidence field; its
   `corroborationShare` drives the gauge: low under 40%, moderate under 70%, high from there. An
   investigation shows "Not assessed".
2. **Information Value** waits for 021 (`getInformationValue` belongs to a hypothesis set).
3. **Auto-refresh:**
   - after the shared live stream's `changes` go quiet for 5 s;
   - every 60 s.

   The stream's `situations` topic is not subscribed (owner question 1).

4. **The window** for the timeline and what-changed is 30 days by default, with 7, 90 and all.
5. **Add and remove** are offered only when the investigation's envelope lists a matching action.
   The match is on the method and href (`POST …/items`, `DELETE …/items/…`), since the OpenAPI
   names no action ids for them.
6. **Opening an investigation** pins the object as an `object` item by its ref, titled after the
   object, with status `open`.
7. **Refs the OpenAPI does not name** are not guessed. An investigation's event or anomaly item
   selects its object only through the backend's own `objectRef`; a record or alert item builds
   its ref.
8. **The Map tab has its own store**, so moving that map does not move the Global dashboard's.
9. **The Intelligence placeholder screen was replaced** by the list.

## Deviations from the prompt text

- **"Playwright: open each → tabs populate":** written as `e2e/analysis.e2e.ts`, not run
  (standing rule). It uses stand-in situation and investigation data, because the local backend
  has no situations and investigations need a token.
- **"Add/remove where the envelope allows":** the envelope is the investigation's own
  (`getObject` on `investigation:<id>`), matched by method and href (decision 5).

## Backend observations

- **Local data.** `listSituations`, `listFindings`, `listProjectedImpacts`, `listAnalysisSeries`,
  `listHypothesisSets`, `listIndicators` and `listForecastQuestions` all answer empty lists
  anonymously (curl). `listInvestigations` answers 401 "This operation needs a token."
- **A situation has no confidence or information-value field.** The OpenAPI gives
  `corroborationShare`, and a hypothesis set's `getInformationValue`.
- **Object ref types.** The OpenAPI's `ObjectRef` grammar is `{type}:{id}`, but it does not list
  the types for an intelligence event or an anomaly. `getObject` answers 400 `OBJECT_REF_INVALID`
  for an unknown type, the OpenAPI says.

## Owner questions

1. **Situation events.** Should the shared live stream also subscribe to the `situations` topic
   (`SituationEvent`), so an open situation refreshes on its own events? **Default in place:
   refresh after record changes settle, and every 60 s.**
2. **Confidence.** Is the corroboration share the right figure for the header's Confidence, or
   will the backend give situations a confidence? **Default in place: corroboration share.**
3. **Envelope action ids.** What are the ids of the add-item and remove-item actions on an
   investigation's envelope? **Default in place: matched by method and href.**
4. **Ref types.** What are the object ref types of an intelligence event and an anomaly?
   **Default in place: only the backend's `objectRef` is used.**
5. **A local token.** As in 017: a read token for the local backend would let these views be
   checked against real investigations. **Default in place: stand-in data.**

Questions still open from earlier reports keep their defaults.
