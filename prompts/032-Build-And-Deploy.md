# 032 — Build And Deploy

**Goal.** Produce the static build the backend serves same-origin, with Cesium assets and correct
caching — keeping the solution to two components.

**Read first.** 031-CR; [Architecture.md](../docs/Architecture.md) §16; Charter §2.

**Build.**
- `vite build` → `dist/` with the Cesium static assets (`Workers`/`Assets`/`ThirdParty`) copied and
  `CESIUM_BASE_URL` correct in the built output (verify, do not assume).
- Runtime base-URL config (`VITE_FORESIGNAL_BASE_URL`, default `/`) so the same build runs
  same-origin in prod and against a dev backend; **no secrets in the bundle**.
- A documented deploy step: copy `dist/` into the backend web root (`./deploy/web`) so it is served
  with the SPA fallback behind the backend's reverse proxy. **No frontend server.**
- Respect immutable, content-addressed tile caching; set app asset caching sensibly. The Web Push
  service worker (030) is served from the same origin at a stable path.
- A short `docs/Deploy.md` and a `build` CI note (do **not** add backend CI).

**Done when.** The production build runs same-origin against the backend with the globe, live data
and panels working; opening it needs only the backend + the static files. Verify from a clean
`vite preview` or the backend-served copy.

**Commit.** `032: Build And Deploy`; `completion-reports/032-CR-Build-And-Deploy.md` (hash + owner questions).
