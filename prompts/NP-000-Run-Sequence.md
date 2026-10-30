# NP-000 — Automated Newspaper client run sequence (API 2.1.0)

> **Index only — not an executable prompt** (skipped like `000`). It drives the **client** side of the
> Automated Newspaper feature (`NP-001`…`NP-002`) at API **2.1.0** — surfacing a user's edition in the
> presentation app. Separate from the finished R2 (RBAC) campaign (`R2-001`…`R2-011`).

Run as usual: **one** Claude Code session at the repo root, prompts in order, pausing at a review gate;
the owner never runs a command. `openapi/OpenAPI.json` (vendored from the backend) is the only
backend reference.

## Prerequisite (hard dependency)

This campaign vendors and builds on the backend's **2.1.0** spec, produced by the **backend**
Automated Newspaper campaign (`foresignal` `NP-001`…`NP-007`). **Do not start until that backend
campaign is merged.** As a safety net, `NP-001` itself **hard-stops** if
`../foresignal/docs/OpenAPI.json` is not yet `2.1.0`, so starting this run early self-aborts cleanly
rather than vendoring a stale spec.

## The prompts

| # | Title | What it does |
|---|---|---|
| NP-001 | Resync to OpenAPI 2.1.0 | Re-vendor the 2.1.0 spec, regenerate types, compile clean (hard-stops if backend not 2.1.0) |
| NP-002 | Edition view & player | A signed-in user reads the written edition, plays the spoken one, sees provenance/corroboration badges, copies a share link |

## Standing rules (same as the R2 client campaign)

- **OpenAPI is the only backend reference;** `NP-001` re-vendors `../foresignal/docs/OpenAPI.json`
  (2.1.0); `src/api/generated/schema.ts` is generated, never hand-edited.
- **Two runtime components, no third;** presentation only — the engine/scheduling/translation/delivery
  live in the backend.
- **Compile-only gate, every prompt:** `npm run generate` (if the surface moved), then
  `npm run typecheck`, `npm run lint`, `npm run build`. **No `npm test`, no `npm run e2e`, no browser
  run** — tests are written, not run.
- **US English;** wire keys left verbatim.
- **Review gate after each prompt;** commit `NP-00N: <Title>`, write
  `completion-reports/NP-00N-CR-<Name>.md` (hash + owner questions), pause.
