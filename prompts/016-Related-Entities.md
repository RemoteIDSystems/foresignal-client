# 016 — Related Entities

**Goal.** The Related Entities panel for a selected object (nearby, operational, infrastructure,
historical), driven by the backend.

**Read first.** 014-CR; [Architecture.md](../docs/Architecture.md) §8. Design: Global Dashboard
RELATED ENTITIES panel (Nearby/Operational/Infrastructure/Historical tabs with distances).

**Backend (OpenAPI only).**
- `GET /v1/objects/{ref}/related` [`listRelatedObjects`] — `nearby` (with distance), `operational`
  (relations), `infrastructure` (`depends-on` + touched facilities), `historical` (analogs).

**Build.**
- Right-panel section/tabs rendering the four relation classes from `listRelatedObjects`, each row
  with its type, distance/label and a click → selection (014) and map fly-to.
- Reuse the dossier's `related` section where already fetched to avoid a second call; otherwise call
  `listRelatedObjects` for the full lists.

**Done when.** Selecting an object populates Related Entities with the four classes; a row selects
and flies the map to that object. Playwright: related rows appear and navigate.

**Commit.** `016: Related Entities`; `completion-reports/016-CR-Related-Entities.md` (hash + owner questions).
