# Testing

| Command                             | What it runs                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `npm test`                          | Vitest: the unit and component tests (`*.test.ts`, `*.test.tsx`)                  |
| `npm run e2e`                       | Playwright: the end-to-end checks (`e2e/*.e2e.ts`) against the dev server         |
| `E2E_GPU=1 npm run e2e -- scale`    | The scale check on the machine's GPU, for frame timing (software WebGL otherwise) |
| `npm run typecheck`, `npm run lint` | TypeScript and ESLint                                                             |

The end-to-end checks need the backend running at `http://localhost:8080`; the dev server proxies
`/v1` to it (`playwright.config.ts`).

## Known environmental failures

On 2026-10-21 a full `npm run e2e` run left **7 checks failing that pass when run alone.** They are
environmental, not defects in the client:

- **The anonymous rate limit.** The local backend answers anonymous callers with 429 and
  `Retry-After` under load. The client tries a GET or HEAD up to three times in all, waiting out
  the `Retry-After` (`src/api/retry.ts`); specs run back to back can still exhaust that.
- **Four open streams per caller.** The backend allows 4 open event streams per caller. A page holds
  two (events and alerts), and a closed stream counts until the backend notices it, so one spec's
  streams can still hold slots when the next spec opens its own.

Each of them passes when run alone. **A read token clears both limits.** Without one, rerun the
failures with `npx playwright test --last-failed`.

## Frame budget at world zoom

The budget is 30 fps at the 95th percentile (`SLOW_FRAME_MS`, `src/map/stress/frameStats.ts`).
The scale check (`e2e/scale.e2e.ts`) holds it only under `E2E_GPU=1`. On 2026-10-21, on an AMD
Radeon 780M, the world view panned at 32 fps with a p95 of 53.6 ms, so that check fails on that
one problem. The owner accepted this on 2026-10-21 as the worst case, measured with stand-in data
that does not aggregate. No code change is made to meet the budget.

Below a layer's `aggBelowZoom` the client draws hexagon cells instead of records; at world zoom
this was checked against the backend's own value. On the local backend only aircraft declares
`aggBelowZoom` (7); the other kinds declare none and draw records at every zoom.
`completion-reports/035-CR-Scale-And-Performance.md` has the numbers and the check.
