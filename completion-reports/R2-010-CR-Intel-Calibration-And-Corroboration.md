# R2-010 — Completion Report: Intel Calibration And Corroboration

| Field                 | Value                                                     |
| --------------------- | --------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule).         |
| Implementation commit | `c75798c`                                                 |
| Run mode              | Unattended batch (no pause at this gate).                 |
| Screenshots           | None (compile-only run).                                  |
| Mock comparison       | Not made visually; panels on the existing analyst cards.  |

## What was built

Read-only intel-quality context in the analyst views, gated on `intel.read`.

- **Calibration union resolved (`src/intel/forecastApi.ts`).** R2-001's narrowing cast is gone.
  `getForecastCalibration` now returns `ForecastCalibration | ForecastNumericCalibration`;
  `ForecastNumericCalibration` is modeled here once and `isNumericCalibration(result)` discriminates
  it (`type: "numeric"`). The forecasts ledger renders the reliability diagram for the probability
  variant and a **quantile-reliability table** (nominal vs empirical coverage, PIT sample size) for
  the numeric one.
- **Shared reliability helpers (`src/intel/forecastsView.ts`).** `reliabilityBins` /
  `calibrationCurve` now take a structural `ReliabilityData` (the 10-bin table + PAV curve), so the
  intel scope calibration reuses the same chart path — the "model once and reuse" the prompt asks
  for, applied to the reliability diagram the two share.
- **Intel API (`src/intel/intelApi.ts`).** `getIntelCalibration` (overview → `scopes[]`),
  `getIntelCalibrationScope`, `getIntelCorroboration`. The operator `PUT /v1/intel/corroboration`
  (`system.settings`, foresignal-admin) is deliberately **not** wired.
- **Panels.** `IntelCalibrationPanel` — per scope: calibrated/warming-up, sample N vs min, Brier,
  and the reliability diagram when there are resolved outcomes; mounted in the forecasts ledger.
  `IntelCorroborationPanel` — the corroboration policy's gates (event quality, situation activation,
  auto-corroborate), read-only; mounted in the assessment view where evidence is shown. Both call
  `useCan('intel.read')` and render `null` without it, so they hide cleanly.

## Contract vs. prompt (followed the contract)

The prompt describes `getIntelCalibrationScope` as returning `ForecastNumericCalibration`. The
contract's 200 for both `/v1/intel/calibration/{scope}` and the overview is **`IntelCalibration`**
(scope, calibrated, sampleN/minSamples, Brier, reliability bins and PAV curve) — a probability-style
reliability object, not the numeric quantile/PIT one. I followed the contract: the intel panels use
`IntelCalibration`, and `ForecastNumericCalibration` is modeled once for the forecasts numeric
variant (which is where the contract actually returns it). Owner question 1.

## Tests written (not run)

- **`src/intel/intelApi.test.ts`** — `isNumericCalibration` discriminates both variants; the overview
  reads as a scopes array; one scope reads by path; the corroboration policy reads.
- **`src/intel/IntelCalibrationPanel.test.tsx`** — renders each scope for an `intel.read` principal
  (EChart stubbed, as the forecasts tab's own test does); hidden without the permission.
- **`src/intel/IntelCorroborationPanel.test.tsx`** — renders the three gate groups for `intel.read`;
  hidden without it.
- Existing `forecastApi.test.ts` / `ForecastsTab.test.tsx` keep compiling against the widened union
  (the probability branch renders the same `calibration-chart` / `calibration-insufficient`
  surfaces).

## Checks

| Check                                                   | Result                              |
| ------------------------------------------------------- | ----------------------------------- |
| `npm run typecheck`                                     | Passed                              |
| `npm run lint`                                          | Passed                              |
| `npm run build`                                         | Passed (pre-existing chunk warning) |
| `npm test`, `npm run e2e`, browser run                  | **Not run** (standing rule)         |
| Guard: `check_us_english.py` over the new/changed files | 0 British spellings                 |

(`npm run generate` not needed: surface generated at 2.0.0 in R2-001.)

## Decisions taken (unattended)

1. **Followed the contract over the prompt** on the intel scope calibration type (owner question 1).
2. **Numeric calibration shown as a table**, not a new chart — honest read-only context (quantile
   coverage + PIT n) without inventing a chart that can't be verified in a compile-only run.
3. **Panels self-gate** on `intel.read` and return `null`, rather than gating at each call site, so
   mounting them anywhere is safe.
4. **Calibration in the forecasts ledger, corroboration in the assessment view** — matching "where
   evidence is presented" for the policy and the forecasts quality surface for calibration.

## Owner questions

1. **Intel scope calibration type.** The contract returns `IntelCalibration` (reliability bins +
   Brier) for the intel scopes; the prompt said `ForecastNumericCalibration`. I rendered
   `IntelCalibration`. Confirm that is right, or point me at the numeric scope endpoint if one is
   intended.
2. **Placement.** Calibration sits in the forecasts ledger and corroboration in the assessment tab.
   Should either also appear elsewhere (e.g. calibration beside each situation's forecasts)?

Questions carried from R2-001–R2-009 keep their defaults.
