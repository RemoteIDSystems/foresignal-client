# 004 — App Shell & Dashboard Skeleton

**Goal.** The top-level shell every screen lives in — top-nav tabs, routing, dark theme, `ui/`
primitives, layout grid, error boundaries — **and a styled Global Dashboard skeleton with
placeholder data that matches the primary mockup.** This is the first visual review gate: the owner
confirms the overall look here, on day one, before any real-data wiring.

**Read first.** 003-CR; [Architecture.md](../docs/Architecture.md) §2, §5. Design: **all** mockups
in [`design/`](../design/) share the top nav and dark theme — match them.

**Build.**
- **Top nav** matching the design: logo/wordmark, the primary tabs (Global, Analyst, Map, Imagery,
  Satellites, RF/Sensors, Intelligence, Operations), a search box placeholder (wired in 017), a
  notifications bell (wired in 029), settings and user menu.
- **Routing:** client-side only (e.g. `react-router`), mapping each tab to a placeholder under
  `views/`. No server routes.
- **Theme:** dark design tokens + `ThemeContext`; `ui/` primitives — `Button`, `Tab`, `Panel`
  (dockable/closable), `Modal`, `List`, `Badge`, `Toast` host, `Spinner`, `IconButton`.
- **Layout grid:** a central map region with left/right/bottom dockable panel slots (empty
  placeholders now), matching the dashboard composition.
- **ErrorBoundary** wrapping each view; a global toast host.
- **Global Dashboard skeleton:** compose the primary mockup
  (`design/Foresignal Global Intelligence Dashboard.png`) with **placeholder/stub data** — the left
  layers rail, the right selected-entity panel, the bottom activity timeline / insights / related
  panels, the map region (a styled placeholder box until 005 mounts Cesium), and the HUD slots.
  Match the layout, density, dark palette and panel chrome; no backend calls yet. This is the
  reference the later data prompts fill in.

**Done when.** The Global Dashboard skeleton renders to match the mockup's layout with placeholder
data, tabs route, the dark theme is applied, and a tab change swaps the view. A screenshot is saved
to `review/004-app-shell.png`. `typecheck`/`lint`/`build`/`test` pass. **Stop at the review gate:
the owner approves the overall look before 005.**

**Commit.** `004: App Shell & Dashboard Skeleton` (+ the screenshot);
`completion-reports/004-CR-App-Shell.md` (hash + a note comparing to the mockup + owner questions).
