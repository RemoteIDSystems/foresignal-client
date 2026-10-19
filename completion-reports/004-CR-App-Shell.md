# 004 — Completion Report: App Shell & Dashboard Skeleton

| Field                 | Value                                                            |
| --------------------- | ---------------------------------------------------------------- |
| Status                | Complete — **first visual review gate**                          |
| Implementation commit | `5e926eefd3776c0df05632965bf001ac27d320e4`                       |
| Screenshot            | `review/004-app-shell.png` (1672×941, the mockup's own size)     |
| Side by side          | `review/004-app-shell-vs-mockup.png` (mockup above, build below) |

## What was built

- **Top nav** (`src/app/TopNav.tsx`). It has the logo and wordmark and the 8 tabs from the
  prompt: Global, Analyst, Map, Imagery, Satellites, RF / Sensors, Intelligence, Operations.
  The search box is read-only until 017, and the notifications bell does nothing until 029.
  The gear opens Settings. An access menu shows "Open access / No token" or "Token access /
  `fsr_xxxx…`" from the real token store; no user identity is invented.
- **Routing** (`react-router` 8.4.0, client-side only). Each tab is a route under `AppShell`:
  `/global`, `/analyst`, `/map`, `/imagery`, `/satellites`, `/rf-sensors`, `/intelligence`,
  `/operations`, plus `/settings`. `/` and unknown paths redirect to `/global`.
- **Theme.** `src/app/theme/tokens.ts` is the single source of the dark palette, with colors
  measured from the mockups (page `#01050b`, panel `#0c141c`, accent `#24a8fc`, tag tones).
  `ThemeProvider` publishes the tokens as `--fs-*` CSS variables before first paint, and
  `useTheme()` gives the same values to non-DOM renderers (Cesium and deck.gl later). The font
  is Inter Variable, bundled through `@fontsource-variable/inter`; there are no external font
  requests.
- **`ui/` primitives.**
  - `Button` and `IconButton`.
  - `Tabs`: underline, boxed and pill variants, with arrow-key navigation.
  - `Panel`: title chip, header slot, actions, collapse and close.
  - `Modal` (portal, Escape, focus return), `List`, `Badge` (tag and count, tone pairs),
    `Spinner`, and a `ToastHost` with `useToast()`.
- **Layout** (`src/app/DashboardLayout.tsx`). A central map region with left, right and bottom
  dock slots. Panels declare their slot. Closing a panel removes it, an empty side slot
  collapses so the map widens, and a restore bar brings closed panels back.
- **Error boundaries.** One per routed view (reset on route change) and one per dock panel and
  the map, so a failing panel leaves the rest working. A global toast host wraps the app.
- **Global Dashboard skeleton** (`src/views/global/`). It follows the primary mockup:
  - **Layers rail:** LAYERS / ENTITIES / FILTERS, 13 rows with working checkboxes, icons and
    count pills, and Add Layer.
  - **Map region:** a styled globe placeholder with every HUD slot. Time and LIVE, the
    −24h…+24h scrubber, and a working 2D Map / 3D Globe / Split toggle. Also north, zoom and
    tool buttons, the GLOBAL VIEW inset, and the LAT / LON / ELEV / scale readout.
  - **Selected Entity:** title, tags, ID, Overview / Imagery / Forecast / Impacts / Related
    tabs, the imagery placeholder and facts, Track / Add to Workspace / more, and the forecast
    track sketch with its legend.
  - **Bottom row:** Recent Imagery (source tabs, image, sensor chip, 6 thumbnails), Activity
    Timeline (10 categorized rows), Analytics & Insights (4 tabs, 5 ranked items with
    percentages and level, View Full Analysis), and Related Entities (4 tabs, 5 rows with
    status).
  - **Placeholder data:** everything is in `placeholderData.ts`, transcribed from the mockup.
    Each block names the prompt that replaces it. The map shows a "Skeleton · placeholder data"
    chip so nobody mistakes it for live data. No backend calls on this screen.
- **Other tabs** render a placeholder screen naming what they will be and which prompt builds
  them.
- **Dev proxy** (from the planner's Architecture change, commit `3a29175`). `vite.config.ts`
  proxies `/v1`, `/mcp` and `/actuator` to `VITE_FORESIGNAL_BACKEND` (default
  `http://localhost:8080`, the spec's `servers[0].url`) for `vite` and `vite preview`. The app
  is now same-origin in dev too. That makes my 003 CORS question moot for the client. The README
  is updated.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build`, `npx prettier --check .`: pass.
- `npm test`: 17 files, 73 tests, pass, no warnings. They cover:
  - routing: `/` opens Global; clicking a tab swaps the view and sets `aria-current`; all 8
    tabs route; unknown paths redirect; the gear opens Settings
  - the dock: slots, close, collapse and restore, and a throwing panel isolated
  - `ErrorBoundary` retry
  - theme variables
  - `Tabs` keyboard, `Panel` collapse and close, `Modal` Escape, and toast timeout and dismiss
  - the 003 Settings tests, now through the `/settings` route
- **From outside, in a real browser** (Playwright and Chromium against `npm run dev`, viewport
  1672×941):
  - `/` redirected to `/global` and the dashboard rendered.
  - Computed body background `rgb(1, 5, 11)` and panel background `rgb(12, 20, 28)`. Screenshot
    pixel reads: gutter `#00040a`, nav `#020a12`, rail `#0c141c`.
  - `Inter Variable` loaded.
  - Clicking each of the 7 other tabs changed the path, showed that view's heading and removed
    the dashboard. Global brought the dashboard back, and the browser Back button returned to
    `/operations`.
  - Closing Selected Entity removed it and showed a restore button; restoring brought it back.
  - Settings, through the dev proxy, read backend version `1.0.0`. The requests were
    same-origin: `200 http://localhost:5179/v1/system` and `/v1/contract`.
  - No page or console errors.
- US English: no hits in files this prompt wrote.

## Compared to the mockup

See `review/004-app-shell-vs-mockup.png`. Layout, proportions, density and panel chrome match:

- left rail 262 px, right panel 400 px, bottom row 338 px with four panels in the mockup's
  width ratios
- the same panel titles, tabs, rows, chips and HUD positions, and the measured dark palette

Known differences:

1. **The map is a placeholder globe**, not imagery. Cesium arrives in 005.
2. **Imagery, thumbnails and the storm picture are gradient stand-ins.** The client has no
   image assets and won't invent any; 014 and 028 bring the real ones.
3. **Icons come from the lucide set** and are close to the mockup's but not identical. The
   storm icon in particular is a generic glyph.
4. **The nav uses the single-line tab style** shared by 5 of the 6 mockups, not the primary
   mockup's two-line boxed tabs. See question 1.
5. **Controls with nothing to do yet are inert**, for example Track, Add to Workspace, View Full
   Analysis, Add Layer, the map tools and the bell. Tabs, the scene toggle, layer checkboxes,
   thumbnail selection, close and restore work.

## Owner questions (decide before or during 005; none block it technically)

1. **Nav tabs disagree across the mockups.**
   - The primary mockup has 6 two-line tabs: Global / Analyst / Satellite / Sensors /
     Intelligence / Operations, with subtitles.
   - The other 5 mockups have 9 single-line tabs. Those are the prompt's 8 plus **Alerts**.
   - The Tropical Storm mockup instead has Overview / Investigations / Map / Imagery /
     Satellites / RF / Sensors / Intelligence / Alerts.

   I built the prompt's 8 in the single-line style. Should **Alerts** be a tab (029) as well as
   the bell?

2. **Two taglines.** The primary mockup says "PERSISTENT INTELLIGENCE. CLEARER DECISIONS."; the
   other 5 say "INTELLIGENCE. AHEAD.", which is what I used. Which one?
3. **User menu.** The mockups show "Analyst / Foresignal Lab" with initials. The client has no
   user identity yet, so it shows the access state instead. Is there a backend identity to show
   later? I haven't looked for one yet; that is 025's principals.
