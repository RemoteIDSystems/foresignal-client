# ForeSignal Client — Roadmap

One ordered list of prompts that takes the client from an empty repository to a working web
application against the existing ForeSignal backend. Companion docs:
[Product Charter](Product-Charter.md), [Architecture](Architecture.md). **The only backend
reference is the ForeSignal repo's `docs/OpenAPI.json`.** Date: 2026-10-18.

---

## 1. Process

0. **API-first.** The backend's `docs/OpenAPI.json` is the complete, authored target. The client
   generates its types from a vendored copy (`openapi/OpenAPI.json`) and is built against it. Every
   backend interaction in a prompt names an `operationId`.
1. Each unit of work is a prompt in `/prompts`, named `NNN-<Prompt-Description>.md`.
2. Claude Code runs them in order. **The default is attended: run one prompt, then stop at its
   review gate for the owner to look before starting the next**
   ([`prompts/000-Run-Sequence.md`](../prompts/000-Run-Sequence.md)). Unattended batch running is
   opt-in and only for an owner-named range of later, non-visual prompts. UI work is iterative early
   on — the gates exist so the owner never runs for days and then first sees something wrong.
3. Each prompt starts by reading the earlier completion reports and adapting to what was actually
   built.
4. Each prompt ends by writing `/completion-reports/NNN-CR-<Prompt-Description>.md` with the
   implementation commit hash.

## 2. Guardrails (in every prompt)

1. **Build & typecheck must pass.** `npm run typecheck` (`tsc --noEmit`) and `npm run build`
   (`vite build`) succeed before the prompt is done. `npm run lint` is clean.
2. **Tests for touched code run green.** Vitest for the code the prompt wrote; a prompt that changes
   something a person sees proves it **from outside the component** (Playwright against a real
   build, or a DOM/pixel assertion), not by asking the component what it was told.
3. **Finish with Build → Commit → Push.** Commit as `NNN: <Title>`, push to `origin main`, record
   the commit hash in the completion report.
4. **OpenAPI only.** No backend behavior is sourced from prose; every call cites an `operationId`.
   If the client needs something the spec does not express, record it in the completion report as an
   **owner question** — do not invent it and do not add a second service.
5. **Two components, presentation only.** No backend changes, no BFF/proxy/Node service, no native
   wrapper. (Charter §2–3.)
6. **US English** in all code, identifiers, UI strings, comments and commits.
7. **No artificial limits.** Dense layers render batched (deck.gl / Cesium primitives) over
   server-aggregated, viewport-scoped data — never per-feature DOM or one `Entity` per record.
8. **Generated code is never hand-edited** (`src/api/generated/`).
9. **Runnable and visible.** Every prompt leaves the app runnable (`npm run dev`). A UI prompt also
   captures a screenshot of the new state to `review/NNN-<name>.png` (committed) and, in its
   completion report, notes how it compares to the relevant `design/` mockup — so visual drift is
   caught per prompt, not at the end.
10. **Review gate.** After each prompt the run **stops for the owner to look and approve** before the
    next. The owner may waive gates for a named range of later prompts. Proceeding past a gate is the
    owner's call.

## 3. Design is the spec

Every screen-building prompt is implemented against the mockups in [`design/`](../design/). The
client matches the layout and behavior shown there; visual details may be adjusted to fit, but the
panels, their data, and their interactions come from the designs and the backend.

**Front-load the look.** Prompt 004 stands up a **styled dashboard skeleton** — the primary mockup's
full layout with placeholder data — so the overall look is validated on day one, *before* real-data
wiring. Each later screen prompt (019 situation view, 024 workbench, 027 satellite) likewise builds
its screen skeleton first, then wires its data. Combined with the review gates, you see the target
shape early and approve each increment against the mockup.

---

## 4. The prompts

### Phase 0 — Foundation
| # | Prompt | What it delivers |
|---|---|---|
| 001 | Project-Scaffold | Vite + React 19 + TS project, lint/format/test config, `src/` layout, env config, `design/` and `openapi/` vendored |
| 002 | API-Client | Types generated from `openapi/OpenAPI.json`; `fetch` client with base URL, ProblemDetail errors, `Retry-After` handling |
| 003 | Auth-And-Access | Open reads; bearer-token store; stream tickets (`createStreamTicket`); tile keys (`createTileKey`); capabilities (`getSystem`, `getContract`) |
| 004 | App-Shell & Dashboard-Skeleton | Top-nav, routing, dark theme + `ui/` primitives, layout grid, error boundaries, **and a styled Global Dashboard skeleton with placeholder data — the first visual review gate** |

### Phase 1 — Map core
| # | Prompt | What it delivers |
|---|---|---|
| 005 | Cesium-Viewer | Resium `<Viewer>`, 2D/3D/split scene-mode toggle, `CESIUM_BASE_URL`, base imagery, HUD (scale bar, lat/lon/elev, compass, zoom, mini inset) |
| 006 | Map-Overlay-Style | `getMapStyle` + sprites/icons as the per-kind styling source; legend panel |
| 007 | Record-Layers | Record vector tiles (`listTileLayers`/`getTileJson`/`getTile`) via deck.gl `MVTLayer`; left LAYERS rail with toggles |
| 008 | Aggregation-And-Viewport | Hex aggregation below `aggBelowZoom`; viewport bbox+zoom scoping; `summarizeContext` counts |
| 009 | Raster-Products | Products (`listProducts`/`getProductTileJson`/`getLatestProductFrame`/`getProductTile`/`getProductLegend`) as Cesium imagery layers; loop animation |
| 010 | Dense-Layer-Rendering | deck.gl batching for high-cardinality layers; enable the full catalog without a client cap |

