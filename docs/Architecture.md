# ForeSignal Client — Architecture

> Companion to the [Product Charter](Product-Charter.md). The authoritative backend interface is
> the ForeSignal repo's **`docs/OpenAPI.json`**; every operation named below is an `operationId`
> from it. Date: 2026-10-18.

---

## 1. Two-component model

```
┌──────────────────────────────┐          ┌───────────────────────────────────────────┐
│  BACKEND (existing)          │          │  CLIENT (this repo) — one web app          │
│  Java / Spring Boot + PostGIS│          │                                            │
│                              │  HTTP    │  React UI shell ── panels, charts, graph,  │
│  • /v1 REST + SSE API  ◄─────┼──────────┤  timelines, HUD, search, alerts            │
│  • serves the static web ────┼── SSE ───┤  Cesium map/globe (2D/3D) + records        │
│    build (same-origin)       │  tiles   │  API layer (generated from OpenAPI) + SSE  │
└──────────────────────────────┘          └───────────────────────────────────────────┘
        two runtime components. Vite/Resium are build-time only.
```

The client is a **static single-page app**. In production the backend serves it (Operator Guide
"web" profile: everything not under `/v1`, `/mcp`, `/actuator` is served from the web build with a
single-page-app fallback), so the client is **same-origin** with the API and makes no CORS
preflights. In development, Vite's dev server serves the app and **proxies `/v1`, `/mcp` and `/actuator` to the
backend** (§16), so the browser is **same-origin in dev exactly as in prod** — the client never
relies on cross-origin CORS. The proxy is Vite dev tooling only; it is not a runtime component.

---

## 2. Repository layout

```
foresignal-client/
  design/                 the mockups (copied from foresignal/client screen ideas/)
  docs/                   Product-Charter.md, Architecture.md, Roadmap.md
  prompts/                NNN-*.md implementation prompts (+ 000-Run-Sequence.md)
  completion-reports/     NNN-CR-*.md, one per prompt
  openapi/                vendored copy of the backend docs/OpenAPI.json + a version stamp
  src/
    app/                  shell, routing, top-nav, layout, theme, error boundaries
    api/                  generated types + fetch client + SSE ChangeStream + auth
    state/                reactive store (viewport, layers, selection, time, inbox)
    map/                  Cesium viewer, scene modes, layer pipeline (MVT→primitives), HUD
    panels/               dossier, insights, timeline, entity graph, intelligence, alerts
    views/                screen compositions (global, situation, investigation, satellite)
    ui/                   design-system primitives (buttons, tabs, modals, lists, charts)
    lib/                  shared helpers (object-ref, geojson, formatting, time)
  index.html
  vite.config.ts
  package.json
```

A single Next-style "page" is **not** used; there is no frontend server. `app/` composes one SPA
whose routes are client-side.

---

## 3. Stack and versions (verified 2026-10-18)

| Concern | Choice | Notes |
|---|---|---|
| Build/dev | **Vite 6+** | static build; `vite build` → `dist/` |
| UI framework | **React 19 + TypeScript 5** | all non-map UI |
| Map/globe | **CesiumJS 1.146+ via Resium 1.27+** | Resium verified on React 19 + Cesium 1.146 |
| Cesium/Vite glue | `vite-plugin-cesium` (or `vite-plugin-cesium-engine`) | copies Cesium static assets, sets `CESIUM_BASE_URL` |
| Record rendering | **Cesium primitives** (decoded MVT) | batched collections per tile, rendered in the Cesium scene (WGS84 alignment, terrain, occlusion). deck.gl is **not** used as the primary path — it does not align with a WGS84/terrain Cesium host; it stays the §5.2 escape hatch only |
| Relationship graph | **sigma.js (WebGL) + graphology** | the Analyst Workbench evidence graph |
| API types | **openapi-typescript** (types) + **openapi-fetch** (client) | generated from `docs/OpenAPI.json` |
| Charts | a WebGL/Canvas-capable lib (e.g. ECharts or uPlot/visx) | sparklines, trend charts, time series |
| Tests | **Vitest** + Testing Library; Playwright for UI-visible checks | house rule: user-visible fixes proven from outside |

