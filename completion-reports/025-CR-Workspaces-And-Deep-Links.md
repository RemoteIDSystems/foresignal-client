# 025 — Completion Report: Workspaces And Deep Links

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete) |
| Implementation commit | `43df3d4293a16a078dfd26cac6e858ad1aafad56`                                              |
| Run mode              | Unattended (owner's batch 023–036, no pausing)                                          |
| Screenshots           | None taken (compile-only run). `e2e/workspaces.e2e.ts` takes none either.               |
| Mock comparison       | From the Analyst Workbench mock and the code, not from a screenshot (below).            |

## Results

- **A Workspaces button in the top bar** opens the Workspaces dialog. It reads "Workspace: name"
  while one is open, and carries a dot when the last change could not be saved.
- **The dialog:**
  - **the open workspace:** its name, the caller's role, and "context version N". An unsaved change
    shows as "Not saved: …". It offers **Copy link**, **Share read-only** and **Leave**;
  - **Your workspaces:** the caller's workspaces (`listWorkspaces`), each with **Open**. The open
    one is marked "open". Without a token it says to add one in Settings;
  - **New workspace name** and **Create from this view** (`createWorkspace`), seeded with what the
    app shows;
  - **Linked workspace,** when a deep link named one, with **Open it**.
- **Binding.** An open workspace follows the store:
  - the selection (`focusRef`), the viewport (`bbox`), the layers, the hidden sources (under
    `filters`) and the time (`asOf`);
  - each change rests 800 ms, then goes as a JSON merge patch of only the changed fields, with
    `If-Match: <contextVersion>` and `Foresignal-Client-Id`;
  - **a `412 WORKSPACE_CONTEXT_STALE`** re-reads the workspace and sends the same change on the new
    version, up to three tries. Another client's fields from the re-read are shown; this client's
    own change is kept. After three, the change shows as not saved.
- **Opening a workspace** shows its context: the layers, the time, the map's place (flown to its
  box), the focused object (selected app-wide through its dossier) and the closed panels.
