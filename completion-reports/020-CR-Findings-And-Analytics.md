# 020 — Completion Report: Findings And Analytics

| Field                 | Value                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete)                  |
| Implementation commit | `ec411f18d041134838a0522a728f8c7af6206030`                                                               |
| Run mode              | Unattended (owner's batch 019–022, no review gates)                                                      |
| Screenshots           | None taken (compile-only run). `e2e/findings-analytics.e2e.ts` takes none either; it asserts the canvas. |
| Mock comparison       | From the Conflict mock and the code, not from a screenshot (below).                                      |

## Results

- **The Evidence tab** of the full-analysis view (019) is filled. It is labeled `Evidence (n)`, where
  n is a situation's members or an investigation's items other than notes. It has four panels:
  - **Metrics:** a tab per signal family. Each tab draws its series as an ECharts line chart of
    7-day averages over the last 90 days, with a stat tile per series: the latest 30 days' total and
    the change from the 30 days before (`+100% vs. prev. 30d`).
  - **Evidence:** All, Imagery, Signals, Reports and Docs, each with its count. Every row has an
    icon for its type, the title (which opens its object), when, source, kind and family tags, and a
    High, Medium or Low confidence tag. The first six show, then "View all evidence →".
  - **Analytic Findings:** each finding's severity, title, type, when detected, base rate text, and
    "Open object". A finding opens its detail beside the list. The detail shows:
    - the explanation;
    - the detector and its version;
    - the base rate and the detector's statistics;
    - the caveats;
    - the evidence refs;
    - **Dismiss finding**, with a reason, but only when the finding's envelope offers a
      `PATCH …/analytics/findings/…` action.
  - **Projected Impacts:** for each impact:
    - the impact family and area, with its probability as a pill;
    - the hazard, the interval, n, and the hazard and conditional probabilities;
    - the matching historical rate from `listImpactRates`, or "insufficient history (n = …)";
    - the backend's labels.
- **The rail's Analytic Findings and Base Rates** entries both open the Evidence tab.
- **ECharts 6.1.0** is added, for these charts and those to come in 022 and 023. It loads with the
  first chart, in its own chunk, so the map views do not carry it.
- **The local backend has no analytics data to show.** In this session, curl through the dev
  proxy gave:
  - `listFindings`, `listProjectedImpacts` and `listAnalysisSeries` (with and without
    `enabled=true`) each answered 200 with 0 items;
  - `listImpactRates` answered rates with `n: 0`, `rate: null`, `status` `insufficient`.

  So "findings and metric charts from real series" cannot be shown locally. The tests use stand-in
  data (`src/intel/testing/analyticsFixtures.ts`), typed against the generated schema.

## What was built

- **`ui/charts/echarts.ts`** registers only what is drawn: line, bar and scatter series; grid,
  legend, tooltip and mark lines; the canvas renderer. It exports the `ChartOption` type and
  `createChart`. ECharts' `use` is imported as `registerParts`, because the React hooks lint rule
  takes a top-level `use(...)` for React's hook.
- **`ui/charts/EChartCanvas.tsx`**:
  - creates the chart once and sets each new option without merging;
  - resizes with its box (`ResizeObserver`);
  - disposes of the chart on unmount.
- **`ui/charts/EChart.tsx`** loads the canvas lazily. The chart's box carries:
  - `role="img"` with a label for screen readers;
  - `data-series`, the number of series drawn;
  - a test id.
- **`ui/charts/chartOptions.ts`**:
  - the series colors from the theme tokens (red, orange, blue, gray, as the mock);
  - the shared base option: transparent background, the theme's type, a dark tooltip, no animation;
  - `movingAverage`;
  - `timeSeriesOption`: one smooth line per series on a time axis, the legend below, with an
    optional trailing average.
- **`intel/analyticsApi.ts`**:
  - `listFindings` (by situation or regions; open ones by default), `getFinding`, and
    `dismissFinding` (`updateFinding` as `application/merge-patch+json`, with
    `{status: 'dismissed', reason}`);
  - `listProjectedImpacts` (by region and since), `listImpactRates`;
  - `listAnalysisSeries` (enabled, by family and region), `getSeriesData`.
- **`intel/findingsView.ts`** holds the view logic:
  - the evidence groups and their rows, for members and items;
  - finding tones and refs;
  - the metric tabs (by family, the situation's own families first, at most four lines);
  - series names and points, stat tiles, percents, and the rate behind an impact.
- **`intel/useEvidence.ts`**:
  - **`evidenceScope`:** a situation reads its linked findings, and the impacts and series of its
    regions (`ZZ` left out) since it started. An investigation reads the findings its items pin
    (`finding:` refs, at most 50) and has no regions.
  - **`useEvidence`:** loads each part on its own, so one failing leaves the rest.
- **`views/analysis/EvidenceTab.tsx`**: `AnalysisEvidence` and the four panels.
- **`AnalysisView`** renders the tab. **`frame.ts`** no longer lists Evidence as pending, and the
  rail's Base Rates opens it.

## How it was checked

### Tests (written, not run)

- `ui/charts/chartOptions.test.ts` (2): the trailing average with a gap and an empty window; one
  line per series on a time axis, in the theme's colors.
- `intel/analyticsApi.test.ts` (3):
  - the findings query (situation, `status=open`, limit 500), and the impacts and series queries;
  - the series-data window;
  - the dismissal: method, body and merge-patch media type.
- `intel/findingsView.test.ts` (9):
  - evidence groups; member rows (order, confidence, ref, time, tags); items without notes;
  - finding tones, percents, the matching rate;
  - metric tabs (order, the four-line cap, "other"), series names, stat tiles with and without a
    prior window.
- `intel/useEvidence.test.ts` (2): a situation's scope; an investigation's pinned findings,
  de-duplicated.
- `views/analysis/EvidenceTab.test.tsx` (7). The chart is mocked, since jsdom has no canvas.
  - **Metrics:** the families in the situation's order, the chart's two series and its label, the
    tiles, and switching to Outage.
  - **Evidence:** rows by type and confidence; Reports and the empty Imagery.
  - **Findings:** the base rate and the `situationId` query; the detail; a dismissal with its
    reason, after which the finding is gone.
  - **No dismissal** without the envelope's action.
  - **Impacts:** probability, interval, n, the rate and the labels; the region and since query.
  - **A failure:** a 503 on findings shows its message, and the other panels still fill.
  - **An investigation:** its items, and no series or findings requests.
- `views/analysis/AnalysisView.test.tsx`: the pending-tab case now opens Hypotheses (021), since
  Evidence is no longer pending.
- `e2e/findings-analytics.e2e.ts` (1), with stand-in situation and analytics reads:
  - the Evidence tab opens;
  - the metrics chart draws an ECharts canvas 200 px tall, with two series, then one on Outage;
  - the tiles' delta, the Reports evidence, and the impact's base rate;
  - a finding's detail is opened and dismissed, with the PATCH body recorded;
  - no console errors.

### Checks

| Check                                                       | Result                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                                         | Passed                                                                                                       |
| `npm run lint`                                              | Passed                                                                                                       |
| `npx prettier --check src e2e`                              | Passed                                                                                                       |
| `npm run build`                                             | Passed. `EChartCanvas` chunk 558.43 kB (187.84 kB gzip); `index` 649.09 kB (200.35 kB gzip)                  |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                                                                                  |
| Guard: `test_us_english.py`                                 | 14 tests OK                                                                                                  |
| Guard: `check_us_english.py` over the project               | 797 hits: the 796 baseline plus one wire string (below)                                                      |
| Guard: `check_us_english.py` over the new and changed files | One hit: `analyticsFixtures.ts:88`, the backend's impact label, quoted as the OpenAPI gives it. Not changed. |

The one new hit is the label the OpenAPI says every projected impact carries ("Always includes …").
It is a value the backend sends, so the fixture keeps it verbatim. My own comment that first
paraphrased it was reworded.

## Compared to the mock

Compared by reading the Conflict mock's CONFLICT METRICS and EVIDENCE against the components; no
screenshot was taken.

- **Matches:**
  - a tabbed metrics card with a line chart of 7-day averages, the colors in the mock's order and
    the legend under the chart;
  - the row of stat tiles: a big number, the label, and the change against the prior 30 days;
  - the evidence card's All, Imagery, Signals, Reports and Docs tabs; rows with an icon, title,
    source and family tags and a confidence tag; "View all evidence".
- **Differs:**
  - **The metric tabs** are the series' signal families, not Military, Strikes, Casualties,
    Economic and Humanitarian. The backend groups series by family and has no such fixed set.
  - **The evidence rows** carry a type icon, not an image thumbnail. Members and items carry no
    image URL.
  - **Findings and Projected Impacts** are cards the mock does not draw. The prompt asks for them.
  - **Metrics** sit in the Evidence tab, not on Full Analysis. That layout is 023's.

## Decisions taken (unattended run)

1. **Metric tabs are signal families**, the situation's own `signalFamilies` first, then the rest
   alphabetically. Each tab has at most four lines.
2. **Stat tiles end at the series' latest point**, not at the wall clock, because series publish
   late. The tile shows the total over 30 days and the change in whole percent from the 30 days
   before. It shows no change when the earlier window is empty.
3. **The chart window** is the last 90 days, drawn as 7-day trailing averages.
4. **Series names:** a `rollup:` ref is named by its kind segment, any other ref by its last part.
   Otherwise every activity rollup would be named by its region.
5. **The findings scope.** A situation's are those linked to it (`situationId`). An investigation's
   are those its items pin. Only open findings are listed.
6. **Impacts** are read for at most four of the situation's regions, since it started, highest
   probability first. An impact's rate matches by hazard class, impact family and region class.
7. **Dismissal** is offered only when the finding's own envelope (`finding:<id>`) lists a `PATCH`
   on `/analytics/findings/…`. It needs a reason. A dismissed finding leaves the list at once.
8. **Evidence confidence** comes from a member's corroboration: High when corroborated, Low when
   not, Medium when unknown. Investigation items have none.
9. **Evidence groups.** Imagery holds the imagery category's kinds. Docs holds the written kinds:
   news, bulletins, filings, posts, advisories and dataset releases. Reports holds derived objects
   (events, findings, alerts). Signals holds every other record.

## Deviations from the prompt text

- **"Filterable by the situation / viewport":** findings are filtered by the situation, but not by
  the viewport. `listFindings` takes a situation and region codes, but no box (owner question 1).
- **"Playwright: metrics tab renders charts":** written as `e2e/findings-analytics.e2e.ts`, not
  run (standing rule). It uses stand-in data, because the local backend's series are empty.
- **`getProjectedImpact`** is not called. The list carries every field the panel shows.

## Backend observations

- **The local analytics are empty.** In this session, via curl through the dev proxy:
  - `GET /v1/analytics/findings`, `/impacts` and `/series` (also with `enabled=true`): 200, 0
    items;
  - `GET /v1/analytics/impact-rates`: rates such as `tropical-wind-34` / `outage` /
    `continent:AF`, with `n: 0`, `rate: null`, `interval: null`.
- **`listFindings` has no bounding-box parameter.** It filters by region code and situation only.

## Owner questions

1. **Viewport findings.** Should findings be filterable by the map viewport? That would need a
   `bbox` on `listFindings`, or a client-side filter on each finding's geometry. **Default in
   place: filtered by situation (or pinned by an investigation).**
2. **Metric tabs.** Should the Metrics panel keep the mock's fixed tabs (Military, Strikes,
   Casualties, Economic, Humanitarian), mapped from signal families? **Default in place: one tab
   per family the series carry.**
3. **Dismissal action.** What is the id of the dismiss action on a finding's envelope? **Default in
   place: matched by method and href.**
4. **Evidence thumbnails.** Is there an image for a member or item to show as the mock's
   thumbnail? **Default in place: an icon for the evidence type.**

Questions still open from earlier reports keep their defaults.
