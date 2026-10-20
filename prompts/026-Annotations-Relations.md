# 026 — Annotations And Relations

**Goal.** Let operators annotate objects (notes, verdicts where permitted) and draw operator
relations — the Analyst Notes and evidence tagging in the workbench.

**Read first.** 025-CR; [Architecture.md](../docs/Architecture.md) §11. Design: Analyst Workbench
Analysis Notes (All/My/Shared) and evidence annotation.

**Backend (OpenAPI only).**
- `POST /v1/objects/{ref}/annotations` [`createAnnotation`] (`kind: note`, and `verdict`/
  `propose-watch` where the envelope action allows), `GET /v1/objects/{ref}/annotations`
  [`listObjectAnnotations`], `PATCH /v1/annotations/{id}` [`updateAnnotation`], `DELETE` [`deleteAnnotation`].
- `POST /v1/relations` [`createRelation`], `DELETE /v1/relations/{id}` [`deleteRelation`].

**Build.**
- An Annotations panel on the dossier and workbench: list `listObjectAnnotations`, add a note
  (`createAnnotation kind:note`), edit/delete own notes; render only the actions the envelope offers
  (e.g. `verdict` needs agent scope).
- Draw an operator relation between two selected objects (`createRelation`) and remove it.
- Notes scoping (All / My / Shared) from what the API returns for the caller.

**Match the mock (Analysis Notes).** A notes panel with **All Notes / My Notes / Shared** filters and
`+ Add Note`; each note shows author initials, timestamp, text, and (where allowed) edit/delete.
Evidence annotations attach to objects in the graph/dossier.

**Done when.** A note can be added to an object and appears in its annotations; a relation can be
created and shows in the graph (024); unpermitted actions are not offered. Playwright: add note →
appears.

**Commit.** `026: Annotations And Relations`; `completion-reports/026-CR-Annotations-And-Relations.md` (hash + owner questions).
