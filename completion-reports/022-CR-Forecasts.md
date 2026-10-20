# 022 — Completion Report: Forecasts

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete) |
| Implementation commit | `1315e32a64f1a3923a2a4699fdd403e7f8b58c30`                                              |
| Run mode              | Unattended (owner's batch 019–022, no review gates)                                     |
| Screenshots           | None taken (compile-only run). `e2e/forecasts.e2e.ts` takes none either.                |
| Mock comparison       | From the Conflict mock and the code, not from a screenshot (below).                     |

## Results

- **The Forecasts tab** of the full-analysis view is filled with the **Forecasts & Predictions**
  card:
  - a horizon selector, 1 month / 3 months / 6 months / 1 year, opening on 3 months;
  - a row per open question that resolves within the horizon, soonest first. Each row has:
    - the title (which opens the question), "By YYYY-MM-DD", the category and the ICD-203 term;
    - the ensemble probability as a pill (green from 70%), with a trend arrow;
    - a trend sparkline from `getForecastQuestionHistory`, red, amber or blue for High, Medium
      or Low;
  - the first 20 rows, then "Show all n questions";
  - **View forecast ledger →** and the "Probability trend: High · Medium · Low" key.
- **A question's detail** opens beside the list. It shows:
  - the ensemble and its term, the resolve-by date, the type and resolver, and the forecast count;
  - the resolution criteria (`getForecastQuestion`);
  - every forecaster's daily probability as an **ECharts** line chart, 0–100%;
  - each forecaster's latest forecast (`listForecasts`) with its type, value, time and rationale.
- **The forecast ledger** replaces the card until "← Forecasts". It shows:
  - **the scorecard** (`getForecastScorecard`): per forecaster and category, the resolved count
    (tagged insufficient under the backend's threshold), Brier, log score, skill against its
    reference, and ensemble weight. With no entries it says nothing has been scored yet;
  - **the calibration curve** (`getForecastCalibration`), drawn by **ECharts** as a reliability
    diagram: the diagonal for perfect calibration, the bins as dots sized by their counts, and the
    recalibrated curve when there is one. Below it: n, the method, sharpness, the decomposition,
    and a note when the backend labels it insufficient.
- **ECharts is reused** from 020, which keeps one chart chunk (558.43 kB, unchanged). The rows'
  sparklines stay SVG, as the prompt allows; the existing `Sparkline` gained a `tone`.
- **Which questions are listed.** A situation lists the questions linked to it
  (`listForecastQuestions` with `linked=situation:<id>`, `status=open` and `dueBefore` the
  horizon's end). An investigation lists the questions it links (`questionIds`, read one by one),
  filtered to the horizon in the client.
- **Local data.** In this session, curl through the dev proxy gave:
  - `GET /v1/forecasts/questions?limit=3`: 200, `{"items":[],"nextCursor":null}`;
  - `GET /v1/forecasts/scorecard`: 200, `entries: []`, `scorerVersion` 1.0.0;
  - `GET /v1/forecasts/calibration`: 200, `n: 0`, `label: insufficient`, `method: bins`, ten
    empty bins.

  So the ledger can be checked live, and the questions use stand-ins
  (`src/intel/testing/forecastFixtures.ts`). The fixture dates are relative to the time the tests
  load, so the horizons hold whenever they run.

## What was built

- **`intel/forecastApi.ts`**:
  - `listForecastQuestions` (linked, statuses with open by default, due before), returning
    summaries;
  - `getForecastQuestion`, `getForecastQuestionHistory`, `listForecasts`;
  - `getForecastScorecard`, `getForecastCalibration`.
- **`intel/forecastsView.ts`** holds the view logic:
  - the horizons, a horizon's end in calendar months, the scope, and the open questions due in
    the horizon;
  - trend levels and their colors; the pill's tone and text;
  - the trend line (the ensemble's, else the first with probabilities), its values and its arrow;
  - the history as chart lines; each forecaster's latest forecast;
  - a forecast's text by kind: a probability, the likeliest outcome, or a median with its unit;
  - scorecard order, score text, and the reliability bins and curve.
- **`ui/charts/chartOptions.ts`**: `timeSeriesOption` takes a `percent` axis (0–100%), and a new
  `reliabilityOption` draws the calibration diagram.
- **`ui/Sparkline.tsx`**: `tone` (accent by default; danger, warning or info).
- **`views/analysis/ForecastsTab.tsx`**: the tab, `ForecastsPanel`, the rows, the question detail
  and `LedgerView`.
- **`AnalysisView`** renders the tab. **`frame.ts`** no longer lists Forecasts as pending. Only Full
  Analysis (023) and Reports (a later prompt) remain pending.

## How it was checked

### Tests (written, not run)

- `intel/forecastApi.test.ts` (3):
  - the questions query (`linked`, `status=open`, `dueBefore`, limit 500);
  - the question, history and forecasts paths;
  - the scorecard and calibration paths.
- `intel/forecastsView.test.ts` (10):
  - horizons and their ends (3 and 12 months); scopes; due questions (the closed and too-late ones
    left out, soonest first);
  - levels, tones, pill and text;
  - the ensemble trend with up, down, flat and single-point arrows; an empty history;
  - history lines in percent; each forecaster's latest;
  - forecast text for a probability, a distribution and quantiles;
  - scorecard order and score text; reliability bins (an empty bin dropped) and the curve.
- `ui/charts/chartOptions.test.ts` (+2): the percent axis; the reliability diagram with and
  without a curve, its dots at whole percents.
- `ui/Sparkline.test.tsx` (+1): the tone, accent by default.
- `views/analysis/ForecastsTab.test.tsx` (6). The chart is mocked.
  - **Three months:** two rows, `74% ↑`, a ten-point red sparkline and a blue one; the query's
    `linked`, `status` and `dueBefore`; the ledger link and the trend key.
  - **Horizons:** 1 month shows one row, 6 months three.
  - **A question:** its criteria, "74% (likely)", a two-line history chart, three latest forecasts
    with the rationale, and closing it.
  - **The ledger:** scorecard rows in order with Brier, skill and insufficient; the two-series
    calibration chart, its summary line and the insufficient note; back to the list.
  - **An investigation's linked question,** with no list query.
  - **No questions due.**
- `views/analysis/AnalysisView.test.tsx`: the pending-tab case now opens Full Analysis (023).
- `e2e/forecasts.e2e.ts` (1). The questions are stand-ins; the ledger is the live backend's.
  - two rows, `74% ↑`, and a ten-point sparkline with its line drawn; three rows at 6 months;
  - a question's history on an ECharts canvas, with two series;
  - the live scorecard checked against what the backend answered (its empty message, or one row
    per entry);
  - the live calibration on an ECharts canvas 260 px tall;
  - no console errors.

### Checks

| Check                                                       | Result                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `npm run typecheck`                                         | Passed (exit 0)                                                                   |
| `npm run lint`                                              | Passed (exit 0)                                                                   |
| `npx prettier --check src e2e`                              | Passed                                                                            |
| `npm run build`                                             | Passed. `index` 677.23 kB (207.15 kB gzip); `EChartCanvas` unchanged at 558.43 kB |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                                                       |
| Guard: `test_us_english.py`                                 | 14 tests OK                                                                       |
| Guard: `check_us_english.py` over the project               | 797 hits, unchanged from 020 (that report explains the one wire string over 796)  |
| Guard: `check_us_english.py` over the new and changed files | `[]`                                                                              |

## Compared to the mock

Compared by reading the Conflict mock's FORECASTS & PREDICTIONS (cropped from the design PNG and
read in this session) against the components; no screenshot of the app was taken.

- **Matches:**
  - the horizon buttons 1 month / 3 months / 6 months / 1 year, with 3 months selected;
  - rows with a title and "By date" line, a probability pill (green for the mock's 74%, gray for
    68%, 26%, 8% and 32%), and a trend line on the right;
  - "View forecast ledger →" at the bottom left, and "Probability trend" with High red, Medium
    amber and Low blue on the right.
- **Differs:**
  - Each row carries a category tag and the ICD-203 term where the mock has a category icon.
  - The pill carries a trend arrow, which the prompt asks for; the mock's rows show none.
  - The sparkline is SVG without the mock's dots at each point.
  - The ledger view, the question detail and their charts are not in the mock; the prompt asks
    for them.
  - The panel fills the Forecasts tab rather than sitting beside the metrics on Full Analysis;
    that layout is 023's.

## Decisions taken (unattended run)

1. **Horizon** means questions whose `resolveBy` falls before now plus 1, 3, 6 or 12 calendar
   months. That is sent to the backend as `dueBefore` and applied again in the client.
2. **Only open questions** are listed.
3. **Trend levels** come from the current probability: High from 60%, Medium from 35%, Low below.
   The mock colors 68% and 74% red, and 26%, 8% and 32% blue.
4. **The pill** is green from 70% and gray below, which reproduces the mock's five.
5. **The trend line** is the ensemble's. Its arrow compares the last value with the one a week
   earlier, at a two-point threshold. The pill's value is the summary's `ensembleProbability`,
   else the line's last value.
6. **The ledger** shows all forecasters and all categories, with no filter.
7. **Rows:** the first 20 load their history; the rest wait for "Show all".

## Deviations from the prompt text

- **"Open questions about the situation/viewport":** questions are listed by the situation link,
  not by the viewport. `listForecastQuestions` has no area parameter (owner question 1).
- **"Playwright: forecasts panel + trends render":** written as `e2e/forecasts.e2e.ts`, not run
  (standing rule). It uses stand-in questions, because the local backend has none.

## Backend observations

- **Local data:** no questions; an empty scorecard; calibration `n: 0`, insufficient, ten empty
  bins (curl, this session).
- **Lists carry summaries.** `ForecastQuestionPage.items` are `ForecastQuestionSummary`: the
  ensemble probability and term, but no distribution or forecasts. A non-binary question's row
  therefore shows no probability until it is opened.
- **No area filter.** `listForecastQuestions` filters by `linked`, status, category, resolver and
  `dueBefore`, but not by area.

## Owner questions

1. **Viewport questions.** Should the panel also list questions about the visible area? That
   would need an area filter on `listForecastQuestions`. **Default in place: questions linked to
   the situation, or linked by the investigation.**
2. **Trend colors.** Should the sparkline color follow the level (High, Medium, Low by current
   probability) or the direction of change? **Default in place: the level, High ≥ 60%, Medium
   ≥ 35%.**
3. **Non-binary questions.** Should a multiple-choice or numeric question's row show its leading
   outcome? The summary does not carry it, so each would need `getForecastQuestion`. **Default in
   place: a dash in the row, the full forecast in the detail.**
4. **Ledger scope.** Should the ledger be filtered to the situation's categories or forecasters?
   **Default in place: everything.**

Questions still open from earlier reports keep their defaults.
