# ForeSignal Client — Product Charter

> **Living document, owned by Adam.** It records decisions, not law. When this document and
> the code disagree, the code is what is true and this is corrected. **Nothing enters scope
> that is not written here or asked for directly.** Date: 2026-10-21.

---

## 1. What this is

The ForeSignal Client is a **web application** that renders the intelligence the ForeSignal
backend already produces: a global situational-awareness dashboard over a 2D/3D map, with
selection-driven detail views for situations, investigations, forecasts, satellite operations
and analyst work.

It is **presentation only.** All collection, entity resolution, correlation, history, forecasts
and analysis live in the backend. The client renders, filters and interacts; it never
re-implements what the backend owns.

The authoritative picture of what it looks like is the set of design mockups in
[`design/`](../design/) (originally `foresignal/client screen ideas/`):

| File | View |
|---|---|
| `Foresignal Global Intelligence Dashboard.png` | **Primary.** Layers rail, live 2D/3D globe, selected-entity dossier, activity timeline, insights, related entities |
| `Foresignal Conflict Intelligence Dashboard.png` | Situation "full analysis": conflict layers, AI analysis tabs, timeline, territorial change, metrics, evidence, competing hypotheses, forecasts |
| `Foresignal Tropical Storm Intelligence Dashboard.png` | Investigation workspace: key findings, filters, map with official track and cone, evidence, hypotheses, forecasts |
| `ForeSignal_Analyst_Workbench.png` | Evidence/relationship graph, timeline, hypotheses, notes |
| `ForeSignal_Analysis_View.png` | Satellite operations / analysis: constellation (3D globe, live orbits), passes, imagery, change-detection |
| `Foresignal Intelligence Dashboard Split-Screen.png` | Split view: the Analyst Workbench and satellite operations side by side (same components as the two rows above) |

---

## 2. The two-component rule (hard constraint)

The entire solution is exactly **two runtime components**:

1. **Backend** — the existing ForeSignal service (Java/Spring Boot + PostgreSQL/PostGIS). Serves
   the HTTP + SSE API, and serves this client's compiled web build as static assets.
2. **Client** — this project: one web app, delivered to the browser.

There is **no third component.** No backend-for-frontend, no Node server, no proxy, no separate
frontend service. The client talks **directly** to the backend API. Build tooling (Vite) is
build-time only and ships nothing at runtime.

---

## 3. Scope

### In scope

- A browser-delivered web client implementing the dashboard and detail views in `design/`.
- Reading and rendering backend data: records, entities, vector/raster tiles, live change
  streams, timelines/history, situations, findings, hypotheses, forecasts, assessments,
  investigations, workspaces, satellites/sensors, alerts, notifications, search, and saved
  places/views/watchlists.
- Operator interactions the backend exposes: selection, filtering, annotations, workspace
  context and deep links, alert acknowledge/snooze/resolve, saved views/watchlists, and
  on-demand analysis requests.
- Full **2D map and 3D globe** views (2D default; the user switches between them with the 2D Map /
  3D Globe toggle, and selecting an item never switches them), scaling to the backend's entire
  source catalog (~300–500 simultaneous source layers) **without an artificial client-side cap**.

### Out of scope

- **Any backend change.** If the client needs something the API does not provide, it is raised
  as a backend gap for the owner — never worked around in a second service.
- **Native/desktop packaging** (no Tauri, Electron, Capacitor). "Desktop" means a desktop web
  browser.
- **A mobile app.** If one is built later it is a **separate Flutter project** with a different,
  simplified UI, **no 3D**, and is not part of this repository.
- Data ingestion, source configuration, models — anything the backend owns.

---

## 4. Backend interface — single source of truth

The **only** reference for how the client talks to the backend is the backend's
**`docs/OpenAPI.json`** (ForeSignal repo; OpenAPI 3.1, 638 paths / 807 operations / 1094
schemas). The client's API types are **generated from it**. Every backend interaction in the
Architecture and the Prompts cites an OpenAPI operation (operationId + path).

