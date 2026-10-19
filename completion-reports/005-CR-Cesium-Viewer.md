# 005 — Completion Report: Cesium Viewer

| Field                 | Value                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| Status                | Complete — reworked to the 2D-default map model (owner, 2026-10-19)       |
| Implementation commit | `5a800dbadc4dd7719ecfb7e5d7b16922f3bc8dca` (on top of `df7acf0`)          |
| Screenshot            | `review/005-cesium-viewer.png` (1672×941, production build, opens in 2D)  |
| 2D and 3D             | `review/005-cesium-viewer-2d-3d.png` (the same place in 2D Map, 3D Globe) |

## History of this prompt

1. **`df7acf0`.** The first version shipped a 2D / 3D / Split toggle that opened in 3D, with
   Split as Cesium's Columbus view.
2. **Owner decision, then `33cf4ff`.** The owner decided there is no Split view: the map is 2D
   normally, and selecting an item whose kind has a 3D view switches to 3D and flies to it. The
   planner committed that as `33cf4ff` ("Map model: 2D by default, no Split, contextual 3D on
   selection"). It rewrote this prompt and Architecture §5, and moved the selection behavior to 014.
3. **`5a800db`.** Reworks the map to match, and this report replaces the first one whole.

## What was built

- **Packages.** `cesium` 1.146.0, `resium` 1.27.0 and `vite-plugin-cesium` 1.2.23, all pinned
  exactly.
  - In `vite build`, the plugin loads Cesium as a global from `/cesium/Cesium.js` and copies
    `Assets`, `ThirdParty`, `Workers` and `Widgets` into `dist/cesium` (14 MB). It also sets the
    base URL.
  - In dev it serves `/cesium/` from `node_modules`.
- **The viewer (`MapViewer`, in `src/map/Viewer.tsx`).**
  - It is a Resium `<Viewer>` with every built-in widget turned off: animation, timeline,
    base-layer picker, geocoder, home, scene-mode picker, help, fullscreen, info box, selection
    indicator, VR and sky box.
  - It is constructed in `SCENE2D`, so the map opens as a 2D map.
  - It renders at device pixel ratio (`useBrowserRecommendedResolution={false}`). `powerPreference`
    is left at Cesium's default.
  - When WebGL is unavailable, it shows a plain alert instead of the viewer.
- **Base imagery (`src/map/imagery.ts`).**
  - The base map is Cesium's bundled Natural Earth II tiles, dimmed for the dark theme.
  - The tiles ship in the build, so there is no Cesium ion token and no third-party service.
  - The backend's map style has overlays only and no basemap, so the client supplies this base
    layer.
  - Each viewer instance adds its own layer. React StrictMode mounts the viewer twice, and a
    shared layer was destroyed along with the first viewer.
- **Modes (`src/map/sceneMode.ts`).**
  - There are two modes: 2D Map (`SCENE2D`, the default) and 3D Globe (`SCENE3D`).
  - There is no Split and no Columbus view.
    `grep -rn -i "split\|columbus" src`, outside the generated schema, finds only:
    - the logo's "split triangle" comment
    - the antimeridian test in `readout.test.ts`
    - the comments in `sceneMode.ts` that say there is no Split
    - the test that Columbus view reads back as no mode
- **Switching keeps the user's place (`switchSceneMode`, in `src/map/view.ts`).**
  - Cesium's morph resets the camera to a whole-world view. The first version did this: 2D over
    Florida became a 3D globe over Africa.
  - Now the camera goes back over the same ground point, at the same height, once the morph
    completes.
  - 014 builds on this. Its contextual 3D-on-selection is a switch plus a fly-to.
- **HUD (`src/map/MapHud.tsx`).** It is DOM drawn over the canvas, not Cesium widgets.
  - **Toggle:** 2D Map / 3D Globe, using the `Tabs` pill variant. The mode is local state until
    012 moves it to the store.
  - **Compass:** the needle turns against the camera heading. Clicking it resets north.
  - **Zoom:** in and out step 40% of the camera height.
  - **Home:** returns to 28°N, 80°W at 13,000 km.
  - **GLOBAL VIEW inset:** the level-0 tiles with the visible area outlined. An area that
    crosses the antimeridian is drawn as two boxes.
  - **Readout:** LAT / LON / ELEV and a scale bar.
    - LAT and LON are the ground point under the view center. When the center is in space, the
      camera position is used.
    - ELEV is the camera height.
    - The scale bar is a round 1, 2 or 5 × 10ⁿ measured across the view center.
- **Time HUD (`src/views/global/TimeHudPlaceholder.tsx`).**
  - The 004 time box, LIVE badge, scrubber and "Placeholder panel data" chip now sit over the
    real map, until 012 and 013 replace them.
  - The 004 `MapPlaceholder` is deleted.

### Fixed along the way

1. **The mode switch lost the user's place.** Fixed by `switchSceneMode`, above.
2. **The readout first used the camera's own position.** A tilted camera showed latitude
   `-202.5712°`. It now uses the ground point under the view center.
3. **The scale bar was first measured near the bottom edge.** On the flat map, that edge is close
   to the pole, where the projection stretches distance. It is now measured across the center.

## Verification

- **Checks.** `npm run typecheck`, `npm run lint`, `npx prettier --check .` and `npm run build`
  pass.
- **Tests.** `npm test` passes: 22 files, 95 tests. The map tests cover:
  - **`sceneMode.test.ts`:**
    - 2D is the default, and only 2D and 3D exist.
    - Columbus view and morphing read back as no mode.
    - A morph is called with its duration, and not called when the scene is already in that mode.
  - **`view.test.ts`:**
    - The home destination round-trips to 28°N, 80°W, 13,000 km, and the scene gets the theme
      colors.
    - `switchSceneMode` puts the camera back at the same longitude, latitude and height after the
      morph completes, and only then.
    - It leaves no listener behind, whether the morph happens or the scene is already in that
      mode.
    - With no place to keep, it morphs without moving the camera.
  - **`readout.test.ts`:** degree and height formatting, the scale steps (4,073 km across 100 px
    gives 2,000 km at 49 px), non-positive input, inset placement and the antimeridian split.
  - **`MapHud.test.tsx`:**
    - Dashes show before the camera is known; then the live values, scale and inset box.
    - The compass rotates against the heading.
    - Exactly two tabs, 2D Map and 3D Globe, with the current one marked and a change reported.
    - The zoom, reset-north and home callbacks fire.
  - **`Viewer.test.tsx`:** the no-WebGL path. jsdom has no WebGL, so the WebGL path is proven in
    the browser below.
- **In a real browser.** Playwright and headless Chromium (SwiftShader WebGL) ran against
  `vite preview` of the production build, at 1672×941.

  | Step                             | Mode | LAT      | LON       | ELEV      | Scale    |
  | -------------------------------- | ---- | -------- | --------- | --------- | -------- |
  | Load                             | 2D   | 28.0000° | -80.0000° | 13,000 km | 1,000 km |
  | Click 3D Globe                   | 3D   | 27.7804° | -80.0000° | 13,000 km | 1,000 km |
  | Click 2D Map                     | 2D   | 27.7804° | -80.0000° | 13,000 km | 1,000 km |
  | Zoom in                          | 2D   | 27.7804° | -80.0000° | 7,800 km  | 500 km   |
  | Drag 150 px right and 60 px down | 2D   | 32.0529° | -90.6812° | 7,800 km  | 500 km   |
  | Home view                        | 2D   | 28.0000° | -80.0000° | 13,000 km | 1,000 km |
  - The toggle's tabs read exactly `2D Map`, `3D Globe`, and the selected tab follows the mode.
  - The place is kept across both switches. Latitude reads 27.78° in 3D because it is the point
    under the canvas center, not the camera's nadir. Switching back to 2D keeps that value
    without drifting.
  - Zoom in cut the height from 13,000 to 7,800 km, which is −40%.
  - **Retina:** at `deviceScaleFactor` 2 the canvas is 1968×1054 backing pixels for 984×527 CSS
    pixels.
  - **Resize:** after resizing the viewport to 1280×800, the canvas is 1184×772 for 592×386.
  - **Requests:** none went to another origin. No ion and no external tiles.
  - There were no page or console errors or warnings.
  - I viewed both review images before committing.

- **US English** (`check_us_english.py`):
  - Over a copy of `src`, `completion-reports`, `README.md` and `review`, the only hits are the
    777 in the generated schema.
  - Over the whole repository, the other hits are:
    - the vendored `openapi/OpenAPI.json`
    - Cesium's own code in the gitignored `dist/`
    - one sha512 hash in `package-lock.json`

    None of these were changed.

## Compared to the mockup

`design/Foresignal Global Intelligence Dashboard.png` against `review/005-cesium-viewer.png`.

**What matches.** These are all in the mockup's positions:

- the mode toggle at top right
- the compass, zoom and home controls on the right
- the time box and scrubber at top left
- the GLOBAL VIEW inset at bottom left
- the readout and scale bar at bottom right

**Known differences:**

1. **2D, not a globe.** The mockup draws a 3D globe, but by the owner's decision the map now opens
   in 2D.
2. **Imagery.** The mockup shows a night-lights Earth with clouds and radar. The build shows
   daytime Natural Earth II, which is low-resolution up close. See question 1.
3. **No overlays yet.** Aircraft, ships, satellites, events and the storm come in later prompts.
4. **Tool buttons.** The mockup's five extra tool buttons below zoom are not here. They belong to
   the prompts that give them something to do.
5. **The Cesium credit** shows at bottom left, small and dim. See question 2.

## Documents that still say Split

The map model changed in Architecture §5 and prompts 005 and 014, but these still describe a Split
mode. I have not edited them; they are yours and the planner's.

- `docs/Roadmap.md:88`: "2D/3D/split scene-mode toggle"
- `docs/Product-Charter.md:60`, `:93` and `:136`: "2D map, 3D globe and split"
- `docs/Architecture.md:17` (the diagram): "Cesium map/globe (2D/3D/split)"
- `prompts/027-Satellite-Constellation.md:24`: "2D/3D/Split reuse the 005 scene toggle"

I found these with `grep -rn -i "split\|columbus" docs prompts design/README.md`.

## Owner questions

1. **Base imagery.** The bundled Natural Earth II is the only base map that needs no outside
   service. Is there a higher-resolution or night-lights tile source on your LAN, or from the
   backend, that the client should use?
2. **Cesium credit.** Cesium draws its logo credit by default, and I left it visible.
   `grep -i credit` in `node_modules/cesium/README.md` and `LICENSE.md` found no credit
   requirement, so it is your call: keep it on the map, or move it to an About view?
3. **What the readout tracks.** The mockup reads `28.3921°, -76.5123°, ELEV 0 m`, which looks like
   a point on the ground near Florence, not the camera. I show the view center and the camera
   height. Should the readout follow the mouse pointer instead, with ELEV as ground height?
4. **The map plugin.** `vite-plugin-cesium` was last published on 2024-08-06 (`npm view
vite-plugin-cesium time.modified`). It works with Vite 8.3.4, as verified above. Keep it, or
   switch to `vite-plugin-cesium-engine`?
5. **The manual toggle.** Architecture §5 keeps a manual 2D / 3D toggle alongside the contextual
   switch, so I kept it. Do you want it on the map, or should 3D be reached only by selecting an
   item?

Earlier questions still open, with defaults in place:

- 004: the Alerts tab, the tagline and the user menu.
- 003: `security.openReads` missing from the live system response, and tile keys needing the
  agent scope.
- 002: `listObjectAnnotations` paging, and Retry-After as an HTTP date.
