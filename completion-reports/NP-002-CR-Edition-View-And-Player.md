# NP-002 — Completion Report: Edition View And Player

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete) |
| Implementation commit | `e9617a6ba196e02bdbcecac11b1c534e40bbec11`                                                                               |
| Run mode              | Unattended batch (NP-000 run sequence): no review-gate pause; end of the campaign.       |
| Screenshots           | None taken — `npm test`/browser run are off by standing rule, so no real-device proof was produced. See "Not proven from outside" below. |
| Mock comparison       | No `design/` mockup covers editions (the six PNGs are map/analysis/dashboard screens), so the view matches the existing account-area chrome instead. |

## What was built

A new **Editions** area — the signed-in user's automated newspaper — presentation only. All
composition, scheduling, translation and delivery stay in the backend; this surfaces the result.

- **Route + nav.** `routes.ts` gains an `Editions` tab (lucide `Newspaper`) between Intelligence and
  Alerts; `App.tsx` adds `/editions` (list) and `/editions/:briefingId` (reader).
- **API module `src/editions/editionsApi.ts`** over the four NP ops:
  - `listMyEditions` → `GET /v1/me/editions` (`{ items: EditionSummary[]; nextCursor }`).
  - `getLatestBriefingRun` → `GET /v1/briefings/{briefingId}/runs/latest?format=json`.
  - `getEditionSite` → `GET /v1/editions/{briefingId}/site?format=json`.
  - `getBriefingPodcast` → `GET /v1/briefings/{briefingId}/podcast.rss` (parsed as text).
  - Helpers: `latestEnclosure(rss)` parses the feed for the newest `<enclosure>` (feeds are
    newest-first), and `shareUrlOf(site)` prefers the revocable `shareUrl`, else the canonical
    `url`, else `null`.
- **List view (`EditionsView.tsx`).** Each edition shows its name, a paused/language/last-run-status
  badge row, the last-edition time and schedule, and links to its reader. Empty and loading states;
  links out to `/account` (output language, R2-007) and `/account/sources` (R2-009) rather than
  re-implementing config.
