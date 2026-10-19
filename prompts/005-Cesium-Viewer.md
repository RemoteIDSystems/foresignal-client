# 005 — Cesium Viewer

**Goal.** Mount the Cesium map/globe inside the shell — **2D by default**, with a manual **2D / 3D**
toggle (no Split) — and the map HUD chrome. Contextual auto-switch to 3D on selection is built in 014.

**Read first.** 004-CR; [Architecture.md](../docs/Architecture.md) §5, §16. Design: the Global
Dashboard and Tropical-Storm mockups (map region, scene toggle, HUD, mini inset).

**Build.**
- Add **CesiumJS** + **Resium** and the Vite Cesium plugin (`vite-plugin-cesium` or
  `-cesium-engine`) so Cesium's static assets are copied and `CESIUM_BASE_URL` is set. Verify the
  globe renders in `vite build` output, not just dev.
- `map/Viewer.tsx`: a Resium `<Viewer>` with the default widgets stripped (we draw our own HUD) and
  sensible camera defaults.
- **Base imagery** (matches the mock, self-hosted, public domain, no account, no external tile
  service): **NASA Blue Marble** (daytime true color) as the base, with **NASA Black Marble** night
  lights shown on the night side via Cesium's day/night lighting (terminator between them). Weather
  clouds are a separate backend overlay (009), not the basemap. A single Blue Marble month is used;
  the basemap is **not** tied to the time machine (the clock governs data layers, not base imagery).
- **2D / 3D toggle** — `SceneMode.SCENE2D` is the **default**; `SCENE3D` is the other option. **No
  Split, no Columbus view.** The mode is held in local state here and wired to the store in 012.
- **HUD chrome** (DOM overlay, not Cesium widgets): scale bar, a **lat/lon/elev readout that follows
  the mouse pointer** (the ground point; falls back to the view center when the pointer is off the
  map), N compass, zoom controls, and the mini "global view" inset.
- **Elevation:** ELEV reads ground height from a **bundled public-domain global relief grid** (NOAA
  ETOPO or similar), self-hosted, used for the readout only — the globe stays smooth (no 3D terrain
  mesh). Shows "—" when the pointer is off the map.
- Resize/retina handling; `powerPreference` left at Cesium defaults (desktop target).

**Done when.** The map renders in a production build, **2D by default**; the 2D/3D toggle switches
scene mode live; HUD elements show live lat/lon/elev. A Playwright check captures the canvas and the
HUD.

**Commit.** `005: Cesium Viewer`; `completion-reports/005-CR-Cesium-Viewer.md` (hash + owner questions).
