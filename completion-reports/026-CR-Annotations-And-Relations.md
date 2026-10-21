# 026 — Completion Report: Annotations And Relations

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete) |
| Implementation commit | `6f580251ebc629e49e909514486b56295bbcf988`                                              |
| Run mode              | Unattended (owner's batch 023–036, no pausing)                                          |
| Screenshots           | None taken (compile-only run). The e2e specs take none either.                          |
| Mock comparison       | From the Analyst Workbench mock (read in this session) and the code, not a screenshot.  |

## Results

- **An Analysis Notes panel** (`AnnotationsPanel`) lists the notes and verdicts the caller can see
  on one object (`listObjectAnnotations`). It has:
  - **All Notes / My Notes / Shared,** each with its count, as the mock draws them;
  - **Add Note:** a text box, a **Private** box, Save note and Cancel (`createAnnotation`,
    `kind: note`);
  - for each note, newest first: the author's initials in a circle, their name, the time, "edited"
    when edited, the verdict in the backend's word, "private" when private, and the text;
  - **Edit note** and **Delete note** on the caller's own notes, or on any note for an admin
    (`updateAnnotation` as a merge patch; `deleteAnnotation` after an inline "Delete this note?");
  - **Record verdict** (`confirmed`, `rejected`, `needs-review`, `duplicate-of` with its ref), only
    for a token with agent scope.
- **Only what the envelope offers is shown.** Add Note needs a `POST …/annotations` action in the
  object's envelope; drawing a relation needs `POST /v1/relations`. Without a token the panel says
  "Notes need an access token. Add one in Settings."
- **Where it appears:**
  - the Selected Entity dossier on the map, as a new **Notes** tab;
  - the Analyst Workbench's SELECTED ENTITY panel, under Key Evidence, for the selected node;
  - the workbench's WORKSPACE rail: **Notes** (024 left it disabled) opens the investigation's or
    situation's own notes above the side panel;
  - the full analysis's AI Analysis drawer: its **Analyst Notes** tab (023 left it empty) shows a
    situation's notes.
- **Relations in the workbench:**
  - **Draw a Relation** under Key Evidence: another object in the graph, the relation type and an
    optional label, in the backend's words (`createRelation`, confidence 1). The graph is read
    again and shows it (024).
  - **Retire this relation** on a Key Evidence row, only for an operator relation (`projected:
false`); projected relations are never offered (`deleteRelation`).

## What was built

- **`annotations/annotationApi.ts`:** list (flat; threads flattened), note, verdict, edit, delete,
  draw and retire a relation, `getCaller` (`getMe`, once per client) and `getAuthor`
  (`getPrincipal`, once per client and id).
- **`annotations/annotationView.ts`:** `scopeNotes`, `initials`, `notePermissions`, `canChange`,
  `canRelate`.
- **`annotations/AnnotationsPanel.tsx`** and `Annotations.module.css`; **`ObjectNotes.tsx`** reads
  an object's envelope for its actions, then shows the panel.
- **`graph/graphView.ts`:** a `ViewEdge` carries `projected`.
- **Workbench:** `GraphSidePanel` (the relation form, retire buttons and notes), `EvidenceGraph`
  (`version`, to read the graph again), `WorkbenchView` (the Notes rail entry).
- **`SelectedEntityPanel`** (the Notes tab) and **`AnalysisView`** (the Analyst Notes tab).

## How it was checked

### Tests (written, not run)

- `annotations/annotationApi.test.ts` (6): flat and threaded lists; note and verdict bodies; edit as
  a merge patch, and delete; draw and retire a relation; the caller read once, and again after a
  failure; authors read once.
- `annotations/annotationView.test.ts` (5): the three scopes; initials; note and verdict
  permissions; who may change a note; when relations are offered.
- `annotations/AnnotationsPanel.test.tsx` (8): the list with initials, names, times and counts; My
  and Shared; adding a note; editing and deleting only one's own; nothing offered without the
  envelope's action; a verdict with agent scope; the token message; a failed save.
- `views/workbench/GraphSidePanel.test.tsx` (4): drawing a relation and its body; retiring an
  operator relation and not a projected one; a failed draw; nothing offered without the action.
- `views/workbench/WorkbenchView.test.tsx` (+1): the rail's Notes opens the investigation's notes.
- `views/global/SelectedEntityPanel.test.tsx` (+1): the dossier's Notes tab.
- `graph/graphView.test.ts`: the edge now carries `projected`.
- `e2e/annotations.e2e.ts` (1): add a note to a workbench node; it appears with the author's name
  and initials, and is there again after a reload; an object whose envelope offers no note action
  shows no Add Note. The notes are stand-ins kept by the spec.
- `e2e/workbench.e2e.ts`: stand-ins for the side panel's new notes and `getMe` reads, which would
  otherwise log 401s.

### Checks

| Check                                                       | Result                                     |
| ----------------------------------------------------------- | ------------------------------------------ |
| `npm run typecheck`                                         | Passed                                     |
| `npm run lint`                                              | Passed                                     |
| `npx prettier --check src e2e`                              | Passed                                     |
| `npm run build`                                             | Passed. `index` 743.37 kB (226.24 kB gzip) |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                |
| Guard: `test_us_english.py`                                 | 14 tests OK (170.7 s)                      |
| Guard: `check_us_english.py` over the project               | 797 hits, unchanged                        |
| Guard: `check_us_english.py` over the new and changed files | `[]`                                       |

## Compared to the mock

From `design/ForeSignal_Analyst_Workbench.png` against the components; no screenshot was taken.

- **Matches:** Analysis Notes at the foot of the right-hand panel, with `+ Add Note`; the All Notes /
  My Notes / Shared filters with counts; each note's initials circle, timestamp and text.
- **Differs:**
  - **The initials circles** are one neutral color, not one color per author.
  - **The WORKSPACE rail** has Workspaces and Notes; the mock's separate **Annotations** and
    **Export** entries are not added. Notes covers annotations, and Export is in the header.
  - **The mock's notes** show no author name; the panel adds it next to the initials.

## Decisions taken (unattended run)

1. **Scopes:** My Notes is the caller's own (`author` is the caller's principal id from `getMe`);
   Shared is every note that is not private, the caller's included; All is everything returned.
   Deleted notes and replies are not listed.
