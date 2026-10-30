# R2-007 — Completion Report: Account Preferences And Profile

| Field                 | Value                                                               |
| --------------------- | ------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule).                   |
| Implementation commit | `6a734d1`                                                           |
| Run mode              | Unattended batch (no pause at this gate).                           |
| Screenshots           | None (compile-only run).                                            |
| Mock comparison       | Not made visually; a new screen, built from the shared UI surfaces. |

## What was built

An Account screen at `/account` (the signed-in identity affordance in the top bar now opens it),
plus the one plumbing it needs to apply a user's choices everywhere.

- **Profile** (`src/account/AccountView.tsx`) — email, full name and role names from `getMe`
  (`useMe()`), with the R2-003 `signOut` action. Anonymous visitors get a sign-in prompt instead.
- **Preferences editor**, gated behind `self.preferences` (`useCan`) — theme (system/light/dark),
  timezone (IANA select, seeded with the browser's zone; empty = server default/UTC), locale, and
  the `UserPreferences.notifications` defaults (email, push, quiet hours). Saves through
  `updateMyPreferences`; the free-form `ui` object is carried through the round-trip untouched.
- **Notification-routing editor** over `listMyNotificationPreferences` /
  `replaceMyNotificationPreferences` — the principal's own rows: toggle `enabled`, change event
  types (the contract's `minItems: 1` is kept), clear quiet hours, remove a row; Save replaces the
  set. `toInput` keeps each row's `id` and channel and omits write-only `secrets`, so stored
  secrets are preserved.
- **`src/account/preferences.ts`** — the API wrappers and a subscribable `PreferencesStore` on the
  `Session`, loaded from `getMyPreferences` at sign-in and cleared when anonymous.

## Applying the choices across the app (reusing one path, not adding a second)

The prompt says to reuse the 036 theme and locale plumbing. **036 left only a static `darkTheme`
and no locale/timezone plumbing at all** — every timestamp was hardcoded to UTC via `utcText`
(`src/intel/analysisView.ts`), and no light theme existed. So the single existing path was
*extended*, not duplicated:

- **One app clock** (`src/app/format/clock.ts`): `utcText` and `dayText` now delegate to
  `formatInstant`/`formatDay`, which read one module-level clock. With no chosen zone the output is
  byte-for-byte the old UTC form (`2025-09-18 14:32Z`), so all 106 `utcText` call sites and the
  existing `analysisView` test are unchanged; with a chosen zone they render in it. `App` sets the
  clock from the preferences store each render (before the tree renders its timestamps), so a saved
  change is visible immediately.
- **Light theme** (`src/app/theme/`): `lightTokens` added alongside `darkTokens` (same shape,
  widened `ThemeTokens` to `string`); `resolveTheme(choice, prefersDark)` maps the preference to a
  theme singleton (`system` follows `usePrefersDark()`); `ThemeProvider` now sets
  `color-scheme` to the resolved theme instead of always `dark`. `App` reads the preferences store
  and passes the resolved theme to the one `ThemeProvider`.

### Light theme contrast (computed this session with `theme/contrast.ts`)

`npx tsx` over `themePairs(lightTokens)` — every pair clears its WCAG 2.x minimum, including muted
text on all three surfaces (which the dark theme does not reach on panel/raised):

| Pair               | page  | panel | raised | held to |
| ------------------ | ----- | ----- | ------ | ------- |
| Body text          | 16.10 | 18.11 | 15.36  | 4.5     |
| Secondary text     | 8.07  | 9.07  | 7.69   | 4.5     |
| Muted text         | 4.95  | 5.57  | 4.72   | 4.5     |
| Accent (large/UI)  | 4.66  | 5.23  | 4.44   | 3       |

Chips on their own backgrounds (each held to 4.5): neutral 8.99, info 6.54, success 6.08,
warning 5.95, danger 6.41, teal 5.80, violet 7.12, orange 5.99. All pass.

## Tests written (not run)

- **`src/app/format/clock.test.ts`** — default UTC "Z" rendering is unchanged; em dash for
  missing/unparseable; a chosen zone renders with its name; `formatDay` honors the zone's day
  boundary; `setClock`/`resetClock`.
- **`src/app/theme/context.test.ts`** — `resolveTheme` for light/dark/system and the dark default.
- **`src/account/preferences.test.ts`** — `getMyPreferences`/`updateMyPreferences` round-trip and
  the store's load/set/clear (msw).
- **`src/account/notificationPreferences.test.ts`** — `toInput` keeps id/channel and drops
  read-only/write-only fields.
- **`src/account/AccountView.test.tsx`** — profile + editor for a `self.preferences` user; a theme
  change saved through `updateMyPreferences`; the editor hidden without the permission; the
  anonymous sign-in prompt.

## Checks

| Check                                                   | Result                              |
| ------------------------------------------------------- | ----------------------------------- |
| `npm run typecheck`                                     | Passed                              |
| `npm run lint`                                          | Passed                              |
| `npm run build`                                         | Passed (pre-existing chunk warning) |
| `npm test`, `npm run e2e`, browser run                  | **Not run** (standing rule)         |
| Guard: `check_us_english.py` over the new/changed files | 0 British spellings                 |

(`npm run generate` was not needed: the API surface was already generated at 2.0.0 in R2-001; this
prompt only consumed existing generated types.)

## Decisions taken (unattended)

1. **`theme` and `timezone` apply through one extended path** (the clock and the theme provider),
   not a parallel one — the only honest reading of "reuse the 036 plumbing", since 036's plumbing
   was a single static theme and UTC-only formatting.
2. **The default clock preserves the exact prior UTC output** so nothing regresses; a zone only
   changes rendering once a signed-in user picks one.
3. **The free-form `ui` object is preserved verbatim**; this client invents no `ui` keys (a `ui`
   key is a cross-client contract — see owner question 2).
4. **The notification-routing editor manages existing rows** (enable/disable, event types, clear
   quiet hours, remove); creating a brand-new channel needs the channel type's own secret config —
   owner question 1.
5. **Only the preferences/notification editors are gated** (`self.preferences`); the profile and
   sign-out stay visible to any signed-in user, and the "view is hidden" requirement is met by
   hiding the editors (with a one-line explanation) rather than the whole page.

## Owner questions

1. **New notification channels.** The editor manages the principal's existing `NotificationPreference`
   rows. Adding a fresh channel requires per-channel-type config and write-only secrets (webhook URL,
   Matrix room, ntfy topic, …). Should this client offer channel creation with a per-type secret form,
   or is that left to another surface (e.g. 018/030 channel setup)?
2. **`ui` preference keys.** `UserPreferences.ui` is free-form (`additionalProperties: true`). Which
   concrete UI preferences should this client define and honor (e.g. density, default landing view),
   given each becomes a persisted cross-client key? Preserved verbatim until decided.
3. **Timezone/locale granularity.** Timestamps now honor the chosen zone/locale app-wide through the
   clock. Should map/chart axis labels and other non-`utcText` formatters also follow it, or stay
   UTC/`en-US` for operational consistency?

Questions carried from R2-001–R2-006 keep their defaults.
