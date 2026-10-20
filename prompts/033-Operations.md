# 033 — Operations

**Goal.** A dedicated **Operations** workspace — Tasks, Assets and Workflows — the operator console
over the backend's tasks, delivery assets and automation.

**Read first.** 032-CR; [Architecture.md](../docs/Architecture.md) §13, §14; Charter §3. **No
dedicated mockup exists** — build it in the established design language, review-gated.

**Backend (OpenAPI only).**
- **Tasks:** active alerts (`listAlerts`), export/pack jobs (`listExports` / `getExport`), async jobs
  (`getJob`), briefing runs (`listBriefingRuns`).
- **Assets:** sources and health (`listSources` / `listSourceHealth` / `getSource`), notification
  channels (`listChannels` / `listChannelDeliveries`), sinks (`listSinks` / `getSinkStatus`), push
  devices (`listPushDevices`), ground stations / sensors (`listSensors`).
- **Workflows:** trigger rules (`listTriggers`), briefings (`listBriefings`), escalation policies
  (`listEscalationPolicies`), analysis cycles (`listAnalysisCycles`), chronicles (`listChronicles`).

**Build.**
- A workspace reached from the **Operations** nav tab with three sections:
  - **Tasks:** the live alert/task queue, running exports and jobs, and recent briefing runs, each
    with status and a link to its object.
  - **Assets:** a source-health board (`listSourceHealth`), channels with recent deliveries, sinks
    with lag/status, and registered devices.
  - **Workflows:** trigger rules (link to 030 authoring), scheduled briefings, escalation policies,
    analysis cycles and chronicles — each showing state and last run.
- Read-only status views; create/edit actions link to the owning feature (rules → 030) where the
  object envelope allows them. The client renders; the backend owns execution.

**Match the design (no mock).** Build in the established language as a three-section console
(**Tasks / Assets / Workflows**), each a panel of status rows with chips, consistent with the
dashboard's panels. No new visual idioms.

**Done when.** The Operations tab opens a working console: a Tasks queue, an Assets/health board, and
a Workflows list, all populated from the backend and updating live. Playwright: open tab → the three
sections render with data.

**Commit.** `033: Operations`; `completion-reports/033-CR-Operations.md` (hash + owner questions;
note the layout is derived — no mockup).
