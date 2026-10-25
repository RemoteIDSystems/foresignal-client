# Deploying the ForeSignal Client

The client is static files. The backend's reverse proxy serves them from the same origin as the
API, so there are two components only: **the backend, and these files**. There is no frontend
server.

## 1. Build

```sh
npm ci
npm run build        # vite build → dist/
npm run verify:dist  # checks dist/ before it is deployed
```

`dist/` holds:

| Path | What it is | Cached as |
| --- | --- | --- |
| `index.html` | The page. It sets `window.CESIUM_BASE_URL = "/cesium/"` and loads Cesium, then the bundle. | Revalidate every time |
| `assets/` | The app bundle, chunks and styles, content-hashed (`index-<hash>.js`). | Immutable |
| `cesium/` | Cesium's `Cesium.js`, `Workers/`, `Assets/`, `ThirdParty/` and `Widgets/`, copied by vite-plugin-cesium. | Revalidate |
| `terrain/`, `basemap/` | The self-hosted 3D terrain and base map. | Revalidate |
| `sw.js` | The Web Push service worker (030), at a stable path, scope `/`. | Revalidate every time |

`npm run verify:dist` fails the deploy if:

- `index.html` does not set `CESIUM_BASE_URL`, or sets it to somewhere other than where
  `Cesium.js` loads from;
- any of Cesium's `Workers`, `Assets`, `ThirdParty`, `Widgets` or `Cesium.js` is missing;
- `sw.js` is not at the root;
- the page does not load a content-hashed bundle;
- any text file holds something that looks like a token, a private key or a bearer header.

### Backend base URL

`VITE_FORESIGNAL_BASE_URL` is the backend's base URL. **Leave it unset for production**: it
defaults to `/`, so every request is same-origin. Vite reads it when the bundle is built, so a build
with it set talks to that backend wherever it is served. No secret is ever put in the bundle; a
token is entered in Settings and kept in the browser.

### Basemap tiles and the optional CARTO key

Below the overview zoom the map draws the self-hosted NASA basemap from `basemap/`. Zoomed in, it
hands off to tiles the browser fetches directly from their providers (038):

- **Map**: Esri's World Dark Gray Canvas (`server.arcgisonline.com`,
  `Canvas/World_Dark_Gray_Base`). This is the default, and it needs no key. It has real tiles to
  level 16, so the map does not zoom past that level.
- **Satellite**: Esri World Imagery (`server.arcgisonline.com`). It needs no key.

`VITE_CARTO_KEY` is the optional CARTO basemaps key. Set when the bundle is built, it makes the Map
basemap draw CARTO's dark raster street map (`basemaps.cartocdn.com`, `dark_all`) in place of
Esri Dark Gray. Unset or blank, Map draws Esri Dark Gray; CARTO is never asked without a key. The
key is a browser-side key: it is compiled into the bundle and sent with every CARTO tile request.

```sh
VITE_CARTO_KEY=<your CARTO key> npm run build
```

## 2. Deploy into the backend's web root

The backend repository's `web` compose profile runs Caddy:

- it mounts `./deploy/web` at `/srv/web`, read-only;
- it sends `/v1/*`, `/mcp*` and `/actuator/health*` to the backend;
- it serves everything else from `/srv/web`, with `try_files {path} /index.html` as the
  single-page-app fallback.

Copy the build there:

```sh
npm run deploy:web -- ../foresignal/deploy/web          # copy over what is there
npm run deploy:web -- ../foresignal/deploy/web --clean  # or replace it (keeps .gitkeep)
```

The copy checks `dist/` first, as `verify:dist` does. It writes `index.html` last, so the page
never names an asset that has not arrived. Without `--clean`, earlier hashed assets stay, so a
browser still holding the previous page can load them.

Then start the backend with the web profile, as its Caddyfile describes:

```sh
FORESIGNAL_HOSTNAME=foresignal.local docker compose --profile web up -d
```

Open `https://<FORESIGNAL_HOSTNAME>/`. Opening the client needs only the backend and these files.

## 3. Caching

- **Tiles and API responses** carry the backend's own `Cache-Control` and `ETag`. Its tiles are
  content-addressed and immutable. The client sends tile requests through the browser cache
  unchanged: it adds no cache-busting query and no `no-store`. Only the event streams use
  `no-store`.
- **The static files** are served by Caddy's `file_server`, which sends `ETag` and `Last-Modified`,
  so browsers revalidate them. The Caddyfile sets no `Cache-Control` for them. The column above is
  what each path can take; making `assets/` immutable needs a `header` rule in the backend's
  Caddyfile (see the 034 completion report).

## 4. Running the production build against a development backend

The same `dist/` can be served locally, with the preview server's proxy standing in for Caddy:

```sh
VITE_FORESIGNAL_BACKEND=http://localhost:8080 npm run preview
```

The preview server proxies `/v1`, `/compat`, `/mcp` and `/actuator` to that backend and serves
`dist/` for everything else. It is a development tool and is never deployed.

## 5. CI note

There is no CI file in this repository, and none is added. A build job would run:

```sh
npm ci
npm run typecheck
npm run lint
npx prettier --check src e2e
npm test
npm run build
npm run verify:dist
```

Its artifact is `dist/`. The backend's CI is the backend's, and this repository does not change
it.