No native wrapper. No state-management dependency is mandated; the store is a small
`useSyncExternalStore` singleton (§6).

---

## 4. Backend interface and the API layer

### 4.1 Generation

`src/api/generated/` is produced by `openapi-typescript openapi/OpenAPI.json`. A thin
`createClient()` (openapi-fetch) wraps it with the base URL, auth header and the ProblemDetail
error model. **The generated code is never hand-edited**; it is regenerated when the vendored spec
is refreshed (`openapi/OpenAPI.json` + a version stamp recorded from `GET /v1/system`
[`getSystem`] / `GET /v1/contract` [`getContract`]).

### 4.2 Authentication and access (per OpenAPI)

The client supports the backend's access modes in this order of preference:

- **Open reads** — when the backend has `security.openReads` on (LAN default), reads need no
  credential. This is the day-one path.
- **Bearer token** — stored client-side; sent as `Authorization: Bearer …` on API calls. Tokens
  are created/managed server-side (`POST /v1/tokens` [`createToken`], `GET /v1/tokens`
  [`listTokens`]); the client only holds and sends one. Pairing (`POST /v1/pairing/claim`
  [`claimPairingCode`]) is available for token delivery.
- **Stream tickets** — map engines and `EventSource` cannot send headers, so SSE and tile URLs
  that need auth use a short-lived ticket minted with `POST /v1/stream-tickets`
  [`createStreamTicket`] and passed as `?ticket=`.
- **Tile keys** — header-less tile/stream access via `POST /v1/tile-keys` [`createTileKey`]
  (`/v1/k/{key}/…` URL form), for when reads are closed.

Capabilities and limits come from `GET /v1/system` [`getSystem`]; contract versions from
`GET /v1/contract` [`getContract`]. The client renders available actions from the object envelope
(§8), not from hard-coded permissions.

### 4.3 Errors

All errors are RFC 9457 ProblemDetail (`type`, `title`, `status`, `code`, …). The client maps
`code` to user messaging; `503 RENDER_BUSY` / `429` carry `Retry-After` and are retried per that
header for tiles and renders.

---

## 5. Rendering architecture

Two layers, clearly separated:

- **UI layer (React).** Everything that is not the map: the top nav, left layer rail, right
  dossier/detail panels, bottom timeline/insights, modals, toasts, search, charts and the entity
  graph. Ordinary DOM/SVG/Canvas — not GPU-bound.
