# R2-010 — Intel Calibration And Corroboration

**Goal.** Surface the backend's intel-quality signals in the analyst views — forecast calibration
and corroboration — as read-only context that tells an analyst how much to trust what they see.

**Read first.** R2-006-CR; 022-CR (Forecasts) and 023-CR (Assessments).
Backend contract: `openapi/OpenAPI.json`.

**Backend (OpenAPI only).**
- `GET /v1/intel/calibration` [`getIntelCalibration`] — the calibration overview.
- `GET /v1/intel/calibration/{scope}` [`getIntelCalibrationScope`] → `IntelCalibration`
  (`ForecastNumericCalibration`) — calibration for one scope.
- `GET /v1/intel/corroboration` [`getIntelCorroboration`] → `IntelCorroboration`.
- `GET /v1/forecasts/calibration` [`getForecastCalibration`] →
  `ForecastCalibration | ForecastNumericCalibration` — already consumed by the forecasts view
  (prompt 022); R2-001 narrowed it to the probability member to compile. Discriminate the union
  here, since this prompt introduces `ForecastNumericCalibration` (the same schema the intel scope
  calibration returns).
- The intel endpoints are read-only here and gated `intel.read`. **Not**
  `PUT /v1/intel/corroboration` [`updateIntelCorroboration`] — that is `system.settings`, an
  operator setting in `foresignal-admin`, out of scope for this client.

**Build.**
- A calibration panel in the forecasts/assessment views: reliability by scope from
  `getIntelCalibration`/`getIntelCalibrationScope`, shown alongside the forecasts it qualifies.
- A corroboration display where evidence is presented (`getIntelCorroboration`), read-only.
- Replace R2-001's narrow shim in `src/intel/forecastApi.ts`: have `getForecastCalibration` return
  and discriminate `ForecastCalibration | ForecastNumericCalibration`, and update the forecasts view
  (prompt 022) to render whichever variant it gets. Model `ForecastNumericCalibration` once and
  reuse it for the intel scope calibration above.
- Gate the intel calibration/corroboration on `intel.read`; hide cleanly for a principal without it.

**Done when.** Calibration and corroboration render in the analyst views from the real
operationIds, read-only, gated on `intel.read`. Compile-only; tests written not run.

**Commit.** `R2-010: Intel Calibration And Corroboration`;
`completion-reports/R2-010-CR-Intel-Calibration-And-Corroboration.md` (hash + owner questions).