- **Reader (`EditionView.tsx`).**
  - **Written edition:** the run's `contentMarkdown` through the existing `Markdown` component (which
    never injects HTML), with the period range and a **Breaking** badge when `run.breaking` is set.
    (The spec also offers `?format=html`; the client renders the Markdown with its own chrome
    instead, as the prompt licenses — "render the sanitized HTML … **or** the JSON sections — match
    the `design/` chrome".)
  - **Spoken edition:** an `<audio controls>` pointed at the latest podcast enclosure; omitted
    cleanly when the feed has no audio or does not load.
  - **Badges:** a "Why this is in my paper" section over the run's `citations`. Each item shows its
    corroboration badge (`evidenceQuality` tone + independent-source count + reliability/credibility)
    and its provenance ("why included" reason + count of cross-linked evidence). Each badge is shown
    only when the citation carries it; the whole section is omitted when there are no citations.
  - **Share:** a read-only field with the share URL (`shareUrlOf`) and a **Copy link** button that
    writes to the clipboard and toasts; omitted when hosting is off (no URL).
- **Gating.** Both views gate on `useMe()` (signed-in), matching R2-006's pattern. There is **no**
  `self.editions` permission in `END_USER_PERMISSIONS`, and none was invented; editions are per-user
  (self), so being signed in is the gate. Anonymous visitors get a sign-in affordance, not a dead
  end.

## Contract facts (verified this session against the vendored 2.1.0 spec)

- `GET /v1/me/editions`: `{ items: EditionSummary[]; nextCursor: string|null }`; `cursor`/`limit`
  query. `EditionSummary` required: `briefingId, name, enabled, schedule, timezone`.
- `GET /v1/briefings/{briefingId}/runs/latest`: 200 is `oneOf [BriefingRun (json), string (html)]`
  by content type, so `openapi-typescript` types the body `string | BriefingRun`. Requesting
  `format: 'json'` always returns the JSON member; narrowed with a documented `as BriefingRun`.
  Same shape (`string | EditionSite`) for `getEditionSite`, narrowed the same way. These are the
  only two narrowings added, both for the dual-content-type 200 — no behavior invented.
- `GET /v1/briefings/{briefingId}/podcast.rss`: 200 is `application/rss+xml` (a string); fetched with
  `parseAs: 'text'` and parsed with `DOMParser`.
- `AskCitation` (2.1.0) carries optional `provenance { refs: ObjectRef[]; reason? }` and
  `corroboration { evidenceQuality; independentSources; reliability?; credibility? }` — both present
  only for a briefing run with `includeProvenance` / `includeCorroboration` (backend NP-007), absent
  elsewhere, which is why the UI omits each cleanly.

## Tests written (not run)

- **`editionsApi.test.ts`** — `latestEnclosure` (newest-first pick; null for empty / no-enclosure /
  malformed XML), `shareUrlOf` (share-link preference, canonical fallback, null), and
  `listMyEditions` over the mock backend.
- **`EditionsView.test.tsx`** — signed-in list with a link to each reader; empty state; anonymous
  sign-in affordance.
- **`EditionView.test.tsx`** — signed-in reader: Markdown body, audio player `src` = latest
  enclosure, provenance + corroboration badges, share link value; badges omitted when no citations;
  anonymous sign-in affordance.
- **`App.test.tsx`** — the "routes every primary tab" guard gains `Editions: 'Editions'`, so the new
  nav tab's routing is covered alongside the others (the heading is `Editions` in both auth states).

## Checks

| Check                                                  | Result                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| `npm run generate`                                     | Not re-run (the surface did not move this prompt; NP-001 generated it) |
| `npm run typecheck`                                    | Passed (0 errors)                                                   |
| `npm run lint`                                         | Passed                                                              |
| `npx prettier --check` (new + touched files)           | "All matched files use Prettier code style!"                        |
| `npm run build`                                        | Passed (2946 modules; pre-existing >500 kB chunk warning only)      |
| `npm test`, `npm run e2e`, browser run                 | **Not run** (standing rule)                                         |
| US English scan of `src/editions/` + `routes.ts`       | Clean                                                               |

## Not proven from outside

The standing rule asks that a user-visible change be proven from outside the code — a screenshot, a
pixel read, or a real tap. This campaign's compile-only gate turns `npm test`, `npm run e2e` and the
browser run off, so **none of that was produced here**: the edition reader, the audio player and the
badge rendering are verified only by the written tests (which were not executed) and by the
type/lint/build gates. A real-device pass (edition list → reader → play audio → copy share link, and
the anonymous sign-in path) remains to be run when the campaign's test freeze lifts.

## Owner questions

1. **Reader uses the JSON/Markdown path, not `?format=html`.** The prompt allowed either; Markdown
   was chosen so the app chrome and the per-item badges are under client control and no server HTML
   is injected. Flag if you want the backend-rendered HTML page embedded instead.
2. **Provenance refs are shown as a count + reason, not as clickable object links.** Opening a
   cross-linked `ObjectRef` (via `useOpenObject`) would deep-link into the intel views; it was left
   out to keep NP-002 presentation-only and avoid wiring the reader into the object-open plumbing.
   Flag if the evidence refs should be openable.
3. **Out-of-scope 2.1.0 surface left unconsumed:** `/v1/k/{key}/site` (public feed-key site),
   `/v1/me/news-subscriptions`, and `/v1/settings/translation`. Not in NP-002's op list; no UI added.
4. **Editions is a top-level nav tab,** visible to anonymous visitors (who get a sign-in prompt), per
   "show a sign-in prompt … rather than a dead end." If it should instead live under `/account`
   (self area) and be hidden from the primary nav, say so.
5. **No real-device proof** (see above) — the standing test freeze blocked it.

Open questions from earlier reports keep their defaults.
