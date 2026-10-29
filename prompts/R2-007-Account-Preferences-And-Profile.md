# R2-007 — Account Preferences And Profile

**Goal.** A user's account home: their profile from `getMe`, and editable preferences — timezone,
locale, theme, notification and UI preferences — that the app actually applies.

**Read first.** R2-006-CR; 036-CR (Accessibility-Shortcuts-Onboarding) for the existing theme and
locale plumbing. Backend contract: `openapi/OpenAPI.json`.

**Backend (OpenAPI only).**
- `GET /v1/me` [`getMe`] → `Me` (`user`: `email`, `fullName`, `roles[]`).
- `GET /v1/me/preferences` [`getMyPreferences`] → `UserPreferences` (`timezone`, `locale`, `theme`,
  `notifications`, `ui`).
- `PUT /v1/me/preferences` [`updateMyPreferences`] — body `UserPreferences` → `UserPreferences`.
- `GET /v1/me/notification-preferences` [`listMyNotificationPreferences`],
  `PUT /v1/me/notification-preferences` [`replaceMyNotificationPreferences`].

**Build.**
- An Account / Profile view: identity (email, full name, role names) from `getMe`, with the R2-003
  sign-out action.
- A preferences editor (timezone, locale, theme, UI preferences) over
  `getMyPreferences`/`updateMyPreferences`; applying a change visibly updates the app — reuse the
  036 theme and locale plumbing rather than adding a second path. Gate behind `self.preferences`.
- A notification-preferences editor over the list/replace pair; complete or reuse whatever prompts
  029/030 began, gated as the spec requires (`self.preferences`/`self.alerts`).

**Done when.** The profile renders from `getMe`; preferences round-trip through the API and the
chosen theme and timezone are visibly applied across the app; the view is hidden for a principal
lacking `self.preferences`. Compile-only; tests written not run.

**Commit.** `R2-007: Account Preferences And Profile`;
`completion-reports/R2-007-CR-Account-Preferences-And-Profile.md` (hash + owner questions).
