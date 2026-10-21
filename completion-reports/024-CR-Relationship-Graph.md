# 024 — Completion Report: Relationship Graph

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete) |
| Implementation commit | `50e564705fc7d4321c939962aed0a384e4028eb5`                                              |
| Run mode              | Unattended (owner's batch 023–036, no pausing)                                          |
| Screenshots           | None taken (compile-only run). `e2e/workbench.e2e.ts` takes none either.                |
| Mock comparison       | From the Analyst Workbench mock and the code, not from a screenshot (below).            |

## Results

- **The Analyst tab is now the Analyst Workbench**, replacing its placeholder. It opens on:
  - an investigation, at `/analyst/investigations/:id`. The graph is seeded with the investigation
    and each item's object ref;
  - a situation, at `/analyst/situations/:id`, seeded with the situation;
  - any objects by ref, at `/analyst?ref=…` (the ref may repeat);
  - with nothing open, a start page. It offers the object selected elsewhere in the app and the
    investigations the caller can see.
- **The EVIDENCE GRAPH card** reads the subgraph around the seeds (`queryGraph`). It shows it three
  ways:
  - **Graph View:** a force-directed WebGL graph drawn by **sigma**. Nodes are sized by their
    edges, with seeds larger, and colored by their type's group. Edges are colored by their
    relation type's style, with arrows for causal and temporal ones. It also has:
    - legends of the object types and relation types present, in the backend's words;
    - zoom in, zoom out and fit;
    - a **mini-map** at the bottom right, showing every node and the visible part as a frame;
      clicking it moves the view there.
  - **List View:** a row per object, the most connected first, with its type, its relations by
    type, and when.
  - **Matrix View:** the 24 most connected objects, with each cell colored by the relation
    between its pair.
- **Search** keeps matching nodes bright and dims the rest; in the List view it narrows the rows.
- **Filters:**
  - Object type, source and time window filter what was read, on the client. The time window is
    Last 7, 30 or 90 days, or All time; it opens on 90 days, as the mock does.
  - Depth (1 or 2 hops) and relation type read the subgraph again (`depth`, `types`).
- **Common dependencies** mode (`findCommonDependencies`) draws what the seeds share. It shows each
  path, hop by hop, then lists each dependency with how many objects share it and its weakest
  label, in the backend's word.
- **Selecting a node:**
  - **Selects it app-wide** (014's `selection`, through `hitForRef`).
  - **Fills the SELECTED ENTITY panel** with:
    - its title;
    - the backend's type, status and severity;
    - its summary;
    - first observed and last update;
    - its sources and its relations in this graph;
    - its tags;
    - **View Entity Details →**, which opens the object on its own screen (`useOpenObject`).
  - **Fills KEY EVIDENCE:** the relations at the node, the most confident first. Each shows the
    backend's relation type, its direction, label and confidence, and the object at the other end,
    which selects it.
- **The ANALYSIS TOOLS rail** follows the mock's order. Timeline, Geospatial Analysis, Entity
  Explorer, What Changed?, Hypothesis Builder, Forecasts and Reports open that tab of the full
  analysis. Correlation Finder and Pattern Search are shown disabled.
- **The analysis view's Analysis Builder** (TOOLS) now opens the workbench on the open situation or
  investigation. It was marked "024" before.
- **Large graphs stay interactive:**
  - the backend's most edges (2,000) are asked for;
  - above 300 nodes, the synchronous layout runs 30 passes, and a ForceAtlas2 web worker then
    refines it for 3 seconds;
  - selection and search change only sigma's reducers, never the layout.
- **Packages:**
  - added **sigma 3.0.3**, **graphology 0.26.0** and **graphology-layout-forceatlas2 0.10.1**,
    with `graphology-types` 0.24.8 as a dev dependency;
  - they load with the first graph on screen, in their own chunk (184.83 kB);
  - each is credited in `credits.ts`, with the MIT license its `package.json` states.
- **Local data.** The graph cannot be seen locally. In this session, through the dev proxy:
  - `POST /v1/graph` with an unknown situation ref answered
    `{"nodes":[],"edges":[],"missing":[…],"truncated":false}`;
  - `GET /v1/investigations`, `GET /v1/search` and `GET /v1/relations` answered 401;
  - no situations exist (curl, 023).

  The tests use stand-ins (`src/graph/testing/graphFixtures.ts`).

## What was built

- **`graph/graphApi.ts`**:
  - `queryGraph` (depth 1 and limit 2,000 by default, at most 50 seeds);
  - `findCommonDependencies` (at most 20 refs);
  - the types, and the relation types in the OpenAPI's order.
- **`graph/graphView.ts`** holds the view logic:
  - node groups and colors; edge styles, arrows and colors;
  - `toViewGraph` (filters, with seeds always kept, and no self-loops or retired relations);
  - `commonViewGraph`;
  - degrees and sizes; types, sources and the relation legend;
  - search and the bright set;
  - the list rows, the matrix and a node's incident edges;
  - the time windows.
- **`graph/sigmaGraph.ts`**: the graphology graph (positions, sizes, colors and programs) and the
  synchronous ForceAtlas2 layout.
- **`graph/RelationGraph.tsx`** (lazy) and **`graph/RelationGraphCanvas.tsx`**: the sigma renderer,
  its reducers, the zoom buttons, the mini-map, the worker refinement and the legends.
  `useGraphColors.ts` holds the theme colors.
- **`views/workbench/`**:
  - `WorkbenchView` (routes, header, rail and start page);
  - `EvidenceGraph` (toolbar, three views, common dependencies);
  - `GraphSidePanel`;
  - `workbench.ts` (paths, seeds, common refs, tools).
- **`App.tsx`** routes the three workbench paths. `screens.tsx` no longer has the Analyst
  placeholder.

## How it was checked

### Tests (written, not run)

- `graph/graphApi.test.ts` (3):
  - the defaults and the 50-seed cap;
  - depth and types passed through;
  - the 20-ref cap for common dependencies.
- `graph/graphView.test.ts` (9):
  - groups, styles and colors;
  - no filter, with self-loops and retired relations dropped;
  - type, source and time-window filters;
  - the common graph, with unknown refs typed by prefix;
  - degrees, sizes, types, sources and the legend;
  - search and the bright sets;
  - list rows; the matrix;
  - incident edges in confidence order.
- `graph/sigmaGraph.test.ts` (2): node and edge attributes; a layout to finite, distinct positions.
- `views/workbench/workbench.test.ts` (4): paths, investigation seeds (deduplicated, capped at
  50), common refs, the rail's order.
- `views/workbench/WorkbenchView.test.tsx` (11). The graph is mocked, because jsdom has no WebGL.
  - an investigation's graph and its request body;
  - selecting: the side panel, the app-wide selection, walking to a neighbor, clearing;
  - View Entity Details;
  - a client-side type filter, then re-reads for depth and relation type;
  - the list, the search and the matrix;
  - the common-dependencies mode and its body;
  - Common dependencies disabled for a single object;
  - the rail's navigation and its disabled tools;
  - a failed open;
  - the start page with a selection and an investigations list;
  - the token message.
- `e2e/workbench.e2e.ts` (1). The investigation, the graph and the dossiers are stand-ins.
  - six nodes and five edges, with sigma's `canvas.sigma-nodes` over 300 px tall;
  - the legend's backend words;
  - the mini-map's painted pixels;
  - a node selected from the list fills the side panel;
  - a click on the empty WebGL stage clears it;
  - no console errors.

### Checks

| Check                                                       | Result                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                         | Passed                                                                                      |
| `npm run lint`                                              | Passed                                                                                      |
| `npx prettier --check src e2e`                              | Passed                                                                                      |
| `npm run build`                                             | Passed. `index` 715.05 kB (217.61 kB gzip); `RelationGraphCanvas` 184.83 kB (45.65 kB gzip) |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                                                                 |
| Guard: `test_us_english.py`                                 | 14 tests OK (176.2 s)                                                                       |
| Guard: `check_us_english.py` over the project               | 797 hits, unchanged                                                                         |
| Guard: `check_us_english.py` over the new and changed files | `[]`                                                                                        |

## Compared to the mock

Compared by reading the Analyst Workbench mock (`design/ForeSignal_Analyst_Workbench.png`, read in
this session) against the components; no screenshot of the app was taken.

- **Matches:**
  - Graph View, List View and Matrix View;
  - the search box;
  - the All Types, All Sources and Last 90 days selectors;
  - the legend at the top left, with node dots and edge lines;
  - zoom buttons on the right and a mini-map at the bottom right;
  - the ANALYSIS TOOLS rail in the mock's order;
  - Selected Entity on the right, with its title, type tag, summary, First Observed, Last Update,
    Sources, Related, View Entity Details and Key Evidence.
- **Differs:**
  - **The legends** name the backend's object and relation types rather than the mock's Event /
    Entity / … and Supports / Contradicts / Related / Causal / Temporal (owner rule: backend terms
    as-is). The mock's five line styles are kept as colors; dashed lines are not drawn, because
    sigma's core edge programs have no dash (decision 3).
  - **Nodes** are dots, with no type icon inside them.
  - **Key Evidence** lists relations, not image thumbnails; the envelope carries no image.
  - **The header** has the title and Full analysis, but not Classify, Status, Owner, Created or
    Share. Those are 025's.
  - **Not drawn here:** the tab strip, and the bottom Competing Hypotheses and Evidence Timeline.
    The full analysis already has those tabs, and the rail opens them.
  - **Not drawn here:** Analysis Notes (026).
  - The INVESTIGATION and DATA sections of the left rail.
  - **Depth, relation type and Common dependencies** are extra controls the prompt asks for.

## Decisions taken (unattended run)

1. **Routes:** `/analyst/investigations/:id`, `/analyst/situations/:id` and `/analyst?ref=…`. With
   none, a start page.
2. **Seeds:** an investigation and its items' object refs (deduplicated, at most 50); a situation
   by its own ref, at depth 1 by default.
3. **Styles:**
   - Edge styles: `evidence-for` is Supports, `evidence-against` Contradicts; `causes`,
     `depends-on`, `affects` and `derived-from` are Causal; `precedes` is Temporal; everything else
     is Related.
   - Causal and temporal edges carry arrows.
   - Node colors group the backend's types into the mock's six hues, with gray for a type the
     client does not know.
   - Every label shows the backend's word.
4. **Filters:** type, source and time window are client-side, because `queryGraph` has no such
   parameters. Depth and relation type re-query. The time window opens on 90 days, and a node
   without a time passes any window. Seeds always show.
5. **Edges:** the client asks for the backend's maximum, 2,000, rather than its default 500. A
   capped graph says so.
6. **Common dependencies** use the seeds other than situations and investigations, at most 20. The
   mode is disabled with fewer than two.
7. **Analysis Builder** in the analysis rail opens the workbench.
8. **Selection:** a node selects app-wide, and the side panel reads the graph's envelope, not a
   dossier.

## Deviations from the prompt text

- **"Filters (type, source, time window) re-query the subgraph":** type, source and time window
  filter the result on the client. `GraphRequest` has `types` (relation types), `depth`, `asOf`,
  `minConfidence` and `limit`, but no object-type, source or window parameter. Relation type and
  depth do re-query.
- **"Playwright: graph renders and a node selects":** written as `e2e/workbench.e2e.ts`, not run
  (standing rule). The node is selected from the List view, because a WebGL node's screen position
  is not in the DOM. A real click on the WebGL stage is checked by clearing the selection.
- **The mock's bottom row** (Competing Hypotheses, Evidence Timeline) and its tab strip are not
  repeated in the workbench.

## Backend observations

- **Local:** `POST /v1/graph` answers an empty graph, with the seed under `missing`, for a ref it
  does not know. Investigations, search and relations need a token (401) (curl, this session).
- **Common-dependency paths:** the OpenAPI does not say whether `hops` includes the start or the
  dependency. The client joins `from`, the hops and the dependency, dropping repeats.
- **Packages:** sigma's 4.x releases are all from the last two weeks (4.0.0 on 2026-10-08, 4.0.3 on
  2026-10-15, per `npm view sigma time`), so 3.0.3 (2026-04-30) was used.

## Owner questions

1. **Type and source filters.** Should `queryGraph` take object types and sources, so the filters
   re-query as the prompt says? **Default in place: filtered on the client.**
2. **Legend words.** Should the legends name the mock's Event / Entity / … and Supports /
   Contradicts / …, rather than the backend's types? **Default in place: backend types, in the
   mock's colors.**
3. **Analysis Builder.** Is the workbench what the analysis rail's Analysis Builder should open?
   **Default in place: yes.**
4. **The bottom row.** Should the workbench repeat Competing Hypotheses and an Evidence Timeline
   under the graph, as the mock does? **Default in place: the rail opens those tabs of the full
   analysis.**
5. **Correlation Finder and Pattern Search.** Which backend operations are these? **Default in
   place: shown disabled.**
6. **Upgrading sigma.** Should the client move to sigma 4 once it is two weeks old? **Default in
   place: 3.0.3.**

Questions still open from earlier reports keep their defaults.
