# 005 — Completion Report: Cesium Viewer

| Field                 | Value                                                                |
| --------------------- | -------------------------------------------------------------------- |
| Status                | Complete                                                             |
| Implementation commit | `df7acf02fa33bbeddee7beca97839cee533afd07`                           |
| Screenshot            | `review/005-cesium-viewer.png` (1672×941, production build, 3D home) |
| Scene modes           | `review/005-cesium-viewer-modes.png` (2D Map, 3D Globe, Split)       |

## What was built

- **Packages.** `cesium` 1.146.0, `resium` 1.27.0 and `vite-plugin-cesium` 1.2.23, all pinned
  exactly.
  - In `vite build`, the plugin loads Cesium as the global from `/cesium/Cesium.js`. It copies
    `Assets`, `ThirdParty`, `Workers` and `Widgets` into `dist/cesium` (14 MB) and sets the
    base URL.
  - In dev it serves `/cesium/` from `node_modules`.
- **`src/map/Viewer.tsx`: `MapViewer`.**
  - A Resium `<Viewer>` with every built-in widget turned off: animation, timeline, base-layer
    picker, geocoder, home, scene-mode picker, help, fullscreen, info box, selection indicator,
    VR and sky box.
  - It renders at device pixel ratio, with `useBrowserRecommendedResolution={false}` for sharp
    output on retina screens. `powerPreference` is left at Cesium's default.
  - When WebGL is unavailable, it shows a plain alert instead of the viewer.
- **Base imagery: `src/map/imagery.ts`.**
  - The base map is Cesium's bundled Natural Earth II tiles, dimmed to sit under the dark theme.
    They ship in the build, so there is no Cesium ion token and no third-party tile service.
  - The backend's map style has overlays only and no basemap, so the client supplies the base
    layer.
  - Each viewer instance adds its own layer. Under React StrictMode the viewer mounts twice, and
    a shared layer was destroyed along with the first viewer.
- **Camera defaults and theme: `src/map/view.ts`.**
  - The home view is 28°N, 80°W at 13,000 km, centered on the western Atlantic as in the
    mockup.
  - Space is colored `#02060c` and the bare globe `#0b1a2a`.
- **Scene-mode toggle: `src/map/sceneMode.ts`.**
  - The design's three modes map to Cesium scene modes:
    - 2D Map → `SCENE2D`
    - 3D Globe → `SCENE3D`
    - Split → `COLUMBUS_VIEW`
  - The switch is a live 1-second morph (`morphTo2D` / `morphTo3D` / `morphToColumbusView`).
    Resium's `sceneMode` prop is read-only after construction, so it is not used.
  - The mode is held in local state, as the prompt says; 012 moves it to the store.
- **HUD: `src/map/MapHud.tsx`.** It is DOM drawn over the canvas, not Cesium widgets.
  - **Toggle:** 2D Map / 3D Globe / Split, using the `Tabs` pill variant.
  - **Compass:** the needle turns against the camera heading. Clicking it resets north.
  - **Zoom:** zoom in and out step 40% of the camera height.
  - **Home:** flies back to the home view.
  - **GLOBAL VIEW inset:** shows the level-0 Natural Earth tiles with the visible area outlined.
    An area that crosses the antimeridian is drawn as two boxes.
  - **Readout:** LAT / LON / ELEV and a scale bar.
    - LAT and LON are the ground point under the center of the view, with four decimals.
    - ELEV is the camera height: meters below 10 km, kilometers above.
    - The scale bar is a round 1, 2 or 5 × 10ⁿ measured across the center of the view.
- **Time HUD** (`src/views/global/TimeHudPlaceholder.tsx`). The time box, LIVE badge, scrubber
  and "Placeholder panel data" chip from 004 now sit on top of the real map, until 012 and 013
  replace them. The 004 `MapPlaceholder` is deleted.

### Fixed during this pass

1. **The readout first used the camera's own position.**
   - In Split it showed latitude `-202.5712°`. A tilted Columbus-view camera sits beyond the
     edge of the map, so its position is not a place.
   - It now reads the ground point under the view center. It falls back to the camera position
     when the center is in space.
2. **The scale bar was first measured near the bottom edge.**
   - On the flat maps that edge is near the South Pole, where the projection stretches distance.
     Split showed "100 km" for a view thousands of kilometers wide.
   - It is now measured across the center.

## Verification

- `npm run typecheck`, `npm run lint`, `npx prettier --check .`, `npm run build`: pass.
- `npm test`: 22 files, 92 tests, pass. The new tests cover:
  - **`sceneMode.test.ts`:** the mode mapping, the reverse lookup (morphing reads as none), the
    morph call with its duration, and no call when the scene is already in the mode.
  - **`readout.test.ts`:**
    - degree and height formatting at the 10 km switch
    - the scale steps, including 4,073 km across 100 px → 2,000 km at 49 px
    - non-positive input
    - inset placement, and the antimeridian split
  - **`MapHud.test.tsx`:**
    - dashes before the camera is known
    - the live values, scale and inset box
    - the compass rotation
    - mode selection and change
    - the zoom, reset-north and home callbacks
  - **`view.test.ts`:** the home destination round-trips to 28°N, 80°W, 13,000 km, and the scene
    theme colors.
  - **`Viewer.test.tsx`:** the no-WebGL path. jsdom has no WebGL, so the WebGL path is proven in
    the browser below.
  - **`test-setup.ts`:** now returns `null` from canvas `getContext` in jsdom, which is what a
    browser without WebGL does. That removes jsdom's "Not implemented" noise. The stub is
    skipped in node-environment suites.