- **Map engine (Cesium).** One `<Viewer>` (Resium) hosting the map/globe. **The map is 2D by default** (`SceneMode.SCENE2D`). **There is no Split mode.** A manual **2D / 3D**
  toggle is available, but the primary path into 3D is **contextual**: selecting an item whose kind
  has an applicable 3D view (an aircraft's altitude track, a satellite's orbit, a storm's structure,
  …) **switches the scene to `SCENE3D` and flies to the item's location**; selecting an item with no
  3D view keeps the 2D map and focuses it. Per-kind 3D applicability is declared with each layer
  (built alongside that layer's data). The same record layers render in 2D and 3D. The 3D globe uses
  **self-hosted quantized-mesh terrain** (from a public-domain DEM) for raised relief, with base
  imagery (NASA Blue Marble day + Black Marble night) draped over it; the elevation readout reads
  terrain height. No Cesium Ion, no account, no external tile service.

### 5.1 Layer pipeline

The backend serves layers in three shapes; the client consumes each with the matching Cesium/deck
mechanism:

| Backend data | Endpoint(s) | Client rendering |
|---|---|---|
| **Record vector tiles** (MVT) | `GET /v1/tiles.json` [`listTileLayers`], `/v1/tiles/{layer}.json` [`getTileJson`], `/v1/tiles/{layer}/{z}/{x}/{y}.mvt` [`getTile`] | **Cesium primitives decoded from the MVT tiles** (batched collections per tile) — renders in the Cesium scene so records align on WGS84, sit on the 2× terrain, and occlude behind the globe, in both 2D and 3D |
| **Raster / weather products** | `GET /v1/products` [`listProducts`], `/{id}/tilejson` [`getProductTileJson`], `/{id}/frames/latest` [`getLatestProductFrame`], `/{id}/tiles/{frameKey}/{z}/{x}/{y}.png` [`getProductTile`], `/{id}/legend` [`getProductLegend`] | Cesium **imagery layers** (`UrlTemplateImageryProvider`), animated by swapping frame templates; legend from JSON |
| **Wind fields** | `/{id}/vectors/{frameKey}/…mvt` [`getProductVectorTile`] (barbs); `/{id}/fields/{frameKey}.png-uv` [`getProductFieldPngUv`] / `.velocity-json` [`getProductFieldVelocityJson`] | barb symbol layer, speed raster, and an animated WebGL particle layer |
| **Vector overlay style** | `GET /v1/map/style.json` [`getMapStyle`], sprites `/v1/map/sprites/{file}` [`getMapSprite`], icons `/v1/map/icons/{name}.png` [`getMapIcon`] | source of per-kind colors, icons and `aggBelowZoom`; drives deck/primitive styling (Cesium does not consume the MapLibre style directly) |
| **Records as features** | `GET /v1/records` [`listRecords`] (GeoJSON), `/v1/kinds` [`listKinds`], `/v1/kinds/{kind}/schema` [`getKindSchema`] | GeoJSON → batched `BillboardCollection`/`PolylineCollection` |

**Concrete, never aliased templates.** Tile templates are taken from TileJSON / `frames/latest`
and are content-addressed; the client never puts `latest`/`now` in a layer template (it swaps the
template when a new frame arrives via SSE). Retina uses the `@2x` template with `tileSize: 256`.
`maxzoom`/`bounds` come from TileJSON.

### 5.2 Scaling to the whole catalog (~300–500 source layers)

This is a first-class requirement (Charter §6.2). The guarantees:

- **The number of layers is not a GPU cost; visible geometry is.** Dense layers render through
  batched **Cesium primitive collections** (decoded from MVT) — never one DOM marker or one Cesium `Entity`
  per feature.
- **Server-side bounding does the heavy lifting.** Below a layer's `aggBelowZoom` the backend
  serves **hex-aggregation** tiles (`agg=hex`), and record tiles / queries are **bbox/viewport
  filtered**. The client sends its current viewport and zoom and renders only the in-view,
  zoom-appropriate slice. `POST /v1/context/summary` [`summarizeContext`] and `GET /v1/glance`
  [`getGlance`] return **aggregates, not raw features**, for counts.
- **Raster is the only real ceiling** (blending many translucent rasters is GPU- and legibility-
  bound, for any engine). The UI keeps a small number of active raster overlays; vector layers are
  unconstrained.
- **deck.gl** is a reserved escape hatch for a single layer that ever needs millions of points, and
  only in the **camera-synced** form (driven by Cesium's own camera with a custom viewport,
  projection and horizon culling). It is **not** part of the build now: deck.gl's spherical globe and
  Mercator-only 2D do not otherwise align with this WGS84/terrain Cesium map.

---

## 6. Live data and state

### 6.1 Streams (SSE)

The client holds **one** multiplexed, re-filterable stream for live updates, not one per source:

- `GET /v1/events/stream` [`streamEvents`] — multiplexed, re-filterable; swap the active filter on
  the open stream with `PATCH /v1/events/stream/{streamId}/filter` [`updateEventStreamFilter`] as
  layers/viewport change.
- `GET /v1/changes/stream` [`streamChanges`] — the record change stream (used for tile/frame
  template swaps and head updates).
- Resume: reconnect with `Last-Event-ID`; a gap older than retention returns `410
  RESYNC_REQUIRED` → reload affected layers. Catch-up after background via `GET /v1/changes`
  [`listChanges`] (`after=<seq>`).
- Browser `EventSource` cannot send headers; when reads are closed the client passes a
  `?ticket=` from `POST /v1/stream-tickets` [`createStreamTicket`]. Over HTTP/1.1 (no web profile)
  the single shared stream avoids the 6-connection limit; a `SharedWorker` may own it across tabs.

Per-saved-view live updates use `GET /v1/views/{viewId}/stream` [`streamView`]. Alerts and inbox
have their own streams (§13).

### 6.2 Store

A small reactive singleton on React 18+ `useSyncExternalStore` (no Redux/Zustand): components
subscribe to keys (`selection`, `viewport`, `layers:<id>`, `time`, `inbox`) and re-render only on
their key. The SSE stream applies deltas into the store; the map and panels read from it. This is
deliberately dependency-free and tear-free.

State held: active scene mode, enabled layers + filters, current viewport (bbox+zoom), selected
object ref, time cursor (live vs asOf), inbox badge, workspace context version.

---

## 7. Time and history

The design's time scrubber and playback use the transaction-time endpoints:

- `GET /v1/timeline` [`getTimeline`] — scrubber histogram (density per bucket).
- `GET /v1/history/frames` [`getHistoryFrames`] — keyframe + delta frames for playback.
- `GET /v1/records/{sourceId}/{externalId}/track` [`getRecordTrack`] — a simplified entity track
  (trails).
- **asOf tiles** — paused-map rendering uses the `asOf` form of the tile/TileJSON endpoints; the
  client takes the concrete template returned (never building the time string itself).

Flags surfaced to the user: `approximate`, `horizon` (clamp the scrubber), `watermarkSeq` (to
resume live from a replayed state).

---

## 8. Panels and composed reads

Selection-driven panels are fed by the backend's **composed reads** so a panel is one bounded
request, not many:

- **Object envelope** — `GET /v1/objects/{ref}` [`getObject`], batch `POST /v1/objects/resolve`
  [`resolveObjects`]. Carries `title`, `summary`, `severity`, `geometry`/`bbox`, `tags`,
  `provenance`, `links`, and **`actions`** (what the calling token may do — the client renders
  buttons from these).
- **Dossier** — `GET /v1/objects/{ref}/dossier` [`getObjectDossier`] (`overview`, `imagery`,
  `forecast`, `impacts`, `related`, `timeline`, `analysis`; each section carries a status so panels
  render partially). This drives the **right-hand selected-entity panel**.
- **Context summary** — `POST /v1/context/summary` [`summarizeContext`] for a viewport + time +
  filters: `layerCounts`, `activity`, `insights`, `related`. This drives the **Analytics &
  Insights** and **Activity Timeline** panels.
- **Related** — `GET /v1/objects/{ref}/related` [`listRelatedObjects`] → the **Related Entities**
  panel.
- **Object refs** are `{type}:{id}` strings, opaque to the client, percent-encoded as one path
  segment; a shared helper in `lib/` parses/formats them.

---

## 9. Screen → feature → endpoint map

| Design screen | Primary endpoints (operationId) |
|---|---|
| **Global Dashboard** | tiles `listTileLayers`/`getTile`, products `listProducts`/`getProductTile`, map style `getMapStyle`, live `streamEvents`/`streamChanges`, dossier `getObjectDossier`, context `summarizeContext`, related `listRelatedObjects`, glance `getGlance`, search `search` |
| **Conflict (situation full analysis)** | `getSituation`, `getSituationTimeline`, `getSituationChanges`, findings `listFindings`, hypotheses `getHypothesisSet`/`getAchMatrix`, forecasts `listForecastQuestions`/`getForecastQuestionHistory`, assessments `listSituationAssessments`/`getAssessment`, evidence via dossier |
| **Tropical Storm (investigation)** | dossier `getObjectDossier` (overview/forecast/impacts), situation endpoints, products (NHC track/cone as official products), `listProjectedImpacts`, `getRecordTrack` |
| **Analyst Workbench** | graph `queryGraph`/`findCommonDependencies`, workspaces `getWorkspace`/`patchWorkspaceContext`, annotations `createAnnotation`/`listObjectAnnotations`, timeline, hypotheses |
| **Satellite Operations / Analysis** | sensors `listSensors`, satellite records (`listRecords` kind=satellite), orbits (CZML/SGP4 from TLE), media `getMedia`/`getMediaThumbnail`, products imagery |
| **Alerts / Notifications (global)** | `listAlerts`/`streamAlerts`/`acknowledgeAlert`/`snoozeAlert`/`resolveAlert`, inbox `listNotifications`/`streamNotifications`/`getNotificationBadge`/`markNotificationsRead` |

---

## 10. Intelligence views

Rendered read-only from the intelligence endpoints (the client may *request* on-demand work where
the envelope's `actions` allow it, but computes nothing itself):

- **Situations** — `listSituations`, `getSituation`, `getSituationTimeline`, `getSituationChanges`.
- **Findings & impacts** — `listFindings`, `getFinding`, `listProjectedImpacts`,
  `listImpactRates`, `listAnalysisSeries`/`getAnalyticsSeriesData` (metric charts).
- **Hypotheses (ACH)** — `listHypothesisSets`, `getHypothesisSet`, `getAchMatrix`,
  `getInformationValue`.
- **Forecasts** — `listForecastQuestions`, `getForecastQuestion`, `getForecastQuestionHistory`
  (trend sparklines), `getForecastScorecard`.
- **Assessments ("AI Analysis" tabs)** — `listAssessments`, `getAssessment`,
  `getLatestAssessment`, `listSituationAssessments`, on-demand `createSituationAssessment`.

`textOrigin` (deterministic vs LLM) is shown so operators know what is machine-written.

---

## 11. Investigations, workspaces, collaboration

- **Relationship graph** — `POST /v1/graph` [`queryGraph`] returns a subgraph; rendered with
  sigma.js (WebGL) so it scales. `findCommonDependencies` powers the shared-dependency view.
- **Workspaces** — `getWorkspace`, `patchWorkspaceContext` (JSON merge patch with `If-Match` on
  `contextVersion`; `412` → re-read, re-apply, retry), `putWorkspaceLayout`, `getWorkspaceSummary`.
  The workspace's `selectedRefs` is the shared selection the panels follow.
- **Deep links** — `createContextLink` / `getWorkspaceContextLink` encode/decode the current
  context; the client reads them on load to restore state.
- **Annotations & relations** — `createAnnotation`/`listObjectAnnotations`, `createRelation`.

---

## 12. Satellite operations

Cesium's origin domain. Satellites render as time-dynamic orbits (CZML or SGP4 propagation from
TLE) with ground tracks and passes; the globe's native depth occlusion hides orbit arcs behind the
earth. Data: `listSensors` (sensor discovery), `listRecords` (kind=satellite) and the backend's
CelesTrak-compatible GP/TLE endpoints (`getCelestrakGp` etc.); imagery via `getMedia` /
`getMediaThumbnail` and product frames; the before/after change-detection comparison is a UI swipe
widget over two media frames.

---

## 13. Alerts and notifications

- **Alerts** — `listAlerts`, `streamAlerts` (SSE), `getAlert`; lifecycle `acknowledgeAlert`,
  `snoozeAlert`/`unsnoozeAlert`, `resolveAlert`, `setAlertFeedback`. Firing alerts surface as
  toasts and a top strip.
- **Inbox** — `listNotifications`, `streamNotifications` (SSE), `getNotificationBadge`,
  `markNotificationsRead`, `getNotification`. Per-device read state uses a client-chosen
  `Foresignal-Device-Id` (UUID, persisted). Reading never acknowledges an alert.
- **Presence** — `updatePresence` [`POST /v1/clients/presence`] reports the desktop window as
  active/idle/background so the backend can defer non-critical phone pushes.

**Alert rules** are authored in the client — a form that POSTs `createTrigger` (and
`updateTrigger`/`deleteTrigger`), scoped to the current view / situation / watchlist, dry-run with
`testTrigger`, muted/snoozed with `muteTrigger`/`snoozeTrigger`. The backend owns all evaluation;
the client only authors the rule spec. **Web Push** (service worker + VAPID: `getVapidPublicKey`,
`createPushSubscription`, `verifyPushSubscription`) delivers firing alerts with the tab closed.
Both are prompt 030. Native APNs/FCM push is for the future Flutter app, not this client.

---

## 14. Search, saved state, widgets

- **Search** — `GET /v1/search` [`search`] backs the top search bar (records, briefings, alerts);
  `search/status` for semantic-search readiness. `POST /v1/ask` [`ask`] / `ask/stream` backs the
  "Ask ForeSignal" panel (built in 017).
- **Places / views / watchlists** — `listPlaces`/`createPlace`, `listViews`/`createView`
  (+ `getViewRecords`, `getViewTileJson`, `streamView`), `listWatchlists`/`addWatchlistItems`.
  Saved views carry their own tiles and stream, so a saved layer set is one source.
- **Glance / stats** — `getGlance` (ticker), `getStatsGrid`/`getStatsTimeseries`/`getStatsTop`
  for activity widgets.

---

## 15. Performance and scale strategy (summary)

1. **Batched GPU rendering** for all dense layers — **Cesium primitive collections** decoded from the
   MVT tiles. Never per-feature DOM/`Entity`.
2. **Server-bounded data**: viewport bbox + zoom scoping, hex aggregation below `aggBelowZoom`,
   aggregate-only summary/glance endpoints. The client renders an in-view slice, never the globe's
   raw firehose.
3. **One SSE stream**, re-filtered as the view changes; resume + catch-up, not reconnect-from-zero.
4. **Content-addressed, immutable tiles** cached for a year; frame swaps on SSE events.
5. **Retry discipline** on `503 RENDER_BUSY`/`429` per `Retry-After`; `?prefetch=1` for
   non-interactive animation frames.
6. **Raster restraint**: a small number of active raster overlays at a time.

The practical ceiling becomes whatever the backend hits first — not the client.

---

## 16. Build, config and deployment

- **Dev:** `vite dev` with a **dev-server proxy** forwarding `/v1`, `/mcp` and `/actuator` to the
  backend (target from `VITE_FORESIGNAL_BACKEND`). The app always calls same-origin `/v1/…`, in dev
  and prod alike (base URL stays `/`), so the client never depends on cross-origin CORS. The proxy
  is Vite dev tooling only — prod is served by the backend, no proxy, no frontend process.
- **Prod:** `vite build` → `dist/`. Copied into the backend's web root (`./deploy/web`) and served
  same-origin behind the backend's reverse proxy. No frontend server.
- **Cesium assets:** the Vite Cesium plugin copies Cesium's `Workers`/`Assets`/`ThirdParty` and
  sets `window.CESIUM_BASE_URL`; verified for the build output.
- **No secrets in the bundle.** The backend base URL is runtime config; tokens are user-supplied
  and stored client-side, never baked in.
- **OpenAPI sync:** `openapi/OpenAPI.json` is a vendored copy of the backend spec with a recorded
  version; type generation runs from it. A mismatch against `GET /v1/system` version is surfaced,
  not silently tolerated.

---

## 17. Testing and verification

- **Unit/component:** Vitest + Testing Library for logic and components; the API layer is tested
  against the OpenAPI types (and may use a mock server generated from the spec).
- **User-visible fixes are proven from outside the component** (house rule): Playwright against a
  real build, or a pixel/DOM assertion on the rendered page — not by asking the component tree what
  it was just told.
- **Scale check:** a stress scenario enabling the full catalog of layers, asserting the client
  stays interactive (frame budget) by relying on aggregation + batching.

---

## 18. Conventions

- **US English** in all code, identifiers, UI strings, comments and commits.
- **No second service** and **no backend change** — ever, per Charter §2–3.
- **OpenAPI is the only backend reference** — every API call cites an `operationId`.
- Generated code (`src/api/generated/`) is never hand-edited.
- Documentation comments on every exported component and public function, in the same pass as the
  code; tests written in the same pass.