### Phase 2 — Live and time
| # | Prompt | What it delivers |
|---|---|---|
| 011 | Live-Stream | One multiplexed SSE (`streamEvents` + `updateEventStreamFilter`), `streamChanges`, tickets, `Last-Event-ID` resume, `listChanges` catch-up, backoff, `410` resync |
| 012 | State-Store | `useSyncExternalStore` singleton (viewport, layers, selection, time, inbox); SSE deltas applied per key |
| 013 | Time-Machine | Scrubber histogram (`getTimeline`), playback (`getHistoryFrames`), trails (`getRecordTrack`), asOf tiles |

### Phase 3 — Selection and panels
| # | Prompt | What it delivers |
|---|---|---|
| 014 | Selection-And-Dossier | `getObject`/`resolveObjects`/`getObjectDossier`; right-hand selected-entity panel; action buttons from the envelope |
| 015 | Context-Insights | `summarizeContext` → Analytics & Insights + Activity Timeline panels |
| 016 | Related-Entities | `listRelatedObjects` → Related Entities panel |
| 017 | Search | `search`/`getSearchStatus` top search bar + results; find/locate bar |
| 018 | Glance-Ticker | `getGlance` + `getStatsTop`/`getStatsTimeseries` global ticker and status widgets |

### Phase 4 — Intelligence views
| # | Prompt | What it delivers |
|---|---|---|
| 019 | Situations | `listSituations`/`getSituation`/`getSituationTimeline`/`getSituationChanges`; Conflict full-analysis view |
| 020 | Findings-Analytics | `listFindings`/`listProjectedImpacts`/`listImpactRates`/`listAnalysisSeries` + metric charts |
| 021 | Hypotheses-ACH | `getHypothesisSet`/`getAchMatrix`/`getInformationValue`; competing-hypotheses panel |
| 022 | Forecasts | `listForecastQuestions`/`getForecastQuestionHistory`/`getForecastScorecard`; Forecasts & Predictions with trend charts |
| 023 | Assessments | `listAssessments`/`getLatestAssessment`/`listSituationAssessments`; AI-analysis tabs; on-demand `createSituationAssessment` |

### Phase 5 — Investigations and collaboration
| # | Prompt | What it delivers |
|---|---|---|
| 024 | Relationship-Graph | `queryGraph`/`findCommonDependencies` → sigma.js WebGL evidence graph (Analyst Workbench) |
| 025 | Workspaces-Deep-Links | `getWorkspace`/`patchWorkspaceContext`/`putWorkspaceLayout`/`getWorkspaceSummary`, `createContextLink`; shared selection + deep-link restore |
| 026 | Annotations-Relations | `createAnnotation`/`listObjectAnnotations`/`createRelation`; notes and evidence tagging |

### Phase 6 — Satellite operations
| # | Prompt | What it delivers |
|---|---|---|
| 027 | Satellite-Constellation | `listSensors` + satellite records + CZML/SGP4 orbits, ground tracks, passes, time-dynamic playback |
| 028 | Imagery-And-Comparison | `getMedia`/`getMediaThumbnail` + product imagery; before/after change-detection swipe |

### Phase 7 — Alerts and saved state
| # | Prompt | What it delivers |
|---|---|---|
| 029 | Alerts-Notifications | `listAlerts`/`streamAlerts`/`acknowledgeAlert`/`snoozeAlert`/`resolveAlert`; inbox `listNotifications`/`streamNotifications`/`getNotificationBadge`/`markNotificationsRead`; toasts; device id; `updatePresence` |
| 030 | Alert-Rules-And-Web-Push | Author trigger rules scoped to view/situation/watchlist (`createTrigger`/`updateTrigger`/`testTrigger`/`muteTrigger`); route to channels; subscribe the browser to Web Push (`getVapidPublicKey`/`createPushSubscription`) |
| 031 | Saved-State | `listPlaces`/`listViews` (+ `getViewTileJson`/`streamView`)/`listWatchlists`; persisted layer & filter sets |

### Phase 8 — Deploy and hardening
| # | Prompt | What it delivers |
|---|---|---|
| 032 | Build-And-Deploy | `vite build` → static; served same-origin by the backend web root; Cesium assets; config; immutable-tile caching |
| 033 | Scale-And-Performance | Full-catalog (~300–500 layer) stress; batched-render + aggregation verification; frame-budget check; raster restraint |
| 034 | Accessibility-Shortcuts-Onboarding | Keyboard-shortcuts overlay, onboarding, a11y, theming polish, error-boundary coverage |

---

## 5. Status

Not started. 34 prompts across 8 phases. The owner reviews the roadmap and each prompt before and
after it runs.
