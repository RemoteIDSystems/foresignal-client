# 036 — Completion Report: Accessibility, Shortcuts, Onboarding

| Field                 | Value                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete)                |
| Implementation commit | `20ef0ba18772656753309d3d1f9efd9be89ca7d2`                                                             |
| Run mode              | Unattended (owner's batch 023–036, no pausing)                                                         |
| Screenshots           | None taken (compile-only run).                                                                         |
| Mock comparison       | Not made visually. The overlay reuses the dashboard's `Modal`; the welcome reuses the panel's surface. |

## Results

- **Keyboard shortcuts, one system.** A registry (`src/shortcuts/shortcuts.ts`) holds the
  shortcuts that work on the screen shown now. Each screen or control registers its own while it is
  mounted, and one window listener in the app shell hands key presses to the registry. Presses are
  ignored:
  - with Ctrl, Alt or Meta held;
  - while typing in a text field, text area, select or editable content;
  - while a dialog (`aria-modal="true"`) is open.

  When two registrations share a key, the newest wins.

| Key      | Where           | What it does                                                                 |
| -------- | --------------- | ---------------------------------------------------------------------------- |
| `?`      | Everywhere      | Opens the keyboard shortcuts overlay                                         |
| `/`      | Everywhere      | Focuses the search box                                                       |
| `1`–`9`  | Global map      | Toggles the rail's first nine categories, as each category checkbox does     |
| `M`      | Global map      | Switches between 2D Map and 3D Globe                                         |
| `F`      | Global map      | Flies to the selected object (nothing when nothing with a place is selected) |
| `Esc`    | Global map      | Clears the selection (listed; the map already handles the key)               |
| `L`, `I` | Global map      | Hides or shows the Layers and Selected Entity panels                         |
| `[`, `]` | Global time HUD | Steps the time back or forward 10 minutes                                    |
| `N`      | Global time HUD | Returns to live                                                              |

- **Discoverable.** The overlay ("Keyboard shortcuts") opens with `?` or with a new keyboard button
  in the top bar, beside Settings. It lists the registered shortcuts by group (General, Map,
  Layers, Time, Panels), each key in a `<kbd>`, so it always shows what works where the person is.
- **Onboarding, once.** A first-run welcome sits under the top bar, in the page, so it covers
  nothing. It has three short steps:
  - the rails and panels;
  - 2D Map and 3D Globe (and `M`);
  - search and shortcuts (`/` and `?`).

  **Got it**, **See the shortcuts** or its close button dismisses it, and this browser remembers that
  (`localStorage` `foresignal.onboarded`, read and written inside `try`). The overlay's **Show the
  welcome again** brings it back.

- **Focus management.**
  - **Dialogs.** Every `Modal` now keeps Tab and Shift+Tab inside itself, wrapping at either end.
    Focus goes into the dialog on open and back to where it was on close, as before.
  - **Skip link.** "Skip to the main content" is the first Tab stop. It is shown only while focused
    and moves focus to `<main id="main">`.
- **Keyboard navigation of the rails and results.** Up, Down, Home and End walk:
  - the Layers rail's checkboxes;
  - the Analysis rail's entries;
  - the RF & Sensors catalog's sensor list.

  Tab still leaves each list as usual. Disabled entries are skipped.

- **Color contrast of the dark theme** (`src/app/theme/contrast.ts`, the WCAG 2.x formula over the
  theme tokens), computed this session with `npx tsx` over `themePairs(darkTokens)`:

| Pair                       | Page  | Panel | Raised | Held to |
| -------------------------- | ----- | ----- | ------ | ------- |
| Body text                  | 17.31 | 15.72 | 13.29  | 4.5     |
| Secondary text             | 9.26  | 8.41  | 7.11   | 4.5     |
| Muted text (hints, labels) | 4.66  | 4.23  | 3.58   | 3       |
| Accent                     | 7.86  | 7.14  | 6.04   | 3       |

Chip text on its own background, each held to 4.5:

- neutral 8.31;
- info 5.72;
- success 5.62;
- warning 5.94;
- danger 6.09;
- teal 6.81;
- violet 6.53;
- orange 5.93.

Every pair meets the minimum it is held to. **Muted text does not reach 4.5:1 on panels (4.23)
or raised surfaces (3.58).** It is held to the 3:1 large-text and interface minimum here, the
tokens are unchanged, and owner question 1 asks about it.

- **Reduced motion.** With `prefers-reduced-motion: reduce`:
  - CSS transitions and animations finish at once (`global.css`);
  - the map's camera flights (home, focus, locate) and the 2D/3D morph run with a duration of 0
    (`lib/motion.ts`), so they jump to where they end.
- **Error boundaries with a recover action.** Every routed view sits in the shell's boundary,
  which is keyed by path, so navigating away resets it. It offers **Retry**, and on any view but
  Global also **Go to Global**. The Global dashboard's panels and its map each keep their own
  boundary with **Retry** (`DashboardLayout`, as before).

## What was built

- `src/shortcuts/shortcuts.ts`:
  - `ShortcutRegistry` and the `shortcuts` singleton;
  - `useShortcuts`, `useShortcutList`, `useShortcutListener`;
  - `isTyping`, `groupShortcuts`, `SHORTCUT_GROUPS`.
- `src/shortcuts/globalShortcuts.ts`: `globalShortcuts`, `categoryToggle`, `toggleClosed`,
  `otherScene`, `CATEGORY_KEYS`.
- `src/shortcuts/arrowNavigation.ts`: `nextItem`, `useArrowNavigation`.
- `src/shortcuts/ShortcutsDialog.tsx` and `Shortcuts.module.css`.
- `src/onboarding/onboarding.ts`: `ONBOARDED_KEY`, `onboarded`, `markOnboarded`, `WELCOME_STEPS`.
  `src/onboarding/WelcomeCard.tsx`.
- `src/app/theme/contrast.ts`: `luminance`, `contrast`, `themePairs`, `AA_TEXT`, `AA_LARGE`.
- `src/lib/motion.ts`: `prefersReducedMotion`, `motionSeconds`.
- Store keys `shortcutsOpen` and `welcomeOpen` (`src/state/store.ts`).
- Edited:
  - `ui/Modal.tsx`: the focus trap;
  - `app/AppShell.tsx`: the listener, `?`, the welcome, the skip link, `main#main`, the
    boundary's way home;
  - `app/ErrorBoundary.tsx`: `onHome`;
  - `app/TopNav.tsx`: the keyboard button;
  - `app/SearchBox.tsx`: `/`;
  - `views/global/GlobalDashboard.tsx`: the map's keys;
  - `views/global/TimeHud.tsx`: the time keys;
  - `views/global/LayersRail.tsx`, `views/analysis/AnalysisRail.tsx`,
    `views/rf/RfSensorsView.tsx`: the arrow keys;
  - `map/focus.ts`, `map/Viewer.tsx`: reduced motion;
  - `app/global.css`.
- `playwright.config.ts`: every check now starts with the welcome dismissed (a storage state with
  `foresignal.onboarded`), so the checks before 036 see the page they were written for. The
  accessibility spec's first-run checks clear it.

## How it was checked

### Tests (written, not run)

- `shortcuts/shortcuts.test.ts` (9):
  - a key runs its shortcut;
  - modifiers, typing and an open dialog are left alone;
  - the newest registration wins and the older one returns;
  - subscribers are told, with a new list each time;
  - a listed-only shortcut does not run;
  - `isTyping`;
  - grouping in order, each key once.
- `shortcuts/globalShortcuts.test.ts` (9):
  - a category turned on when any kind or curated product is off, and off when all are on;
  - kinds only for a category without products;
  - panels toggled and sorted;
  - 2D and 3D swapped;
  - `1`–`9` for the first nine categories only;
  - each key runs its action;
  - `Esc` listed without running;
  - `F` with nothing selected.
- `shortcuts/arrowNavigation.test.tsx` (3): moving and skipping disabled items, Home and End, and
  walking a rendered rail.
- `shortcuts/ShortcutsDialog.test.tsx` (7):
  - the overlay lists by group with keys;
  - it follows the registry while open;
  - **Show the welcome again** works;
  - nothing renders while it is closed;
  - the welcome's three steps, with dismissal remembered;
  - **See the shortcuts**;
  - the close button.
- `onboarding/onboarding.test.ts` (3): marking and reading, refusing storage, and the steps
  naming the keys.
- `app/theme/contrast.test.ts` (3): the formula at its fixed points, every pair at its minimum, and
  every chip tone checked.
- `lib/motion.test.ts` (3): the media query, a throwing query, and 0 seconds with reduced motion.
- `ui/ui.test.tsx` (1 more): Tab and Shift+Tab wrap inside a `Modal` and never reach outside.
- `app/ErrorBoundary.test.tsx` (1 more): **Go to Global** when given `onHome`, and not otherwise.
- `app/App.test.tsx`: marks the welcome dismissed before each test.
- `e2e/accessibility.e2e.ts` (10), against the live backend:
  - **a number key toggles a layer**: `1` flips the first rail category's `data-category-state`
    and back;
  - `M` switches the scene mode and the tab;
  - `L` hides and shows the Layers panel;
  - `?` opens the overlay with every group, Tab stays inside, and Escape closes it;
  - the top bar button opens it too;
  - `/` focuses the search, where `m` is typed rather than run;
  - **the keyboard navigates the rail**: Down and Up move between category checkboxes;
  - the skip link is the first stop and focuses `main`;
  - the welcome shows on a first run, and not again after **Got it** and a reload;
  - the overlay shows the welcome again.

### Checks

| Check                                                       | Result                                                                                                                                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                         | Passed                                                                                                                                                                  |
| `npm run lint`                                              | Passed                                                                                                                                                                  |
| `npx prettier --check src e2e`                              | Passed (and `scripts`, `playwright.config.ts`)                                                                                                                          |
| `npm run build`                                             | Passed. `index` 884.32 kB (266.19 kB gzip); 875.55 kB at 035, measured by building 035 in a temporary worktree                                                          |
| `npm run verify:dist`                                       | "✓ dist is ready to deploy."                                                                                                                                            |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                                                                                                                                             |
| Guard: `test_us_english.py`                                 | 14 tests OK (171.3 s)                                                                                                                                                   |
| Guard: `check_us_english.py` over the project               | 804 hits, unchanged                                                                                                                                                     |
| Guard: `check_us_english.py` over the new and changed files | 2 hits, both `App.test.tsx:214,219`: the backend's attribution JSON key, which it spells the British way. A wire name, unchanged (the file was touched for the welcome) |

## Compared to the mock

**Matches**

- The overlay is the dashboard's `Modal`: the same surface, title bar, Escape and backdrop as
  Settings and Workspaces. Keys are drawn as small bordered chips in the theme's border and panel
  colors.
- The welcome is brief, three steps, and dismissible in one click. It uses the panel surface and
  the button variants already on screen.

**Differs**

- The mocks show no shortcuts overlay or first-run card. Both are drawn from the existing modal and
  panel styles rather than a mock.
- **Theming polish was not done visually.** No screenshot was taken, so no screen was compared to
  its mock for color, spacing or typography in this pass (deviation below).

## Decisions taken (unattended run)

1. **Shortcuts are registered by the screens that carry them out**, rather than one global table.
   The overlay then lists only keys that work where the person is, and a screen's keys stop when
   it closes.
2. **Single keys without modifiers**, ignored while typing or while a dialog is open, so they never
   fight the browser's or a field's own keys.
3. **`1`–`9` follow the rail's order**, the categories that have kinds. The backend's tile index
   has 190 kind layers across all 13 categories, so keys reach the first nine (Events through
   Cyber / Network). Energy / Power, Disasters / Hazards, Conflicts / Security and Other have no
   key. A key does exactly what that category's checkbox does, kinds and curated products
   together.
4. **`F` flies over the selection** (the same locate request search uses), at the current height.
5. **The welcome is in the page, not a modal**, so the first run is not blocked and nothing is
   covered.
6. **Muted text is held to 3:1**, as hints and labels, not body text. The tokens were not changed
   without the owner (question 1).
7. **Reduced motion cuts camera and morph durations to 0**, rather than shortening them.
8. **Earlier end-to-end checks start onboarded** (Playwright storage state), rather than each
   dismissing the welcome.

## Deviations from the prompt text

- **"Theming polish to match the mockups … across every screen"**: not done. A visual pass needs
  screenshots, which the standing rule defers. No token or spacing was changed by eye.
- **"A loading/empty/error state audit on each panel"**: not done as a separate audit. No panel's
  states were changed in this pass. Earlier prompts built each panel's loading, empty and error
  states.
- **"ARIA on panels/lists/dialogs"**: covered where this pass touched them (the overlay's grouped
  regions and definition lists, the welcome's region, the skip link and `main`). Earlier screens'
  ARIA was not re-audited.
- **"Screen-reader-navigable"**: not checked with a screen reader (no test execution).

## Backend observations

From curl run in this session:

- `GET /v1/kinds` lists one kind: `earthquake`, with 826 current records.
- `GET /v1/tiles.json` lists 596 layers, 190 of them kind layers. The rail's categories, and so
  the number keys, come from those.

## Owner questions

1. **Muted text contrast.** `textMuted` is 4.23:1 on panels and 3.58:1 on raised surfaces. That
   passes 3:1 for large text and interface marks, but not 4.5:1 for body text. Should it be
   lightened to reach 4.5:1 everywhere? **Default in place: tokens unchanged, held to 3:1.**
2. **The shortcut keys.** Are the keys right, notably `L`/`I` for the panels and `[`/`]` for
   10-minute steps? Should categories 10–13 get keys? **Default in place: the table above; 10–13
   have no key.**
3. **The welcome.** Three steps under the top bar, or a guided tour pointing at each rail? **Default
   in place: the three-step card, once per browser.**
4. **Theming pass.** Should the visual alignment with the mocks be its own prompt once screenshots
   are allowed? **Default in place: not done.**

Questions still open from earlier reports keep their defaults.