2. **Permissions:** notes follow the envelope's `POST …/annotations` action; verdicts also need a
   non-read scope in `getMe`'s `scopes`; edit and delete need authorship or admin scope.
3. **Author names** come from `getPrincipal` (summary for read scope), falling back to the
   principal id.
4. **Relations** are drawn from the selected node to another node in the graph, at confidence 1 and
   not private; the label is optional.
5. **Delete** asks inline ("Delete this note?"), not with a browser dialog.
6. **Analyst Notes** in the AI Analysis drawer shows the situation's notes; an investigation has no
   assessment there (023).

## Deviations from the prompt text

- **`propose-watch`:** `AnnotationInput.kind` is `note` or `verdict` only (OpenAPI). There is no
  `propose-watch` annotation kind to offer, so none is built.
- **Threads:** `replyToAnnotation` and `resolveAnnotation` exist, but the prompt does not ask for
  them; replies are not listed.
- **"Draw an operator relation between two selected objects":** the app selects one object at a
  time, so the second is chosen from the graph's other nodes.
- **Playwright:** written, not run (standing rule). The notes are stand-ins, because the local
  backend needs a token for them.

## Backend observations

- **Local, without a token** (curl, this session): `GET …/annotations`, `GET /v1/me`,
  `POST /v1/relations` and `GET /v1/principals/x` all answered **401**. `POST …/annotations`
  answered
  `{"detail":"This operation needs a token.",…,"status":401,"title":"Unauthorized","code":"UNAUTHORIZED"}`.
- **Envelope actions:** an earthquake's dossier answered `"actions": []` without a token, so the
  real hrefs of a note or relation action were not seen. The client matches on the path
  (`…/annotations`, `/v1/relations`), not on an action id.
- **Annotation authors** are principal ids only; a name needs one `getPrincipal` per author.

## Owner questions

1. **Action hrefs.** What are the envelope's note and relation actions' `id` and `href` with a
   token? **Default in place: matched on a `POST` whose path ends `/annotations` or
   `/relations`.**
2. **Shared.** Is Shared "not private" (the caller's included) or "others' notes"? **Default in
   place: not private.**
3. **propose-watch.** Which operation is "propose-watch where the envelope allows"? **Default in
   place: not offered.**
4. **Threads.** Should notes show replies and resolve, as `replyToAnnotation` and
   `resolveAnnotation` allow? **Default in place: roots only.**
5. **Author names on annotations.** Should `Annotation` carry the author's display name, so the
   list needs no `getPrincipal` per author? **Default in place: one read per author, cached.**

Questions still open from earlier reports keep their defaults.
