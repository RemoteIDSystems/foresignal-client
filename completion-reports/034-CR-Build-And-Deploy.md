# 034 — Completion Report: Build And Deploy

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete) |
| Implementation commit | `1388417910273f306d1f0b860309bc0b8942d23c`                                              |
| Run mode              | Unattended (owner's batch 023–036, no pausing)                                          |
| Screenshots           | None taken (compile-only run).                                                          |
| Mock comparison       | Not applicable: no screen changed.                                                      |

## Results

- **The production build states its Cesium base URL.** `index.html` now begins with
  `window.CESIUM_BASE_URL = "/cesium/";`, set before any script runs, beside the
  `/cesium/Cesium.js` script and `/cesium/Widgets/widgets.css` that vite-plugin-cesium adds.
  - Before, the built output did not set it: Cesium derived it from its own script tag. This
    session grepped `dist/cesium/Cesium.js` and found Cesium's script-path pattern
    `/((?:.*\/)|^)Cesium\.js(?:\?|\#|$)/` used when `CESIUM_BASE_URL` is undefined.
  - The value now comes from the build's `base` and the same `cesium/` directory the plugin copies
    into.
- **`npm run verify:dist`** checks a build before it is deployed. It fails if:
  - `CESIUM_BASE_URL` is missing, or differs from where `Cesium.js` loads;
  - any of Cesium's `Cesium.js`, `Workers`, `Assets`, `ThirdParty` or `Widgets` is missing;
  - `sw.js` is not at the root;
  - the page loads no content-hashed bundle;
  - a text file holds something like a ForeSignal token or ticket, a private key or a bearer
    header.

  On this session's build it printed "✓ dist is ready to deploy."

- **`npm run deploy:web -- <web root> [--clean]`** checks `dist/` the same way and copies it into
  the backend's web root (`../foresignal/deploy/web`). It writes `index.html` last. Without
  `--clean` it keeps earlier hashed assets, for browsers still on the previous page; with `--clean`
  it empties the root first and keeps `.gitkeep`.
- **`docs/Deploy.md`** covers:
  - build, verify and deploy;
  - the backend's Caddy `web` profile, which mounts `./deploy/web` at `/srv/web` with
    `try_files {path} /index.html`;
  - what each path of `dist/` can be cached as;
  - running the same `dist/` against a development backend (`VITE_FORESIGNAL_BACKEND=… npm run
preview`);
  - a CI note (commands only; no CI file).
- **Base URL.** `VITE_FORESIGNAL_BASE_URL` was already in place (`src/lib/config.ts`). It defaults
  to `/`, so the build is same-origin. No secret is in the bundle, and the secret scan over
  `dist/` found none.
- **Service worker** (030): `dist/sw.js` at the root. It is registered as
  `${import.meta.env.BASE_URL}sw.js` (`src/push/webPush.ts:65`), so its path stays stable.
- **Tile caching** is respected: the client adds no cache-busting query and no `no-store` to tile
  requests. The only `no-store` in `src/` is the event-stream fetch (`src/api/stream/sse.ts:132`).

## What was built

- `vite.config.ts`: the `foresignal-cesium-base-url` plugin (`cesiumBaseUrl()`), and
  `cesium({ cesiumBaseUrl: 'cesium/' })` stated explicitly.
- `scripts/release/verify.mjs`: `checkDist`, `CESIUM_PARTS`, `SECRET_PATTERNS`.
- `scripts/release/deploy.mjs`: `deployDist`, `KEPT`.
- `scripts/verify-dist.mjs`, `scripts/deploy-web.mjs`: the command-line entries.
- `package.json`: the `verify:dist` and `deploy:web` scripts.
- `docs/Deploy.md`.

## How it was checked

### Tests (written, not run)

`scripts/release/dist.test.mjs` (7, node environment, temporary directories). It covers:

- **the build check:**
  - a good build passes;
  - a missing or mismatched `CESIUM_BASE_URL` is reported;
  - a missing Cesium part, a missing `sw.js` and a missing `index.html` are reported;
  - a token-like string in a bundle is reported;
- **the deploy copy:**
  - the copy writes the page and the Cesium files and keeps old files;
  - `--clean` empties the root but keeps `.gitkeep`;
  - a build without a page, or a missing web root, is refused.

The prompt's "verify from a clean `vite preview` or the backend-served copy" is a browser run,
which the standing rule defers. What ran instead is the build check above, on the real `dist/`.

### Checks

| Check                                                       | Result                                                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                                         | Passed                                                                                                                               |
| `npm run lint`                                              | Passed (includes `scripts/`)                                                                                                         |
| `npx prettier --check src e2e`                              | Passed (and `scripts`)                                                                                                               |
| `npm run build`                                             | Passed. `index` 875.10 kB (263.11 kB gzip), unchanged; `index.html` begins with `window.CESIUM_BASE_URL = "/cesium/";`               |
| `npm run verify:dist`                                       | "✓ dist is ready to deploy."                                                                                                         |
| `npm test`, `npm run e2e`, `vite preview` in a browser      | **Not run** (standing rule)                                                                                                          |
| Guard: `test_us_english.py`                                 | 14 tests OK (168.1 s). It ran before the scripts folder was renamed (`scripts/dist` to `scripts/release`); the content was the same. |
| Guard: `check_us_english.py` over the project               | 804 hits, unchanged                                                                                                                  |
| Guard: `check_us_english.py` over the new and changed files | 0 hits (and "0 British spellings" over the amended commit's 8 files)                                                                 |

### A slip, caught before push

The first commit left out `scripts/dist/`: `.gitignore`'s `dist/` pattern matches it, and
`.prettierignore` skips it the same way. The folder was renamed to `scripts/release/` and the
**unpushed** local commit was amended (twice: the rename, then Prettier on the newly tracked
files). Nothing pushed was rewritten.

## Compared to the mock

Not applicable: build and deployment only. No screen changed.

## Decisions taken (unattended run)

1. **The base URL stays a build-time Vite variable**, as the prompt names it
   (`VITE_FORESIGNAL_BASE_URL`, default `/`). "The same build against a dev backend" uses the
   preview server's proxy, which forwards same-origin paths; there is no runtime config file
   (owner question 1).
2. **Deploying copies; it does not delete by default**, so a browser on the previous page keeps
   working. `--clean` is there to replace the root.
3. **Cache headers are documented, not set.** The static files are served by the backend's Caddy,
   and this prompt makes no backend change (owner question 2).
4. **The secret scan** looks for ForeSignal token shapes, private keys and literal bearer headers,
   so it fails the deploy rather than relying on review.
5. **The deploy script was not run** against the backend repository's `deploy/web`, which holds
   only `.gitkeep` (listed in this session). Running it writes into another repository, so that is
   the owner's step.

## Deviations from the prompt text

- **"Verify from a clean `vite preview` or the backend-served copy"** was done as a build-output
  check, not a browser run (standing rule).
- **"Set app asset caching sensibly"** is documented in `docs/Deploy.md`. Setting it would need a
  `header` rule in the backend's Caddyfile, which is not this repository's.

## Backend observations

These come from reading the backend repository in this session; nothing there was changed.

- `deploy/caddy/Caddyfile`:
  - proxies `@foresignal path /v1/* /mcp* /actuator/health*` to the backend;
  - serves everything else from `/srv/web` with `try_files {path} /index.html` and `file_server`;
  - sets no `Cache-Control` for the static files.
- **`/compat/*` is not in that matcher.** The client reads satellites from
  `/compat/celestrak/gp.php` (`src/satellites/satelliteApi.ts:37`). Behind Caddy that path falls
  through to the SPA fallback and answers `index.html`, so Satellite Operations would find no
  element sets. The dev and preview proxies forward `/compat`, so this shows only behind Caddy
  (owner question 3).
- `docker-compose.yml` mounts `./deploy/web:/srv/web:ro` for the `web` profile (line 156).
  `deploy/web` holds only `.gitkeep`.

## Owner questions

1. **Runtime base URL.** Is a build-time `VITE_FORESIGNAL_BASE_URL` enough, or should the page read
   the backend's URL at runtime (for example from a small `config.json` beside `index.html`)?
   **Default in place: build-time, default `/`.**
2. **Static caching.** Should the backend's Caddyfile send `Cache-Control: public, max-age=31536000,
immutable` for `/assets/*` and `no-cache` for `/index.html` and `/sw.js`? **Default in place:
   Caddy's ETag and Last-Modified revalidation only.**
3. **`/compat` behind Caddy.** Should the backend add `/compat*` to its Caddy matcher, so
   satellites load in the deployed client? **Default in place: none; documented here.**
4. **Deploy target.** Should `deploy:web` default to `../foresignal/deploy/web` when no path is
   given? **Default in place: the path is required.**

Questions still open from earlier reports keep their defaults.
