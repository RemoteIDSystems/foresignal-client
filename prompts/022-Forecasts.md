# 022 — Forecasts

**Goal.** The Forecasts & Predictions panel: ledger questions with ensemble probabilities, trend
charts and the scorecard.

**Read first.** 021-CR; [Architecture.md](../docs/Architecture.md) §10. Design: FORECASTS &
PREDICTIONS (1/3/6/12-month, probability + trend arrows, forecast ledger link).

**Backend (OpenAPI only).**
- `GET /v1/forecasts/questions` [`listForecastQuestions`], `GET /v1/forecasts/questions/{id}`
  [`getForecastQuestion`].
- `GET /v1/forecasts/questions/{id}/history` [`getForecastQuestionHistory`] — trend charts.
- `GET /v1/forecasts/questions/{id}/forecasts` [`listForecasts`] — per-forecaster probabilities.
- `GET /v1/forecasts/scorecard` [`getForecastScorecard`], `GET /v1/forecasts/calibration`
  [`getForecastCalibration`] — the forecast ledger.

**Build.**
- A Forecasts panel listing open questions about the situation/viewport with the ensemble
  probability, ICD-203 term, horizon, and a trend sparkline from `getForecastQuestionHistory`.
- A "forecast ledger" view: scorecard (`getForecastScorecard`) and calibration curve
  (`getForecastCalibration`).

**Match the mock (FORECASTS & PREDICTIONS).** A horizon selector **1 month / 3 months / 6 months /
1 year**; rows, each with a question title + target date, a probability pill (e.g. `68%`), and a
small trend sparkline colored High/Medium/Low; a `View forecast ledger →` link. The ledger view
shows the scorecard + calibration curve.

**Done when.** The panel shows forecast questions with probabilities and trend sparklines; the
ledger view renders a scorecard. Playwright: forecasts panel + trends render.

**Commit.** `022: Forecasts`; `completion-reports/022-CR-Forecasts.md` (hash + owner questions).
