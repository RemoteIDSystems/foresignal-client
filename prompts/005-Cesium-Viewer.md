# 005 — Cesium Viewer

**Goal.** Mount the Cesium map/globe inside the shell with a working **2D Map / 3D Globe / Split**
toggle and the map HUD chrome.

**Read first.** 004-CR; [Architecture.md](../docs/Architecture.md) §5, §16. Design: the Global
Dashboard and Tropical-Storm mockups (map region, scene toggle, HUD, mini inset).

**Build.**
- Add **CesiumJS** + **Resium** and the Vite Cesium plugin (`vite-plugin-cesium` or
  `-cesium-engine`) so Cesium's static assets are copied and `CESIUM_BASE_URL` is set. Verify the
  globe renders in `vite build` output, not just dev.
- `map/Viewer.tsx`: a Resium `<Viewer>` with the default widgets stripped (we draw our own HUD),
  a base imagery layer, sensible camera defaults.
- **Scene-mode toggle** (`SceneMode.SCENE3D | SCENE2D | COLUMBUS_VIEW`) bound to the design's
  2D/3D/Split control; the mode is held in the store (added in 012; a local state stub for now).
- **HUD chrome** (DOM overlay, not Cesium widgets): scale bar, lat/lon/elev readout, N compass,
  zoom controls, and the mini "global view" inset.
- Resize/retina handling; `powerPreference` left at Cesium defaults (desktop target).

**Done when.** The globe renders in a production build; the 2D/3D/Split toggle switches scene mode
live; HUD elements show live camera lat/lon/elev. A Playwright check captures the canvas and the
HUD.

**Commit.** `005: Cesium Viewer`; `completion-reports/005-CR-Cesium-Viewer.md` (hash + owner questions).