- **Add to workspace** (014's envelope action `add-to-workspace`) in the Selected Entity panel adds
  the object's ref to `selectedRefs`, keeping the last 200. With no workspace open, it opens the
  dialog and says so.
- **Layout.** The Global dashboard's closed panels are stored with `putWorkspaceLayout` as
  `{"v":1,"closedPanels":[…]}`, and restored on open.
- **Deep links.** Copy link encodes what the app shows (`createContextLink`) and gives
  `…/global#fs=…`. Loading the app with such a fragment restores the layers, time, place and focus,
  then clears the fragment. A link from a workspace does not join it; the dialog offers it instead.
- **Share read-only** (`shareWorkspace`) shows the link's key prefix and expiry, or its URL when the
  backend returns one.
- **The workbench header** (024) now has the mock's Classify (the TLP), Status, Owner, Created and
  Last Updated, with Share (the dialog) and Export (the full analysis's export tab). Its rail gains
  a WORKSPACE section: Workspaces, and Notes (disabled until 026).
- **Open in new view** in the Selected Entity panel now opens the object in the workbench.

## What was built

- **`workspace/workspaceApi.ts`**: the nine reads and writes, with the merge-patch content type,
  `If-Match` and the client id.
- **`workspace/workspaceContext.ts`**: `appContext`, `contextPatch`, `mergePatch` (RFC 7396),
  `restoreFrom` (including a box across the antimeridian, and a center with a radius),
  `fragmentPayload`, `decodeLink`, `linkUrl`, `layoutOf`, `closedPanelsFrom`.
- **`workspace/WorkspaceSync.ts`**: the binding (open, create, leave, add a ref, flush, link, share,
  restore a link, the debounced send and stale loop, the layout PUT).
- **`workspace/WorkspacesDialog.tsx`** and its CSS; `workspaceSyncContext.ts`.
- **Store:** `workspace`, `workspacesOpen` and `closedPanels`. `selectionRef` in
  `objects/selectObject.ts`.
- **Wiring:** `Session.workspaces`, `AppShell` (provider, start, link restore, dialog), `TopNav`,
  `DashboardLayout` (controlled closed panels), `GlobalDashboard`, `SelectedEntityPanel`, the
  analysis rail's Workspaces tool and the workbench.

## How it was checked

### Tests (written, not run)

- `workspace/workspaceApi.test.ts` (3): list, read and create bodies; the PATCH's `If-Match`, client
  id and content type; layout, both link reads, and share.
- `workspace/workspaceContext.test.ts` (9): the context from the app; untouched layers; patches;
  merge patch; restore; antimeridian and radius; fragment decoding; link URLs; layout.
- `workspace/WorkspaceSync.test.ts` (12): open; a merge patch on the seen version; the debounce; a
  stale retry (`If-Match` `3` then `7`) keeping our change and showing theirs; giving up after
  three; a stale add-to-workspace; the 200-ref cap; the first viewport after a restore; the layout
  PUT; create and leave; a deep link restored without joining; `isStale`.
- `workspace/WorkspacesDialog.test.tsx` (7): list and open; create; copy link; share and leave; the
  linked workspace; the token hint; Escape.
- `views/global/SelectedEntityPanel.test.tsx` (+2): add to workspace; Open in new view.
- `e2e/workspaces.e2e.ts` (1): flips the earthquake layer and moves the map, copies the link, opens
  it in a fresh browser context, and checks the layer, live time, map center, cleared fragment and
  no console errors.

### Checks

| Check                                                       | Result                                     |
| ----------------------------------------------------------- | ------------------------------------------ |
| `npm run typecheck`                                         | Passed                                     |
| `npm run lint`                                              | Passed                                     |
| `npx prettier --check src e2e`                              | Passed                                     |
| `npm run build`                                             | Passed. `index` 731.24 kB (222.63 kB gzip) |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                |
| Guard: `test_us_english.py`                                 | 14 tests OK (171.9 s)                      |
| Guard: `check_us_english.py` over the project               | 797 hits, unchanged                        |
| Guard: `check_us_english.py` over the new and changed files | `[]`                                       |

## Compared to the mock

From `design/ForeSignal_Analyst_Workbench.png` against the components; no screenshot was taken.

- **Matches:** the header's Classify, Status, Owner, Created and Last Updated, with Share and
  Export; a WORKSPACE section in the left rail.
- **Differs:**
  - **Classify** shows the investigation's TLP (`TLP:AMBER`), the backend's word, not the mock's
    "Unclassified".
  - **No More (⋯) action.** Nothing was found for it to hold beyond Share and Export.
  - **The workspace list** is in the dialog the rail's Workspaces entry opens, not inline in the
    rail.

## Decisions taken (unattended run)

1. **Context mapping:** selection → `focusRef`; viewport → `bbox` only (no zoom); chosen layer kinds
   and raster products (prefixed `product:`) → `layers`; hidden sources → `filters.hiddenSources`;
   time → `asOf` (null when live). Layers are sent only once the user has chosen some.
2. **Send rate:** a change rests 800 ms before it is sent; up to three stale retries.
3. **Restore settle:** the map's first viewport within 5 s after a restore is taken as the
   context's, not sent back, so opening a workspace does not rewrite it.
4. **Deep links restore but do not join.** A link from a workspace offers "Open it".
5. **Layout** is the Global dashboard's closed panels, versioned `v: 1`.
6. **Add to workspace** with nothing open opens the dialog.
7. **New workspaces** are sent `private: false` (the OpenAPI default) and seeded from the view.

## Deviations from the prompt text

- **"Restores the same selection/viewport/layers":** the selection is restored as the focused
  object only; `selectedRefs` is stored and sent but not drawn on the map.
- **`getWorkspaceSummary`** is not used: the Context Insights panel (015) already summarizes the
  viewport. The operation is not wrapped (`grep -rn getWorkspaceSummary src` finds only the
  generated schema).
- **`getWorkspaceContextLink`** is wrapped and tested but no screen calls it; Copy link encodes the
  live view instead.
- **Playwright:** written as `e2e/workspaces.e2e.ts`, not run (standing rule). It covers deep links
  only, because workspaces need a token locally.

## Backend observations

- **Local:** `GET /v1/workspaces` answered **401** (curl, this session).
- **`POST /v1/context-links`** with `{"context":{"layers":["earthquake"],"asOf":null}}` answered
  `{"version":1,"workspaceId":null,"payload":"eyJ2IjoxLCJ3cyI6bnVsbCwiY3R4Ijp7ImxheWVycyI6WyJlYXJ0aHF1YWtlIl19fQ","fragment":"#fs=…","bytes":66}`.
  The payload decodes to `{"v":1,"ws":null,"ctx":{"layers":["earthquake"]}}`: a null `asOf` is
  dropped.
- **`shareWorkspace`** says "the key is shown once", but its 201 response is typed `ShareLink`,
  which has `keyPrefix` and no `key` or `url`.
- **`patchWorkspaceContext`** says each new version "is broadcast as `workspace.context`". The
  client's stream subscribes only to `changes` (011).

## Owner questions

1. **Live co-editing.** Should the client subscribe to `workspace.context` events, so another
   client's changes appear without a re-read? **Default in place: they appear on the next stale
   re-read or open.**
2. **The share key.** Should the OpenAPI type the share response with the one-time `key` or `url`?
   **Default in place: the URL when present, else the key prefix.**
3. **Joining from a link.** Should a deep link from a workspace join it outright? **Default in
   place: restore only, and offer "Open it".**
4. **Context mapping.** Are `product:` layers and `filters.hiddenSources` acceptable names in the
   shared context? **Default in place: as in decision 1.**
5. **Scene mode** (3D / 2D / Columbus) is not in the context. Should it be? **Default in place: not
   carried.**
6. **Workspace summary.** Where should `getWorkspaceSummary` appear, if anywhere? **Default in
   place: unused.**

Questions still open from earlier reports keep their defaults.
