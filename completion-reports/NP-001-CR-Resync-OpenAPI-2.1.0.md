# NP-001 — Completion Report: Resync To OpenAPI 2.1.0

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete) |
| Implementation commit | `0f598bdb848749852bbeb634f3ea49f3b382e54a`                                                                               |
| Run mode              | Unattended batch (NP-000 run sequence): no review-gate pause; continuing to NP-002.      |
| Screenshots           | None (compile-only; no screen changed).                                                  |
| Mock comparison       | Not applicable: spec vendoring and a version string. No `design/` mockup is affected.    |

## Prerequisite (hard stop) — met

`../foresignal/docs/OpenAPI.json` `info.version` reads **`2.1.0`** (checked this session with
`python3 -c "import json; print(json.load(open(...))['info']['version'])"`). The backend Automated
Newspaper set is merged, so this prompt proceeded rather than writing `RUN-STATUS.md` and aborting.

## The real delta (verified this session, 2.0.0 → 2.1.0)

Every figure is from a command run this session comparing the git-`HEAD` vendored 2.0.0 spec against
the backend's `../foresignal/docs/OpenAPI.json` (2.1.0); nothing is quoted from the prompt.

- **Counts.** 706 → 711 paths (**5 added, 0 removed**); 1196 → 1205 schemas (**9 added, 0 removed**).
  Command: `python3` over both files' `paths` / `components.schemas` key sets.
- **Byte-for-byte vendoring.** `cmp` exits 0; `md5sum` of source and vendored copy are identical
  (`c3d7c11922ee8e2e0787e6d1a501125f`).
- **Added paths (5), all newspaper surface:** `/v1/me/editions`, `/v1/me/news-subscriptions`,
  `/v1/editions/{briefingId}/site`, `/v1/k/{key}/site`, `/v1/settings/translation`.
- **Added schemas (9):** `EditionSummary`, `EditionSite`, `NewsSubscription`,
  `NewsSubscriptionUpdate`, `NewsSubscriptionView`, `TranslationSettings`,
  `TranslationSettingsInput`, `BreakingNewsConfig`, `DeliveryTarget`.
- **7 existing schemas changed, every change additive** (new **optional** props; no removals, no new
  `required`, no type narrowing). Verified field-by-field this session:
  - `AskCitation`: +`corroboration`, +`provenance`.
  - `BriefingInput`: +`breakingNews`, +`deliveryTargets`, +`includeCorroboration`,
    +`includeProvenance`, +`outputLanguage`, +`site`.
  - `BriefingRun`: +`breaking`, +`deliveryResults`.
  - `NewsArticle`, `NewsStory`: +`targetLanguage`, +`translatedTitle`, +`translatedExcerpt`,
    +`translationProvenance`.
  - `ShareLink.targetType`: enum **widened** (added `"edition-site"` to the existing 8 members; no
    member removed). A widened union only adds an assignable value, so it breaks nothing the client
    does today (the clean typecheck below proves no exhaustive-`never` switch over `targetType`
    regressed).
  - `Briefing`: changed JSON but identical property/required sets (a description/metadata tweak);
    no surface effect.

## No shims needed (unlike R2-001)

The 2.0.0 → 2.1.0 delta is **purely additive**, so a clean `npm run generate` left **zero** `tsc`
errors — no behavior-preserving shim was required. (R2-001 needed two shims because 2.0.0 flipped
`Relation.type` to `x-extensible-enum` and widened the calibration response to a `oneOf`; nothing
comparable happens in 2.1.0.) No generated code was hand-edited; no new behavior was introduced.

## Version plumbing

- `openapi/VERSION` = `2.1.0` (trailing newline kept, matching the prior file; confirmed with `xxd`).
- `SPEC_VERSION` (`src/app/session.ts:36`) reads it via `?raw` + `.trim()` → `'2.1.0'`.
- `checkVersion` (`src/state/capabilities.ts`) compares `SPEC_VERSION` to `getSystem`'s `apiVersion`;
  `VersionBanner` renders only on `version.mismatch`. With the live backend on 2.1.0 the two match
  (`2.1.0 ↔ 2.1.0`), so no banner shows. Verified by the code path and the happy-path App test; not
  browser-verified (standing rule).

## Tests written (not run)

Only the version-pin tests were touched, bumping the client's *built-for* spec version to `2.1.0`
while leaving the deliberately-divergent backend-reported values intact:

- **`src/app/App.test.tsx`:** happy-path backend default (`backend(apiVersion = '2.1.0')`), the
  displayed `backend-version` (`'2.1.0'`), and the mismatch copy (`built for API version 2.1.0, but
  the backend reports 9.9.9`). The `9.9.9` backend value is left as the deliberate mismatch.
- **`src/state/capabilities.test.ts`:** the `checkVersion` built-for value and the happy-path match
  → `2.1.0`; the mismatch tests keep genuine divergence by having the backend report the older
  `1.1.0` / `1.0.0` against a built-for `2.1.0`.
- **`src/api/testing/fixtures.ts`:** `systemInfo`'s default `apiVersion` and `version` → `2.1.0`
  (both were set together in R2-001; same treatment here).

Every unrelated `2.0.0` was left untouched. The only remaining `2.0.0` strings in `src/` (excluding
the generated file) are the historical comments in the R2-001 shims
(`graphApi.ts`, `graphView.ts`, `forecastApi.ts`, `ForecastsTab.tsx`) describing the 2.0.0 delta —
correct history, not version pins.

## Checks

| Check                                                  | Result                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `npm run generate`                                     | Clean (openapi-typescript 7.13.0, ~2 s)                                                 |
| `npm run typecheck`                                    | Passed (0 errors; no shim required)                                                     |
| `npm run lint`                                         | Passed                                                                                  |
| `npx prettier --check` (VERSION + 3 touched tests)     | "All matched files use Prettier code style!"                                            |
| `npm run build`                                        | Passed. Pre-existing >500 kB chunk warning only (unchanged)                             |
| `npm test`, `npm run e2e`, browser run                 | **Not run** (standing rule)                                                             |
| US English scan of touched files                       | 2 hits, both `licence` at `App.test.tsx:214,219` — the `Attribution.licence` **wire key**, pre-existing (not in this diff), left verbatim per the "never correct a wire key" rule |

## Owner questions

1. **Newspaper surface is vendored but not yet consumed.** The 5 new paths and 9 new schemas now
   exist in the typed surface; NP-002 is the first consumer (`listMyEditions`,
   `getLatestBriefingRun`, `getEditionSite`, `getBriefingPodcast`). `/v1/k/{key}/site`,
   `/v1/me/news-subscriptions` and `/v1/settings/translation` are **not** in NP-002's scope — flag if
   a later prompt should surface the public feed-key site, subscription management, or the
   translation setting beyond the existing R2-007 preferences.
2. **R2-001's two shims remain inert and untouched.** The `Relation.type` / calibration `oneOf`
   narrowings are unaffected by 2.1.0. No action unless a later prompt revisits the graph or
   calibration surface.

Open questions from earlier reports keep their defaults.
