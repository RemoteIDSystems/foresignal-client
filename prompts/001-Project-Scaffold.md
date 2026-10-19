# 001 — Project Scaffold

**Goal.** Stand up the Vite + React 19 + TypeScript application skeleton with tooling, the `src/`
layout from the Architecture, and the vendored inputs (the backend OpenAPI spec and the design
mockups).

**Read first.** [Product-Charter.md](../docs/Product-Charter.md),
[Architecture.md](../docs/Architecture.md) §2–3, §16. No backend calls in this prompt.

**Build.**
- Initialize a Vite React-TS app. Pin **React 19**, **TypeScript 5**, **Vite 6+**.
- Tooling: ESLint + Prettier, Vitest + @testing-library/react. Scripts in `package.json`:
  `dev`, `build`, `preview`, `typecheck` (`tsc --noEmit`), `lint`, `format`, `test`,
  and `generate` (placeholder for 002).
- Create the `src/` tree with index placeholders: `app/`, `api/`, `state/`, `map/`, `panels/`,
  `views/`, `ui/`, `lib/`.
- **Vendor the contract:** copy `~/Documents/GitLab/foresignal/docs/OpenAPI.json` →
  `openapi/OpenAPI.json`, and record its `info.version` in `openapi/VERSION`.
- **Vendor the designs:** copy `~/Documents/GitLab/foresignal/client screen ideas/*.png` →
  `design/`, with the design README.
- Config module `src/lib/config.ts` reading `VITE_FORESIGNAL_BASE_URL` (default `/`).
- `index.html` + a minimal `app/` that renders "ForeSignal Client".
- `.gitignore` (node_modules, dist), a real `README.md` (what this is, how to run, two-component
  rule, OpenAPI-only rule).

**Done when.** `npm run dev` serves a page; `npm run typecheck`, `npm run lint`, `npm run build`
all pass; `design/` and `openapi/` are populated with the version recorded.

**Commit.** `001: Project Scaffold`; write `completion-reports/001-CR-Project-Scaffold.md` with the
commit hash and the vendored OpenAPI version.
