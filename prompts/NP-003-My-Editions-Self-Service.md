# NP-003 — My editions (self-service)

**Goal.** Re-vendor the **2.1.1** contract and let a signed-in user **build and manage their own
edition** in the client — create, edit, run and delete it through the new self-service
`/v1/me/editions` operations — alongside the reader built in NP-002.

**Prerequisite (hard stop).** Needs the backend at **2.1.1**. Before anything, check
`../foresignal/docs/OpenAPI.json` `info.version`: if it is not `2.1.1` (backend **NP-008** not merged),
stop and write `completion-reports/RUN-STATUS.md` recording the unmet dependency; do not vendor an
older spec.

**Read first.** NP-001-CR (the 2.1.0 vendor + its pattern), NP-002-CR (the reader), R2-006-CR (RBAC
gating). The vendored 2.1.1 `createMyEdition`/`updateMyEdition`/`deleteMyEdition`/`runMyEdition` ops,
`BriefingInput` and `self.editions`. Backend contract: `openapi/OpenAPI.json`.

**Backend (OpenAPI only).**
- `POST /v1/me/editions` [`createMyEdition`], `PUT /v1/me/editions/{briefingId}` [`updateMyEdition`],
  `DELETE /v1/me/editions/{briefingId}` [`deleteMyEdition`], `POST /v1/me/editions/{briefingId}/run`
  [`runMyEdition`] — all gated `self.editions`.
- `GET /v1/me/editions` [`listMyEditions`] — the caller's editions (from NP-002).

**Build.**
- Re-vendor `../foresignal/docs/OpenAPI.json` (2.1.1) byte-for-byte, `openapi/VERSION` → 2.1.1,
  regenerate `src/api/generated/schema.ts`. Delta is additive; narrow + record any new compile error
  rather than inventing behavior; bump the version-pin tests to 2.1.1.
- An **edition editor** in the Editions area (NP-002): create a new edition (`createMyEdition` with a
  `BriefingInput` — feed/scope, schedule, output language, sections, output targets), edit
  (`updateMyEdition`), run now (`runMyEdition`) and delete (`deleteMyEdition`). Gate on holding
  `self.editions` (R2-006 `usePermissions`); a user without it still gets the read-only reader.
- `ownerUserId` is forced to the caller by the backend — the client does not send another user's id.

**Done when.** A signed-in `self.editions` user creates, edits, runs and deletes their own edition and
sees it in the list + reader; a user without the permission keeps the read-only view;
`npm run typecheck`/`lint`/`build` pass; tests written (not run).

**Commit.** `NP-003: My Editions Self-Service`;
`completion-reports/NP-003-CR-My-Editions-Self-Service.md` (hash + owner questions).
