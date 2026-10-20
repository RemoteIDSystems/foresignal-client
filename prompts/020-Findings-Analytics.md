# 020 — Findings And Analytics

**Goal.** Analytic findings, projected impacts and metric series — the Conflict Dashboard's
Evidence/metrics and the dossier's analysis.

**Read first.** 019-CR; [Architecture.md](../docs/Architecture.md) §10. Design: Conflict Dashboard
CONFLICT METRICS (Military/Strikes/Casualties/Economic/Humanitarian charts) and EVIDENCE.

**Backend (OpenAPI only).**
- `GET /v1/analytics/findings` [`listFindings`], `GET /v1/analytics/findings/{id}` [`getFinding`].
- `GET /v1/analytics/impacts` [`listProjectedImpacts`], `GET /v1/analytics/impacts/{id}`
  [`getProjectedImpact`], `GET /v1/analytics/impact-rates` [`listImpactRates`].
- `GET /v1/analytics/series` [`listAnalysisSeries`], `GET /v1/analytics/series/data`
  [`getAnalyticsSeriesData`] — metric charts.

**Build.**
- A Findings list/panel (filterable by the situation / viewport) from `listFindings`, each with its
  base rate and a link to its object.
- A Metrics panel rendering `listAnalysisSeries` + `getAnalyticsSeriesData` as time-series charts
  (the design's multi-tab metrics), and projected impacts from `listProjectedImpacts` with
  probabilities/intervals.
- Dismiss a finding where the envelope action allows it (`updateFinding`) — only if offered.

**Match the mock (CONFLICT METRICS + EVIDENCE).** Metrics panel: tabs **Military / Strikes /
Casualties / Economic / Humanitarian**, each a time-series chart (7-day-average style) plus a row of
**stat tiles** (big number + label + delta vs prior, e.g. `1,946 Combat events +12%`). Evidence
panel: tabs **All / Imagery / Signals / Reports / Docs** with rows (thumbnail, title, source + family
tags, a confidence tag) and `View all evidence`.

**Done when.** The situation view shows findings and metric charts from real series; impacts render
with probabilities. Playwright: metrics tab renders charts.

**Commit.** `020: Findings And Analytics`; `completion-reports/020-CR-Findings-And-Analytics.md` (hash + owner questions).
