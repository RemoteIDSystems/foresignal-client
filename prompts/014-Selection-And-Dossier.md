# 014 — Selection And Dossier

**Goal.** Selecting an object opens the right-hand detail panel from the backend's composed
**dossier**, with action buttons rendered from the object's `actions`.

**Read first.** 013-CR; [Architecture.md](../docs/Architecture.md) §8. Design: Global Dashboard
SELECTED ENTITY panel (Overview/Imagery/Forecast/Impacts/Related tabs, Track/Add-to-workspace/… actions).

**Backend (OpenAPI only).**
- `GET /v1/objects/{ref}` [`getObject`] — the object envelope (`title`, `summary`, `severity`,
  `geometry`/`bbox`, `tags`, `provenance`, `links`, `actions`).
- `POST /v1/objects/resolve` [`resolveObjects`] — batch resolve references.
- `GET /v1/objects/{ref}/dossier` [`getObjectDossier`] — `overview`, `imagery`, `forecast`,
  `impacts`, `related`, `timeline`, `analysis` (each with a per-section status).

**Build.**
- `lib/objectRef.ts`: parse/format `{type}:{id}` refs (one path segment, percent-encoded).
- Map picking (010) sets `selection` in the store; a selection highlight + callout on the map.
- **Contextual 3D:** when the selected item's kind has an applicable 3D view (altitude track, orbit,
  storm structure, …), switch the scene to `SCENE3D` and fly to the item; otherwise keep the 2D map
  and fly/focus it. Scene state lives in the store (012). This is the primary way the user enters 3D.
- Right panel: render the dossier with the design's tabs; each section renders to its `status`
  (`ok`/`empty`/`unavailable`/`not-installed`) so a failed section degrades gracefully.
- Render action buttons **from the envelope `actions`** (method + href + scope), not hard-coded
  permissions; wire the read-scope ones (e.g. add-to-workspace in 025, annotate in 026).
- `If-None-Match` on the dossier (it carries an ETag).

**Done when.** Clicking a map feature opens its dossier with populated sections and the correct
action buttons; a 3D-applicable item switches the scene to 3D and flies to it while a 2D-only item
stays in 2D; an unavailable section shows its message while others render. Playwright: select →
panel populated and the scene behaves per the item's 3D applicability.

**Commit.** `014: Selection And Dossier`; `completion-reports/014-CR-Selection-And-Dossier.md` (hash + owner questions).
