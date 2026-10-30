# NP-002 — Edition view & player (my newspaper)

**Goal.** Let a signed-in user read and listen to **their** automated newspaper in the client: the
written edition and a player for the spoken version, with the provenance/corroboration badges and a
share affordance. Presentation only — the engine, scheduling, translation and delivery all live in
the backend; the admin console composes the edition. This surfaces it.

**Prerequisite.** Runs after NP-001 (the 2.1.0 vendor). If NP-001 stopped on its unmet-dependency
guard, this prompt does not run either.

**Read first.** R2-006-CR (RBAC gating / `usePermissions`), R2-007-CR (preferences incl. the user's
language), NP-001-CR (the 2.1.0 vendor). Backend contract: `openapi/OpenAPI.json`.

**Backend (OpenAPI only).**
- `GET /v1/me/editions` [`listMyEditions`] — the caller's editions.
- `GET /v1/briefings/{id}/runs/latest` [`getLatestBriefingRun`] (JSON, and `?format=html`) — the
  current written edition.
- `GET /v1/editions/{id}/site` [`getEditionSite`] — the canonical / feed-key / share URLs.
- `GET /v1/briefings/{id}/podcast.rss` [`getBriefingPodcast`] — the spoken edition (audio
  enclosures) for the player.

**Build.**
- An **Editions** area (new route/view): list the signed-in user's editions (`listMyEditions`);
  open one to read the latest written edition (render the sanitized HTML from `getLatestBriefingRun`
  `?format=html`, or the JSON sections — match the `design/` chrome) and an **audio player** for the
  spoken version (the latest podcast enclosure from `getBriefingPodcast`).
- **Badges.** When the edition carries them (backend NP-007), show each item's provenance ("why this
  is in my paper" → its cross-linked evidence) and corroboration/calibration badge; omit cleanly when
  absent.
- **Share.** A copy affordance for the edition's shareable read-only URL from `getEditionSite`.
- **Gating.** Editions are per-user (self); gate the area on being signed in (R2-006) and show a
  sign-in prompt to anonymous visitors rather than a dead end. The user's output language and source
  view are already their account settings (R2-007 / R2-009) — this view does not re-implement config;
  it links to those where relevant.

**Done when.** A signed-in user sees their editions, reads the current written edition and plays the
spoken one, sees provenance/corroboration badges when present, and can copy a share link; anonymous
users get a sign-in affordance. `npm run typecheck`/`lint`/`build` pass; tests written (not run).

**Commit.** `NP-002: Edition View And Player`;
`completion-reports/NP-002-CR-Edition-View-And-Player.md` (hash + owner questions).
