# 000 — Run Sequence (attended driver with review gates)

> Give this file to a Claude Code session at the repository root
> (`~/Documents/GitLab/foresignal-client`) to run the roadmap. **Default mode is attended: run one
> prompt, then stop at its review gate so the owner can look before the next.** Unattended batch
> running is opt-in and only for an owner-named range of later, non-visual prompts.
> The backend is the sibling repo `~/Documents/GitLab/foresignal`; its `docs/OpenAPI.json` is the
> **only** reference for how the client talks to the backend.

## How to run

1. **Pull:** `git pull --ff-only origin main`.
   - **Owner stop:** if `completion-reports/RUN-STATUS.md` exists, stop without changing anything.
   - **Planner changes first:** if `git status` shows uncommitted changes **only** under `docs/`,
     `prompts/`, `design/` or `openapi/`, they are planner updates — stage them, commit as
     `Planner: update roadmap and prompts`, push, then continue.
   - If there are uncommitted changes anywhere else, stop and write `RUN-STATUS.md` (a previous run
     was interrupted mid-prompt).
2. **Find the next prompt.** List `prompts/NNN-*.md` (skip `000`). The next prompt is the
   lowest-numbered one with **no** matching `completion-reports/NNN-CR-*.md`.
3. **Check the previous report.** If it says `Status | Blocked` or raises an owner question that
   needs an answer, stop.
4. **Execute the prompt completely, exactly as written:**
   - read its *Read first* section and the earlier completion reports;
   - implement it, matching the relevant `design/` mockup;
   - write its tests (Vitest; UI-visible behavior proven from outside the component);
   - `npm run generate` if the prompt touched the API surface, then
     `npm run typecheck`, `npm run lint`, `npm run build`, and the relevant `npm test`;
   - **capture the look:** run the app (`npm run dev` / `vite preview`), screenshot the new UI to
     `review/NNN-<name>.png`, and confirm it against the relevant `design/` mockup;
   - commit the implementation **and the screenshot** as `NNN: <Title>`;
   - write `completion-reports/NNN-CR-<Name>.md` (same format as earlier reports) with the
     40-character implementation commit hash, a line on how the result compares to the mockup, and
     any **owner questions** (things the OpenAPI did not express — never invented, never worked
     around with a second service);
   - commit the report as `NNN: completion report`; push to `origin main`.
5. **Stop at the review gate (default).** Unless the owner has waived gates for this range, **stop
   after the prompt** and tell the owner what to look at: run `npm run dev` or open
   `review/NNN-<name>.png`. Do **not** start the next prompt until the owner approves (they remove
   `completion-reports/REVIEW-REQUIRED.md`, or say continue). Write a one-line
   `completion-reports/REVIEW-REQUIRED.md` naming the prompt and its screenshot.
6. **Guardrails every time:** OpenAPI is the only backend reference; two components only
   (no backend change, no BFF/Node/proxy, no native wrapper); US English; dense layers rendered
   batched over server-aggregated, viewport-scoped data; generated code never hand-edited; every
   prompt leaves the app runnable with a committed screenshot.

## Review gates and unattended mode

- **Attended (default):** stop after every prompt (step 5); the owner looks, then approves the next.
- **Unattended range (opt-in):** only when the owner says, in that message, "run prompts X–Y without
  stopping" — then skip the per-prompt gate for that range, still capture each screenshot, and stop
  at the end of the range (and on any failure).
- `REVIEW-REQUIRED.md` present means a prompt is awaiting the owner's look — do not proceed.

## Stop conditions

- `RUN-STATUS.md` or `REVIEW-REQUIRED.md` exists, or the previous report is `Blocked`, or a prompt
  needs an owner decision.
- `npm run typecheck`/`build`/`lint` cannot be made to pass.
- Two sessions in a row make no commits.

Write what stopped you into `completion-reports/RUN-STATUS.md` and stop cleanly.