The prose guides in the backend repo are **not** used as the API contract. Where the client needs
behavior the OpenAPI does not express, that is recorded as an open question for the owner — not
invented, and not sourced from a prose document.

---

## 5. Technology (locked)

- **Vite + React 19 + TypeScript** — the application shell and all non-map UI (panels, charts,
  timelines, entity graph, HUD chrome).
- **CesiumJS (via Resium)** — the map/globe rendering engine: one component providing **2D map,
  3D globe** scene modes (2D default; switched only by the user's toggle).
- **Cesium primitives** (decoded from MVT) — the batched rendering path for record layers (deck.gl
  does not align with a WGS84/terrain Cesium host; it is kept only as a reserved escape hatch,
  Architecture §5.2).
- **A typed API layer generated from `docs/OpenAPI.json`** (openapi-typescript + a `fetch`
  wrapper), plus a resumable SSE change-stream client.
- **Delivery:** `vite build` → static assets, served **same-origin** by the backend. One
  codebase, one build target: the browser.

Why this stack (full reasoning in [Architecture](Architecture.md)): the hardest visuals — 3D
globe, satellite orbits, weather rasters, thousands of live entities — are **Cesium's core
domain** and are WebGL/engine-bound, not framework-bound; the dense dashboard chrome is React's
strength; and a static SPA served by the backend keeps the whole solution to **two components**.

---

## 6. Principles

1. **Presentation only.** The client renders backend truth; it never re-derives correlation,
   history, forecasts or analysis.
2. **No artificial limits.** The client scales to whatever the backend can emit. Dense layers use
   batched Cesium primitives decoded from vector tiles, and lean on the backend's **hex-aggregation** and
   **viewport/bbox scoping** so only in-view data is drawn. A naive per-feature render path (one
   DOM marker or one `Entity` per feature for dense layers) is a defect.
3. **Seamless rendering.** Heavy rendering (globe, relationship graph) stays on the GPU; the rest
   is ordinary DOM. The target is a smooth command-center feel.
4. **Live by default.** State is kept current from **one multiplexed, resumable SSE stream**, not
   per-source polling.
5. **US English** everywhere — prose, identifiers, UI strings, comments, commit messages.
6. **Verify, don't guess.** Endpoints, schemas, versions and behaviors come from
   `docs/OpenAPI.json` and are checked, never assumed.
7. **One pass, no phasing.** This is an AI-first build. **Every** feature in the designs and every
   backend capability a screen needs is built in this single pass — the 3D globe, wind (barbs,
   speed raster, particles), every panel, every detail view, situations and investigations, the
   relationship graph, satellite orbits, imagery and change-detection, alerts and rule authoring, and
   the RF/sensors and operations workspaces.
   Nothing is deferred to a later phase, marked optional, or left as a TODO. There is no v1/v2 and
   no backlog. The only exclusions are the owner-set boundaries in §8. Prompt ordering is
   dependency/build order, never prioritization. If something genuinely cannot be built, it is
   surfaced as an owner question — never silently deferred or stubbed.

---

## 7. Success criteria

- The **Global Intelligence Dashboard** renders live backend data over a 2D/3D Cesium map,
  with the left layer rail, right dossier panel, bottom activity/insights, and a working timeline
  scrubber.
- Selecting an entity opens its **dossier**; selecting a situation or investigation opens the
  matching **detail view**, all from backend composed reads.
- **All catalog source layers can be enabled at once** without the client becoming the bottleneck.
- The deployed solution is the **backend plus this one web app — nothing else**.

---

## 8. Out of scope — the only two things not built

Nothing in the designs or in the backend capabilities a screen needs is deferred (§6.7). The build
is excluded from exactly two things, both the owner's explicit decision:

- **A mobile app.** If one is built later it is a **separate Flutter project** (different, simplified
  UI, no 3D) — not this repository.
- **Backend changes.** The client is presentation-only; a needed-but-missing backend capability is
  raised as an owner question, never built into the client or a second service.

Everything else is built in this one pass.