- **From outside, in a real browser.** Playwright and headless Chromium (SwiftShader WebGL) ran
  against `vite preview` of the production build, at viewport 1672×941.

  | Step                             | LAT      | LON        | ELEV      | Scale    |
  | -------------------------------- | -------- | ---------- | --------- | -------- |
  | Load, 3D                         | 27.7804° | -80.0000°  | 13,000 km | 1,000 km |
  | 2D Map                           | 0.0000°  | 0.0000°    | 31,891 km | 2,000 km |
  | Split                            | 0.0000°  | 0.0000°    | 22,550 km | 2,000 km |
  | Back to 3D, then Zoom in         | 0.0000°  | 0.0000°    | 19,134 km | 2,000 km |
  | Home view                        | 27.7804° | -80.0000°  | 13,000 km | 1,000 km |
  | Mouse drag 150 px right, 60 down | 39.0400° | -103.4754° | 13,004 km | 1,000 km |
  - Cesium's morphs keep the view center, and the flat maps open on the whole world, so 2D,
    Split and back-to-3D center on 0°, 0°.
  - The 3D latitude reads 27.78°, not 28°, because it is the point under the center of the
    canvas, not the camera's nadir.
  - Zoom in took the height from 31,891 to 19,134 km, which is −40%.
  - The 2D scale is consistent with the map:
    - 984 px across 360° is 40.7 km per pixel, so 100 px is 4,073 km and the bar is 2,000 km at
      49 px.
  - The drag moved the center to 39.04°N, 103.48°W. The full-page capture shows the globe
    centered over Colorado.
  - **Retina:** at `deviceScaleFactor` 2 the canvas is 1968×1054 backing pixels for 984×527 CSS
    pixels.
  - **Resize:** after resizing the viewport to 1280×800, the canvas is 1184×772 for 592×386.
  - **Requests:** every request was same-origin: `/cesium/…`, `/assets/…`, `/v1/system` and
    `/v1/contract`. No ion and no external tiles.
  - No page or console errors or warnings.
  - The captures are the two `review/005-*.png` files, viewed before committing.

- **US English** (`python3 ~/Documents/GitLab/meshdtn/style/check_us_english.py .`): exit 1, with
  1,721 hits. None are in source files this prompt wrote. An earlier draft of this report
  quoted three of the flagged words and had a fourth; the guard caught them and they are reworded.
  - 831 in the vendored `openapi/OpenAPI.json`, unchanged as before.
  - 777 in the generated schema, unchanged as before.
  - 112 in the gitignored `dist/cesium/Cesium.js`, which is Cesium's own code: its color
    constants and status names.
  - 1 inside a sha512 integrity hash in `package-lock.json`, where three letters of the hash
    match a word.
  - None of these were changed.

## Compared to the mockup

The primary Global mockup (`design/Foresignal Global Intelligence Dashboard.png`) against `review/005-cesium-viewer.png`.

What matches:

- A real globe in the map region.
- The scene toggle (top right), compass, zoom and home (right).
- The time box and scrubber (top left), the GLOBAL VIEW inset (bottom left) and the readout with
  scale bar (bottom right), all in the mockup's positions.

Known differences:

1. **Imagery.** The mockup shows a night-lights Earth with clouds and weather radar. The build
   shows daytime Natural Earth II, which has low resolution up close. See question 2.
2. **Framing.** The mockup's camera is closer, so the globe fills and overflows the region. Mine
   shows the whole globe at 13,000 km. That is a one-line change to `HOME_VIEW` if you want it.
3. **No overlays.** Aircraft, ships, satellites, events and the storm come in later prompts.
4. **Map tools.** The mockup's five extra tool buttons below zoom are not here. They belong to the prompts that give them something to do.
5. **The Cesium credit** shows at the bottom left, restyled small and dim. See question 3.

## Owner questions

1. **Split is Columbus view (2.5D).** Architecture.md lines 125–126 map `COLUMBUS_VIEW` to the
   design's Split. No mockup shows what Split looks like when selected. The "Split-Screen"
   mockup file is the Analyst Workbench and Satellite Operations screens side by side, and its
   satellite screen labels the button "Split View". Is Columbus view what you mean, or a true
   split (for example 2D and 3D panes, linked)?
2. **Base imagery.** The bundled Natural Earth II is the only base map that needs no outside
   service. Is there a higher-resolution or night-lights tile source on your LAN or from the
   backend that the client should use?
3. **The Cesium credit.** Cesium draws its logo credit by default, and I left it visible.
   Neither `node_modules/cesium/README.md` nor `LICENSE.md` mentions a credit requirement
   (`grep -i credit` found nothing), so this is your call. Keep it on the map, or move it to an
   About or credits view?
4. **What should the readout track?** The mockup reads `28.3921°, -76.5123°, ELEV 0 m`, which
   looks like a point on the ground (near Florence), not the camera. I show the view center and
   the camera height. Should it follow the mouse pointer, as many GIS tools do, with ELEV as
   ground height?
5. **`vite-plugin-cesium` 1.2.23** was last published on 2024-08-06 (`npm view
vite-plugin-cesium time.modified`). It works with Vite 8.3.4: the production build was
   verified above. Keep it, or switch to `vite-plugin-cesium-engine`?

Earlier questions still open, with defaults in place:

- 004: the Alerts tab, the tagline and the user menu.
- 003: `security.openReads` missing from the live system response, and tile keys needing the
  agent scope.
- 002: `listObjectAnnotations` paging, and Retry-After as an HTTP date.
