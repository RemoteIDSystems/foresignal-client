# 036 — Accessibility, Shortcuts, Onboarding

**Goal.** Finish the experience: keyboard shortcuts, onboarding, accessibility, theming polish and
error-boundary coverage across the app.

**Read first.** 035-CR; [Architecture.md](../docs/Architecture.md) §5, §17. Design: the keyboard
shortcuts overlay and first-run affordances implied across the mockups.

**Build.**
- A keyboard-shortcuts system + overlay (toggle layers, switch scene mode, search focus, select/
  clear, time scrub, panel toggles) with discoverable help.
- An onboarding/first-run flow (brief, dismissible) explaining the layout rails and the map modes.
- Accessibility pass: focus management, ARIA on panels/lists/dialogs, keyboard navigation of the
  rails and results, color-contrast check of the dark theme; honor reduced-motion.
- Error-boundary coverage on every view with a recover action; a loading/empty/error state audit on
  each panel.
- Theming polish to match the mockups.

**Match the mock.** The keyboard-shortcuts overlay matches the dashboard's modal styling; onboarding
is brief and dismissible. The final theming pass aligns colors, spacing and typography with the mocks
across every screen.

**Done when.** Shortcuts work and are discoverable; onboarding shows once; the app is keyboard- and
screen-reader-navigable for the core flows; every view recovers from an error. Playwright: shortcut
toggles a layer; keyboard navigates the rail.

**Commit.** `036: Accessibility, Shortcuts, Onboarding`;
`completion-reports/036-CR-Accessibility-Shortcuts-Onboarding.md` (hash + owner questions).
