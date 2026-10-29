# R2-000 — Client V2 Run Sequence (OpenAPI 2.0.0 uplift)

> **Index only — not an executable prompt.** The run skips this file, exactly as it skips `000`.
> It is the roadmap for the `R2-*` prompts that carry the presentation client from the backend's
> `1.0.0` contract to `2.0.0`. Read it, then run `R2-001` first.

This set is run the same way as `000-Run-Sequence.md`: **one** Claude Code session at the repository
root, prompt after prompt, pausing at a review gate after each so the owner can look and reply
"continue". The owner never runs a command. The backend is the sibling repo
`~/Documents/GitLab/foresignal`; its `docs/OpenAPI.json` (now `info.version` **2.0.0**) is the
**only** reference for how the client talks to the backend.

## Why this set exists

The backend cut over to **2.0.0** — multi-user RBAC: email/password sign-in, a shared collection
with per-user views, personal and shared LLM, MFA, and an operator control plane. The client's
vendored spec and generated types are still pinned to **1.0.0** (the Oct‑19 copy). The contract
delta is almost entirely additive: **68 paths added, 0 removed; 102 schemas added, 0 removed**; the
only breaking shared-schema change is `RuleQuality` (`labelled`/`labelledShare` → `labeled`), which
no client code reads. So the uplift is new feature work on a clean regenerate, not a rewrite.

## Scope boundary — what this client does NOT get

**The operator/admin control plane stays in `foresignal-admin`** (the Flutter app, already vendored
at 2.0.0, with `lib/features/{auth,setup,users,sources,network,storage,system,usage,ai}`). This
presentation client is "presentation only" (README). **Do not build any of these here:** user and
role management, `setup`/`first-run`, settings (SMTP, thresholds, retention, metrics, collector,
egress), backups, archives, egress routes, aggregators, collection-source management, shared LLM
providers/budget. Those endpoints exist in the 2.0.0 spec; they are out of scope for the client and
no `R2-*` prompt below touches them.

This client's V2 work is only: **identity and sign-in, RBAC-aware gating of the client's own views,
per-user self-service, and analyst data enrichments.**

## The prompts

| #       | Title                                   | What it adds (client-side only)                                             |
| ------- | --------------------------------------- | --------------------------------------------------------------------------- |
| R2-001  | Spec Resync And Version Bump            | Re-vendor 2.0.0, regenerate types, bring the version check + tests in step  |
| R2-002  | Identity, Session And getMe             | Session (`fss_`) store beside the API token; rehydrate the principal via `getMe` |
| R2-003  | Sign-In And Session Lifecycle           | Email/password login (+ MFA code), logout, anonymous fallback               |
| R2-004  | Activation And Password Recovery        | Invite activation + password reset deep-link flows                          |
| R2-005  | Multi-Factor Authentication             | TOTP enroll/verify/disable/recovery + the enrollment-required gate          |
| R2-006  | RBAC-Aware UI                           | `can(permission)` gating of client views/actions; 401/403 handling          |
| R2-007  | Account Preferences And Profile         | Profile from `getMe`; preferences (timezone/locale/theme/notifications)     |
| R2-008  | Account Sessions And Personal Tokens    | List/revoke own sessions; create/list/revoke personal API tokens            |
| R2-009  | Account My Sources, Quota And Relevance | Per-user source view over the shared collection; quota + LLM budget; relevance |
| R2-010  | Intel Calibration And Corroboration     | Read-only calibration + corroboration in the analyst views                  |
| R2-011  | Ownership Chain And Reference Areas     | Ownership chain in the graph; reference-area search + outline on the map    |

Run order is the table order: `R2-001` is the foundation every later prompt compiles against;
`R2-002` is the identity plumbing `R2-003`–`R2-011` read.

## Standing rules (unchanged from `000`)

- **OpenAPI is the only backend reference.** Every call cites an `operationId`. Behavior the spec
  does not express is an owner question — never invented, never worked around with a second service.
- **Two runtime components, no third.** No backend change, no BFF/Node/proxy, no native wrapper.
- **Generated code is never hand-edited.** `npm run generate` after any spec change.
- **Compile-only gate, every prompt:** `npm run generate` (if the surface moved), then
  `npm run typecheck`, `npm run lint`, `npm run build`. **No `npm test`, no `npm run e2e`, no browser
  run** — tests are written so they exist for the owner, but the owner runs the suite once the set is
  100% code-complete.
- **US English** everywhere, except the five never-correct cases — in particular the spec's
  British-spelled **wire keys** (e.g. `ApiToken.licencePolicy`), which cross the wire and are used
  verbatim.
- **Review gate after each prompt;** commit the implementation `R2-NNN: <Title>`, write
  `completion-reports/R2-NNN-CR-<Name>.md` (40-char hash, how it compares to the `design/` mockups,
  owner questions), commit `R2-NNN: completion report`, push `origin main`, then pause.

## Owner questions carried by this set (excluded by default — confirm before building)

- **External analysis** (`POST /v1/external/analysis/requests` [`requestAnalysis`],
  `POST /v1/external/analysis/callback` [`analysisCallback`]): reads as a backend/operator
  integration with external forecasters; `analysisCallback` is an inbound webhook and is never a
  client call. **Excluded** from the client set — confirm if an analyst-facing "request analysis"
  action is wanted.
- **Prompt templates** (`GET /v1/prompt-templates` [`listPromptTemplates`]): shared templates, a
  candidate for the client's Ask feature (prompt 017). **Excluded** pending an owner call on whether
  the client surfaces them.
