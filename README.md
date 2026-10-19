# ForeSignal Client

The ForeSignal Client is a **web application** that renders the intelligence the ForeSignal
backend produces: a global situational-awareness dashboard over a 2D/3D map, with
selection-driven detail views for situations, investigations, forecasts, satellite operations,
RF/sensors, operations and analyst work. It is **presentation only** — collection, correlation,
history, forecasts and analysis all live in the backend.

Stack: Vite + React 19 + TypeScript, CesiumJS (via Resium) for the map and globe, deck.gl for
dense layers, and an API layer generated from the backend's OpenAPI spec.

## Rules

- **Two runtime components, no third.** The backend (ForeSignal, Java/Spring Boot +
  PostgreSQL/PostGIS) and this one web app. No backend-for-frontend, no Node server, no proxy,
  no native wrapper. Vite is build-time only; in production the backend serves `dist/`
  same-origin.
- **OpenAPI is the only backend reference.** `openapi/OpenAPI.json` is a vendored copy of the
  backend's `docs/OpenAPI.json`; its `info.version` is recorded in `openapi/VERSION`. Every
  backend call cites an `operationId`. Behavior the spec does not express is raised as an owner
  question, never invented and never sourced from prose.
- **US English** everywhere.

## Running

Requires Node 22.12 or newer.

```sh
npm install
npm run dev          # Vite dev server
```

The backend base URL comes from `VITE_FORESIGNAL_BASE_URL` (default `/`, same-origin). To point
the dev server at a backend elsewhere:

```sh
VITE_FORESIGNAL_BASE_URL=http://localhost:8080 npm run dev
```

## Scripts

| Script              | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Vite dev server                                |
| `npm run build`     | Static production build into `dist/`           |
| `npm run preview`   | Serve the production build locally             |
| `npm run typecheck` | `tsc --noEmit`                                 |
| `npm run lint`      | ESLint                                         |
| `npm run format`    | Prettier                                       |
| `npm test`          | Vitest                                         |
| `npm run generate`  | Generate API types from `openapi/OpenAPI.json` |

## Layout

| Path                  | What it is                                                             |
| --------------------- | ---------------------------------------------------------------------- |
| `design/`             | The mockups — the visual spec                                          |
| `docs/`               | Product Charter, Architecture, Roadmap                                 |
| `prompts/`            | The ordered implementation prompts (`000-Run-Sequence.md` drives them) |
| `completion-reports/` | One report per completed prompt                                        |
| `openapi/`            | Vendored backend spec and its version                                  |
| `src/app/`            | Shell, routing, layout, theme, error boundaries                        |
| `src/api/`            | Generated types, fetch client, SSE stream, auth                        |
| `src/state/`          | Reactive store                                                         |
| `src/map/`            | Cesium viewer, layers, deck.gl overlays, HUD                           |
| `src/panels/`         | Dossier, insights, timeline, graph, intelligence, alerts               |
| `src/views/`          | Screen compositions                                                    |
| `src/ui/`             | Design-system primitives                                               |
| `src/lib/`            | Shared helpers and configuration                                       |
