# 024 — Relationship Graph

**Goal.** The Analyst Workbench evidence/relationship graph — a WebGL force-directed graph of
entities, events and evidence with their relations.

**Read first.** 023-CR; [Architecture.md](../docs/Architecture.md) §11. Design: **Analyst
Workbench** (Evidence Graph: nodes by type, edges Supports/Contradicts/Related/Causal/Temporal,
graph/list/matrix views, mini-map, selected-entity side panel).

**Backend (OpenAPI only).**
- `POST /v1/graph` [`queryGraph`] — a relation subgraph around seed refs (nodes + typed edges).
- `POST /v1/graph/common-dependencies` [`findCommonDependencies`] — shared dependencies.

**Build.**
- Add **sigma.js + graphology**; render the subgraph from `queryGraph` with node styling by type
  and edge styling by relation kind (match the design legend). WebGL rendering so it scales.
- Graph / List / Matrix view toggle; a mini-map; node selection → the shared `selection` (014) and
  the side panel (dossier).
- Filters (type, source, time window) re-query the subgraph; a common-dependencies mode via
  `findCommonDependencies`.

**Match the mock (Analyst Workbench EVIDENCE GRAPH).** Center graph with a **Graph / List / Matrix**
view toggle, a search box, and type/source/time filters; a node-type legend (Event / Entity /
Location / Infrastructure / Source-Data / Document) and an edge-type legend (**Supports / Contradicts
/ Related / Causal / Temporal**, color/dash-coded); a **mini-map** bottom-right. Left ANALYSIS TOOLS
rail (Evidence Graph / Timeline / Geospatial / Entity Explorer / Correlation Finder / Pattern Search
/ What Changed / Hypothesis Builder / Forecasts / Reports). Right: Selected Entity + Key Evidence;
bottom: Competing Hypotheses + Evidence Timeline.

**Done when.** Opening the workbench for an investigation renders its graph; selecting a node drives
the side panel; the layout stays interactive with a large subgraph. Playwright: graph renders and a
node selects.

**Commit.** `024: Relationship Graph`; `completion-reports/024-CR-Relationship-Graph.md` (hash + owner questions).
