# 025 — Workspaces And Deep Links

**Goal.** Shared workspace context (selection, viewport, layers, layout) owned by the backend, with
deep-link restore — so a view can be saved, shared and reopened.

**Read first.** 024-CR; [Architecture.md](../docs/Architecture.md) §11. Design: the Workspaces /
Add-to-workspace actions and Share across screens.

**Backend (OpenAPI only).**
- `GET /v1/workspaces` [`listWorkspaces`], `GET /v1/workspaces/{id}` [`getWorkspace`],
  `POST /v1/workspaces` [`createWorkspace`].
- `PATCH /v1/workspaces/{id}/context` [`patchWorkspaceContext`] — JSON merge patch with
  `If-Match: <contextVersion>`; `412 WORKSPACE_CONTEXT_STALE` → re-read, re-apply, retry.
- `PUT /v1/workspaces/{id}/layout` [`putWorkspaceLayout`], `GET /v1/workspaces/{id}/summary`
  [`getWorkspaceSummary`].
- `POST /v1/context-links` [`createContextLink`], `GET /v1/workspaces/{id}/context-link`
  [`getWorkspaceContextLink`], `POST /v1/workspaces/{id}/share` [`shareWorkspace`].

**Build.**
- Bind the store's selection/viewport/layers/layout to a workspace context: `add-to-workspace`
  (from the 014 envelope action) adds a ref to `selectedRefs`; context changes PATCH with `If-Match`
  and the retry-on-412 loop.
- Layout persistence via `putWorkspaceLayout` (opaque JSON; the backend never interprets it).
- Deep links: encode the current context (`createContextLink`), and on app load decode a
  context-link to restore selection/viewport/layers.
- A Share action (read-only) via `shareWorkspace`; render the workspace list.

**Done when.** Adding objects to a workspace, moving the view, and reopening a deep link restores
the same selection/viewport/layers; a stale PATCH recovers via re-read+retry. Playwright: deep-link
round-trip restores state.

**Commit.** `025: Workspaces And Deep Links`; `completion-reports/025-CR-Workspaces-And-Deep-Links.md` (hash + owner questions).
