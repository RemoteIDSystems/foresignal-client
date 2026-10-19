# 001 — Completion Report: Project Scaffold

| Field | Value |
|---|---|
| Status | Complete |
| Implementation commit | `c47fa7b3f5992edcc39f80939a10fb5e674e97fe` |
| Vendored OpenAPI version | `1.0.0` (`info.version`; OpenAPI 3.1.0, 638 paths, 808 operations incl. 1 `options`, 1094 schemas) |
| Spec source | `~/Documents/GitLab/foresignal/docs/OpenAPI.json`, last changed in backend commit `a2314ad605b88ab80a8e6be8d593e3c3e1fd3978`; sha256 `78182ed6224e26da4b8bc138f3767658b3b72f24d25b7f91167aa70c869e8cd9`; `cmp` against the vendored copy: identical |
| Screenshot | `review/001-project-scaffold.png` |

## What was built

- Vite + React + TypeScript app, all versions pinned exactly (looked up with `npm view` on
  2026-10-19): React / React DOM 19.3.1, TypeScript 5.9.3, Vite 8.3.4, @vitejs/plugin-react 6.1.2,
  Vitest 5.0.5 + jsdom 30.1.3, Testing Library (react 16.3.3, dom 10.4.2, jest-dom 7.0.1),
  ESLint 10.13.0 + typescript-eslint 8.71.2 + react-hooks 7.1.1 + react-refresh 0.5.7,
  Prettier 3.9.10, @playwright/test 1.64.1. Node `>=22.12.0` (Vite 8's engine floor).
- Scripts: `dev`, `build`, `preview`, `typecheck` (`tsc --noEmit`), `lint`, `format`, `test`,
  `generate` (placeholder at `scripts/generate.mjs` for 002).
- `src/` tree with index placeholders: `app/`, `api/`, `state/`, `map/`, `panels/`, `views/`,
  `ui/`, `lib/`.
- `src/lib/config.ts` reads `VITE_FORESIGNAL_BASE_URL`, default `/`; tested (blank and unset fall
  back to `/`, values are trimmed).
- Minimal `app/` rendering "ForeSignal Client"; tested.
- `openapi/OpenAPI.json` + `openapi/VERSION`; `design/` holds the six mockup PNGs and the design
  README, copied as-is.
- `.gitignore`, and `README.md` replaced (it was GitLab's template) with what this is, how to
  run, the two-component rule and the OpenAPI-only rule.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build`: pass.
- `npm test`: 2 files, 4 tests, pass.
- `npm run dev` served the page; Playwright (headless Chromium) loaded it, read the `h1` as
  "ForeSignal Client" with no page errors, and took the screenshot.
- `npx prettier --check .`: clean.
- US English: `python3 ~/Documents/GitLab/meshdtn/style/check_us_english.py <this repo>` reports
  no hits in any file this prompt wrote. It does report hits elsewhere — see below.

## Compared to the mockups

No mockup applies yet: this is an unstyled placeholder heading. Prompt 004 builds the first
styled screen.

## Owner notes and questions (none blocking)

1. **TypeScript 5 vs the current release.** The prompt and the Architecture pin TypeScript 5. The
   current release is 7.0.2; 5.9.3 is the latest 5.x and is what is installed. typescript-eslint
   8.71.2 only supports `<6.1.0`, so moving up would also wait on that.
2. **Mockup files don't match the Charter's table.** `design/` contains six files:
   Global, Conflict, Tropical Storm, *Intelligence Dashboard Split-Screen*,
   `ForeSignal_Analyst_Workbench.png` and `ForeSignal_Analysis_View.png`. The Charter lists five
   views and names one "Satellite Operations / Analysis View"; there is no file with that name, and
   the Split-Screen file isn't in the table.
3. **The vendored design README points at prose.** It says the panels are served "through
   `docs/Client-Contract.md`" and that the material is "not part of the broker build". The Charter
   makes OpenAPI the only reference. It was copied unchanged; should it be replaced?
4. **British spellings in planner files**, left untouched because they are the planner's:
   `docs/Roadmap.md:147` and `prompts/032-RF-And-Sensors.md` lines 3, 22, 28, 29 ("catalogue").
   The vendored spec has 831 hits (catalogue, licence, honour, synchronised, labelled…). It comes
   from the backend, so it cannot be changed here.
5. **Playwright** was added (Architecture §3/§17 names it) to take the screenshot. No e2e test
   suite exists yet.
