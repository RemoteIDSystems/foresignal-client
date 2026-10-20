# 016 — Completion Report: Related Entities

| Field                 | Value                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Status                | Complete                                                                                                          |
| Implementation commit | `cf121247149f97863ecd7e817923232496143f5b`                                                                        |
| Run mode              | Unattended (owner's batch 015–018, no review gates)                                                               |
| Screenshots           | `review/016-related-entities.png` (a live earthquake selected, its related lists from a stand-in dossier section) |
| Mock comparison       | `review/016-vs-global-mock-related.png` (the mock's RELATED ENTITIES panel beside the built one)                  |

## Results

The Related Entities panel now shows what is related to the selected object, in the mock's four
tabs. In `e2e/related-entities.e2e.ts`:

**Against the live backend:**

- A live earthquake is selected from an Activity Timeline row (015).
- The panel says "No related objects for this object.": the live dossier's related section is
  `empty`, and `listRelatedObjects` returns `"items":[]` (curl, below).
- The two panels share one dossier read: no two dossier reads were ever in flight at once. The
  selection's own read comes first, and the live stream may revalidate later. No
  `listRelatedObjects` call is made.

**With a stand-in related section** (on the live earthquake's live dossier):

- Nearby lists two rows, nearest first, with distance and status (one is a second live
  earthquake).
- Operational and Historical show their rows (the counts per tab are `2 1 0 1`).
- A click on the second earthquake's row:
  - selects it on the map (`data-selected`);
  - opens its live dossier;
  - flies the map to it (within 40 px of the middle).
- The panel then shows the second earthquake's own (empty) related objects.

## What was built

- **`objects/relatedApi.ts`**:
  - `listRelatedObjects` (up to 500, both directions, `asOf` while pinned);
  - `useRelatedObjects`, which reads only when it is wanted.
- **`objects/objectApi.ts`**: reads of one dossier made while another is in flight share its
  request. Each caller's own abort still cancels only its wait.
- **`views/global/useSelectedDossier.ts`**: the selected object's ref and dossier (as of the time
  machine, refreshed by the live stream). Both the Selected Entity and Related Entities panels
  use it.
- **`views/global/relatedView.ts`**:
  - each relation type's class (Nearby, Operational, Infrastructure, Historical) for the flat
    list;
  - grouping, with Nearby nearest first;
  - distances (`45 km`, `420 m`);
  - the relation text when there is no distance (Depends on, Causes (likely));
  - status tones and type icons.
- **`RelatedEntitiesPanel`** (its own file) replaces the placeholder:
  - the four tabs;
  - rows with a type icon, name, type tag, distance or relation, status and chevron;
  - each row a button that selects its object;
  - lines for no selection, loading, error, the section's own status, and an empty tab.
- **The full list.** When the dossier's related section is `truncated`, the panel reads
  `listRelatedObjects` and sorts it into the four classes.
- The placeholder rows were deleted from `placeholderData.ts`.

## How it was checked

### Tests

- `views/global/relatedView.test.ts` (4): classes per relation, grouping and the nearest first,
  distance and relation text, status tones and type icons.
- `objects/relatedApi.test.ts` (1): the ref as one segment, `limit` 500, `direction=both`, `asOf`.
- `objects/objectApi.test.ts` (5, one new): reads in flight share one request; one caller's abort
  does not cancel the other; a later read asks again.
- `views/global/RelatedEntitiesPanel.test.tsx` (4):
  - no selection;
  - the dossier's classes, beside the Selected Entity panel with one request between them, then
    the tabs, the relation label, and a row's selection;
  - a truncated section reads the full list and sorts it;
  - a section's own status message.
- `e2e/related-entities.e2e.ts` (2): as in Results.

### Checks

| Check                               | Result                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `npx tsc --noEmit -p .`             | pass                                                                                 |
| `npx eslint .`                      | pass                                                                                 |
| `npx prettier --check src e2e`      | pass                                                                                 |
| `npx vite build`                    | pass (the existing chunk-size warning)                                               |
| `npx vitest run`                    | 452 passed (76 files)                                                                |
| `e2e/related-entities.e2e.ts`       | 2 passed, and 4 of 4 with `--repeat-each=2`                                          |
| Full e2e (`npx playwright test`)    | 23 passed (12.4 min)                                                                 |
| `test_us_english.py` (guard)        | 14 tests OK                                                                          |
| `check_us_english.py` over the tree | 796 hits, the baseline (777 generated, 19 wire names); the changed files return `[]` |

## Compared to the mock

`review/016-vs-global-mock-related.png` sets the mock's RELATED ENTITIES panel beside the built
one.

- **Matches:**
  - the four tabs;
  - rows with a thumbnail box, name and kind tag, distance, a toned status with its icon, and a
    chevron.
- **Differs:**
  - The thumbnail is an icon by object type, not a photo (no image in the envelope).
  - The tag is the object type (Record, Facility), not the mock's finer kind (Airport, Military).
  - A row with no distance shows its relation (Depends on), where the mock shows other text
    (Overhead in 42 min).

## Decisions taken (unattended run)

1. **The dossier first.** The dossier's related section already has the four classes, so the
   panel shows those and makes no second call. It reads `listRelatedObjects` only when the
   section says it was cut short.
2. **Classes for the flat list** (the backend does not class it):
   - Nearby: near, located-in;
   - Infrastructure: depends-on, affects;
   - Historical: precedes, causes, same-as, derived-from;
   - Operational: everything else.
3. **The thumbnail** is an icon by object type. The envelope has no image.
4. **Status** is the envelope's `status`, toned by its words (alert or closed is red; watch,
   responding or congestion is amber; active, operational or underway is green). A severe
   severity is red.
5. **No counts on the tabs**, as in the mock. With counts, the fourth tab did not fit the panel's
   width.
6. **A related object with no position** (a facility the backend gives no geometry) is selected
   in the panels, and the map stays where it is.

## Deviations from the prompt text

- **"Playwright: related rows appear and navigate":** the local backend relates nothing, so the
  rows come from a stand-in related section on a live dossier. The navigation target is a live
  earthquake.

## Backend observations

- **Nothing related locally.** For a live earthquake (`record:usgs-earthquakes/aka2026uusvca`),
  the dossier's related section was `{"status": "empty", "truncated": false, "nearby": [],
"operational": [], "infrastructure": [], "historical": []}`, with
  `links.full` `/v1/objects/record:usgs-earthquakes/aka2026uusvca/related`. `listRelatedObjects` for
  it returned `{"items":[],"truncated":false}`.
- **The flat list is not classed.** `RelatedObjects.items` carries the relation, direction and
  distance, but no class.

## Owner questions

1. **Classes for the flat list.** Should `listRelatedObjects` return the four classes, as the
   dossier does? **Default in place: the client's mapping above.**
2. **Thumbnails.** Is there an image for a related object (the mock shows photos)? **Default in
   place: an icon by object type.**

Questions still open from earlier reports keep their defaults.
