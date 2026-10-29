# R2-006 — RBAC-Aware UI

**Goal.** Gate the client's own navigation, routes and actions on the signed-in principal's
effective permissions, and handle permission and scope refusals gracefully — so a user sees and can
do exactly what their roles allow, and anonymous visitors get read-only.

**Read first.** R2-002-CR (where permissions live); R2-005-CR.
Backend contract: `openapi/OpenAPI.json`.

**Backend (OpenAPI only).**
- No new calls. Permissions come from the session: `SessionToken.permissions[]` at login (R2-003)
  and `Me.permissions[]` on rehydrate (`getMe`, R2-002).
- The client gates only on the **end-user** permissions it consumes: `data.read`, `intel.read`,
  `self.preferences`, `self.sources`, `self.alerts`, `self.llm`. The operator permissions
  (`users.manage`, `roles.manage`, `system.settings`, `storage.manage`, `network.manage`,
  `collection.manage`, `collector.settings`, `llm.shared.manage`) gate `foresignal-admin`, **not**
  this client — never build UI for them here.

**Build.**
- A `can(permission)` helper and a `<RequirePermission permission=…>` wrapper, both reading
  `usePermissions()` (R2-002). A signed-out visitor has no permissions and sees read-only views.
- Nav and route guards: hide or disable the client actions a user's permissions do not cover; keep
  every open-read view reachable anonymously, with the R2-003 sign-in affordance always present.
- Centralize refusal handling in `src/api/errors.ts`: a `401` offers sign-in (not a dead end); a
  `403 PERMISSION_DENIED` / `INSUFFICIENT_SCOPE` shows a clear "you don't have access" message that
  names the `requiredPermission`/`requiredScope` the `ProblemDetail` carries.

**Done when.** Client views and actions reflect the signed-in permissions; anonymous mode is
read-only with a sign-in path; `401`/`403` are handled without dead-ends. Unit-tested (a permitted
vs. refused principal); compile-only, tests written not run.

**Commit.** `R2-006: RBAC-Aware UI`;
`completion-reports/R2-006-CR-RBAC-Aware-UI.md` (hash + owner questions).
