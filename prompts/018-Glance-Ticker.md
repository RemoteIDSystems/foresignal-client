# 018 — Glance Ticker

**Goal.** The global status ticker and activity widgets, from the backend's compact status and
stats endpoints.

**Read first.** 017-CR; [Architecture.md](../docs/Architecture.md) §14. Design: the global ticker /
status strip and small activity widgets.

**Backend (OpenAPI only).**
- `GET /v1/glance` [`getGlance`] — compact status for widgets.
- `GET /v1/stats/top` [`getStatsTop`] — top sources/kinds/cells/entities.
- `GET /v1/stats/timeseries` [`getStatsTimeseries`] — activity time series.
- `GET /v1/stats/grid` [`getStatsGrid`] — spatial activity grid (optional heat widget).

**Build.**
- A global ticker fed by `getGlance`, refreshed on a light interval and on stream activity (011).
- Small widgets: top sources/kinds (`getStatsTop`) and an activity sparkline (`getStatsTimeseries`)
  using the chart lib. Aggregates only.

**Done when.** The ticker shows live counts and the widgets render current top/series data; they
update as activity changes. Playwright: ticker and a sparkline render with data.

**Commit.** `018: Glance Ticker`; `completion-reports/018-CR-Glance-Ticker.md` (hash + owner questions).
