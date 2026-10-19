# 019 — Situations

**Goal.** The situation "full analysis" view (the Conflict Dashboard): a situation's overview,
timeline, what-changed, and the frame that hosts the intelligence panels (020–023).

**Read first.** 018-CR; [Architecture.md](../docs/Architecture.md) §9, §10. Design: **Conflict
Intelligence Dashboard** (Overview / Full Analysis / Timeline / Map / Entities / Evidence /
Hypotheses / Forecasts tabs; confidence, info value, last-updated).

**Backend (OpenAPI only).**
- `GET /v1/situations` [`listSituations`], `GET /v1/situations/{id}` [`getSituation`].
- `GET /v1/situations/{id}/timeline` [`getSituationTimeline`].
- `GET /v1/situations/{id}/changes` [`getSituationChanges`] — what changed since a time.
- `GET /v1/situations/{id}/members` [`listSituationMembers`] — member objects for the Entities tab.

**Build.**
- A Situation view under `views/` reached by selecting a situation (from map, insights, or search).
- Header: title, status, severity, confidence, information-value, last-updated, auto-refresh via the
  live stream (011).
- Tabs matching the design; this prompt delivers Overview, Timeline (`getSituationTimeline`), Map
  (reuse the map focused on the situation bbox with its member layers), Entities
  (`listSituationMembers`). Evidence/Hypotheses/Forecasts/AI-Analysis tabs are filled by 020–023.
- A situation map focus: fly to `bbox`, enable the relevant layers, draw member geometry.

**Done when.** Selecting a situation opens its full-analysis view with a populated header, timeline
and member list, and a focused map. Playwright: open a situation → tabs populate.

**Commit.** `019: Situations`; `completion-reports/019-CR-Situations.md` (hash + owner questions).
