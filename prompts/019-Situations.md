# 019 — Situations & Investigations

**Goal.** The full-analysis detail view for both **situations** (Conflict Dashboard) and
**investigations** (Tropical-Storm investigation workspace): overview, timeline, what-changed,
members/items, and the frame that hosts the intelligence panels (020–023).

**Read first.** 018-CR; [Architecture.md](../docs/Architecture.md) §9, §10, §11. Design: **Conflict
Intelligence Dashboard** (situation full analysis) and **Tropical Storm Intelligence Dashboard**
(investigation workspace) — tabs: Overview / Full Analysis / Timeline / Map / Entities / Evidence /
Hypotheses / Forecasts.

**Backend (OpenAPI only).**
- Situations: `GET /v1/situations` [`listSituations`], `GET /v1/situations/{id}` [`getSituation`],
  `GET /v1/situations/{id}/timeline` [`getSituationTimeline`], `GET /v1/situations/{id}/changes`
  [`getSituationChanges`], `GET /v1/situations/{id}/members` [`listSituationMembers`].
- Investigations: `GET /v1/investigations` [`listInvestigations`], `GET /v1/investigations/{id}`
  [`getInvestigation`], `PATCH /v1/investigations/{id}` [`updateInvestigation`],
  `POST /v1/investigations/{id}/items` [`addInvestigationItem`],
  `DELETE /v1/investigations/{id}/items/{itemId}` [`removeInvestigationItem`],
  `GET /v1/investigations/{id}/export` [`exportInvestigation`]; open one from an object via the
  envelope's `open-investigation` action (`POST /v1/investigations` [`createInvestigation`]).
- Intel-event members: `GET /v1/intel/events/{id}` [`getIntelEvent`].

**Build.**
- A full-analysis view under `views/` reached by selecting a situation or investigation (from map,
  insights, search or dossier). Header: title, status, severity, confidence, information value,
  last-updated; auto-refresh via the live stream (011).
- Tabs matching the designs; this prompt delivers Overview, Timeline, Map (focused on the
  situation/investigation bbox with its members), and Entities/Items (members for a situation,
  items for an investigation, add/remove where the envelope allows). Evidence, Hypotheses, Forecasts
  and AI-Analysis tabs are filled by 020–023.
- Investigation items can be added/removed; an investigation can be exported.

**Match the mocks (Conflict Dashboard + Tropical-Storm investigation).** Header: title + status
badge (ACTIVE), started date + duration + scope, a **Confidence** gauge (e.g. 72% MODERATE), an
**Information Value** meter (High), **Last Updated** + Auto-refresh, and Add Note / Share / …
actions. Tab strip: **Overview / Full Analysis / Timeline / Map / Entities (n) / Evidence (n) /
Hypotheses / Forecasts / Related (n) / Reports / Export**. Left ANALYSIS rail (Situations / Findings
/ Hypotheses / Forecasts / Indicators / Base Rates / Comparisons / Reports) + DATA + TOOLS. The Map
tab reuses the map on the bbox with member layers, the mock's **Layers** dropdown (Conflicts /
Military / Infrastructure / Energy / Displacement / Custom) + legend + time range. The Tropical-Storm
investigation uses the same frame with the investigation header (INV-…, date range, UTC) and Key
Findings + Filters + Sources rails. 020–023 fill Evidence / Metrics / Hypotheses / Forecasts /
AI-Analysis.

**Done when.** Selecting a situation opens its full-analysis view; selecting an investigation opens
the investigation workspace; both show a populated header, timeline, members/items and a focused
map. Playwright: open each → tabs populate.

**Commit.** `019: Situations & Investigations`;
`completion-reports/019-CR-Situations-And-Investigations.md` (hash + owner questions).
