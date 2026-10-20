# 000 — Run Sequence (continuous session with review gates)

> Give this file to **one** Claude Code session at the repository root
> (`~/Documents/GitLab/foresignal-client`). That single session runs the roadmap end to end — many
> prompts in a row, as with the backend build — **pausing after each prompt at a review gate** so the
> owner can look, then continuing in the same session when the owner approves. The owner approves by
> replying in the session (e.g. "continue"); the owner never runs a command. Unattended batches
> (no pause) are opt-in for an owner-named range.
> The backend is the sibling repo `~/Documents/GitLab/foresignal`; its `docs/OpenAPI.json` is the
> **only** reference for how the client talks to the backend.

## How to run

1. **Start clean.** No `git pull` — this repo is single-machine and only the owner and this session
   write it, so planner edits are already on disk and origin never diverges.
   - **Owner stop:** if `completion-reports/RUN-STATUS.md` exists, stop without changing anything.
   - If `git status` shows uncommitted changes (a previous run was interrupted mid-prompt), stop and
     write `RUN-STATUS.md`.
2. **Find the next prompt.** List `prompts/NNN-*.md` (skip `000`). The next prompt is the
   lowest-numbered one with **no** matching `completion-reports/NNN-CR-*.md`.
3. **Check the previous report.** If it says `Status | Blocked` or raises an owner question that
   needs an answer, stop.
4. **Execute the prompt completely, exactly as written:**
   - read its *Read first* section and the earlier completion reports;
   - implement it, matching the relevant `design/` mockup;
   - **write** its tests (Vitest unit; Playwright e2e specs) so they exist for the owner's run — but
     **do NOT run them.** Standing rule: **no test execution until 100% code-complete**; the owner
     runs the full suite then. Where a prompt's *Done when* mentions Playwright or a test passing,
     write that check as a spec, don't run it;
   - `npm run generate` if the prompt touched the API surface, then **compile only**:
     `npm run typecheck`, `npm run lint`, `npm run build`. **No `npm test`, no `npm run e2e`, no
     browser or screenshot run;**
   - commit the implementation as `NNN: <Title>`;
   - write `completion-reports/NNN-CR-<Name>.md` (same format as earlier reports) with the
     40-character implementation commit hash, a line on how the result compares to the mockup, and
     any **owner questions** (things the OpenAPI did not express — never invented, never worked
     around with a second service);
   - commit the report as `NNN: completion report`; push to `origin main`.
5. **Pause at the review gate (default).** Unless the owner has waived gates for this range, after
   the prompt show the owner a one-line summary, and
   ask: *approve NNN and continue?* **Wait for the owner's reply in this same session**, then
   continue to the next prompt on approval — do not start a new session. The owner approves by
   replying (e.g. "continue", "approved") — never by running a command. Write
   `completion-reports/REVIEW-REQUIRED.md` as a crash-safe marker and **delete it yourself once the
   owner approves**. If instead this session has ended and a later one starts while that marker
   exists, re-ask the owner and proceed on their reply (deleting the marker then).
6. **Guardrails every time:** OpenAPI is the only backend reference; two components only
   (no backend change, no BFF/Node/proxy, no native wrapper); US English; dense layers rendered
   batched over server-aggregated, viewport-scoped data; generated code never hand-edited; **tests
   are written but not run**; every prompt compiles (typecheck + build) cleanly.

## Review gates and unattended mode

- **Attended (default):** one session runs prompt after prompt, pausing at each gate (step 5); the
  owner looks and replies "continue" to go on. A single session can run the whole roadmap this way.
- **Unattended range (opt-in):** only when the owner says, in that message, "run prompts X–Y without
  pausing" — then skip the per-prompt pause for that range, still capture each screenshot, and pause
  at the end of the range (and on any failure).

## Stop conditions

- `RUN-STATUS.md` exists, or the previous report is `Blocked`, or a prompt needs an owner decision
  the session cannot answer.
- The owner declines a review gate or asks to stop.
- `npm run typecheck`/`build`/`lint` cannot be made to pass.
- Two sessions in a row make no commits.

Write what stopped you into `completion-reports/RUN-STATUS.md` and stop cleanly.
