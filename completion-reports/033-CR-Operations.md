# 033 — Completion Report: Operations

| Field                 | Value                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete)             |
| Implementation commit | `62bacfb829dfb4a57f1aa1cb578fba0b7969c821`                                                          |
| Run mode              | Unattended (owner's batch 023–036, no pausing)                                                      |
| Screenshots           | None taken (compile-only run).                                                                      |
| Mock comparison       | **No mockup exists for this space; the layout is derived** from the dashboard's panels in the code. |

## Results

- **The Operations tab** (`/operations`) opens a working console in place of the placeholder. It is
  three columns of status panels (**Tasks**, **Assets**, **Workflows**), each row with chips in the
  backend's own words.
- **Tasks**
  - **Alert Queue:** the open alerts from the live alert feed (029; it updates as alerts fire), with
    severity and firing or acknowledged. A row opens its alert. A **live** chip shows the stream's
    state, and the panel links to the Alerts screen.
  - **Exports & Packs:** the newest 20 export, snapshot and pack jobs (`listExports`), with kind,
    format, status, progress, created time and error.
  - **Briefing Runs:** the newest 20 runs across every briefing (`listBriefings`, then
    `listBriefingRuns`), with status and error.
- **Assets**
  - **Source Health board** (`listSourceHealth`):
    - counts for each status (`failing`, `degraded`, `idle`, `healthy`, `disabled`);
    - a filter (every enabled source by default, every source, or one status);
    - the sources worst first, with the reason, last success and consecutive failures;
    - opening a row shows the source's detail (`getSource`): name, kinds, last attempt, last error
      and requests in the last hour.
  - **Channels** (`listChannels`): type, enabled, last delivery and failures in 24 h. **Recent
    deliveries** lists a channel's 10 newest (`listChannelDeliveries`), with status, event, time
    and error.
  - **Sinks** (`listSinks`, then `getSinkStatus` for each): state, type, lag, delivered, dropped and
    last delivery. A sink whose status fails is still listed, with the error.
  - **Push Devices** (`listPushDevices`): name, platform, transport, status and last send.
  - **Ground Stations & Receivers** (`listSensors`, `station` and `receiver`, world, next 6 h): each
    opens its object. The panel links to RF / Sensors (032).
- **Workflows**
  - **Alert Rules** (`listTriggers`): severity, state (enabled, disabled, muted, snoozed, error, as
    030 words them), type, alert count and last fired. **Author rules →** links to 030
    (`/alerts?tab=rules`).
  - **Briefings** (`listBriefings`): schedule and time zone, enabled, last run status and time, next
    run.
  - **Escalation Policies** (`listEscalationPolicies`): steps and rule count.
  - **Analysis Cycles** (`listAnalysisCycles`): cadence, cron and time zone, enabled, built-in, next
    run.
  - **Chronicles** (`listChronicles`): status, display id, start, cap state. A row opens its
    object.
- **Updating live.** The alert queue is the live feed. Every other panel reads again every 30 s.
  Every read is keyed by the token, so signing in reads them again.
- **Read only.** Changes are made where each item is owned (rules on the Alerts screen). The
  console runs nothing. A panel the token may not read shows the backend's answer, for example
  "Unauthorized: This endpoint requires a bearer token."

## What was built

- `src/operations/opsApi.ts`:
  - `listSourceHealth`, `getSource`;
  - `listExports`, `listRecentRuns`, `listBriefings`;
  - `listChannels`, `listChannelDeliveries`, `listSinkRows`, `listPushDevices`;
  - `listTriggers`, `listEscalationPolicies`, `listAnalysisCycles`, `listChronicles`;
  - the schema types.
- `src/operations/opsView.ts`:
  - the chip tones per status;
  - `HEALTH_ORDER`, `healthCounts`, `filterHealth`;
  - `progressText`, `sinkState`, `lagText`;
  - `OPS_REFRESH_MS`, `OPS_ROWS`.
- `src/operations/useTick.ts`: a counter on an interval, used as the polled reads' version.
- `src/views/operations/OperationsView.tsx` and `Operations.module.css`. The route renders it in
  place of the placeholder, which was removed from `views/screens.tsx`.

## How it was checked

### Tests (written, not run)

- `operations/ops.test.ts` (4):
  - health counts and the worst-first, enabled, all and one-status filters;
  - progress, sink state and lag text;
  - runs merged across briefings, newest first;
  - sinks with their status, and a sink whose status failed kept with its error.
- `views/operations/OperationsView.test.tsx` (4):
  - the three sections: the live queue with its chips, the briefing run, the health counts and
    worst-first rows, the station, the rule with its count and the 030 link, the built-in cycle;
  - the backend's 401 shown on a panel;
  - a source's detail from the board, and every source on request;
  - a channel's recent deliveries.
- `e2e/operations.e2e.ts` (1), "open tab → the three sections render with data":
  1. the nav tab opens `/operations`;
  2. the queue shows a stood-in alert;
  3. the backend's source-health board shows its counts and rows;
  4. the backend's analysis cycles are listed, and the alert rules panel is ready;
  5. no console errors.

  The panels that need a token are stood in as empty, since a 401 is a console error.

### Checks

| Check                                                       | Result                                                                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                         | Passed                                                                                                                                                                                      |
| `npm run lint`                                              | Passed                                                                                                                                                                                      |
| `npx prettier --check src e2e`                              | Passed                                                                                                                                                                                      |
| `npm run build`                                             | Passed. `index` 875.10 kB (263.11 kB gzip)                                                                                                                                                  |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                                                                                                                                                                 |
| Guard: `test_us_english.py`                                 | 14 tests OK (168.8 s)                                                                                                                                                                       |
| Guard: `check_us_english.py` over the project               | 804 hits (one more than before; see the next row)                                                                                                                                           |
| Guard: `check_us_english.py` over the new and changed files | 1 hit: the canceled export job status in `opsView.ts`, which the backend spells the British way. It is the OpenAPI's enum value (`ExportJob.status`), a wire value, so it is left as it is. |

## Compared to the mock

**There is no mockup for this space.** The layout is derived and is open to the owner's
redirection.

- **Matches the established language:**
  - the dashboard's panels (border, radius, panel color);
  - card titles, muted detail lines, `Badge` chips and link buttons;
  - the section labels styled like the rail headings;
  - no new visual idiom.
- **Derived choices to review:**
  - **three equal columns**, which stack below 1100 px;
  - **status rows with chips**, not tables;
  - **source detail and channel deliveries open inline**, under their row.

## Decisions taken (unattended run)

1. **The alert queue is the 029 feed** (open alerts, live over the stream), so it updates without
   polling and matches the alert strip.
2. **Every other panel polls every 30 s.** None of these lists has a stream in the OpenAPI.
3. **The health board shows enabled sources by default.** Locally, 405 of 407 sources are
   disabled. The counts always cover every source.
4. **Briefing runs** are merged across briefings: there is no list of runs across briefings.
5. **Sinks** read their status one by one (`getSinkStatus`); a failed status keeps the sink listed.
6. **Ground stations** are discovered over the world for the next 6 hours.
7. **Panels the token may not read** show the backend's error rather than hiding, so the operator
   sees what needs a token or scope.
8. **Backend values as is:** health statuses, job kinds and statuses (`QUEUED`, `RUNNING`, `DONE`, …),
   run statuses, sink types and states, delivery statuses, channel types, platforms, cadences and
   chronicle statuses.

## Deviations from the prompt text

- **`getExport` and `getJob`** are not called. `listExports` carries each job's status and
  progress, polled every 30 s. `getJob` reads one backtest job by id, and the OpenAPI has no list
  of jobs to find ids in (owner question 2).
- **Create and edit** link only to the Alerts screen (rules, 030). No other listed object has an
  authoring screen in the client yet.

## Backend observations

These come from curl in this session:

- `GET /v1/sources/health` answered 407 sources: 405 `disabled` and 2 `healthy`.
- `GET /v1/alerts?limit=3` answered `{"items":[],"nextCursor":null}`.
- `GET /v1/briefings` and `GET /v1/triggers` each answered `[]`.
- `GET /v1/analysis/cycles?limit=3` answered one cycle: "Daily brief", `daily`, `0 6 * * *` UTC.
- Without a token, these answered **401**:
  - `GET /v1/chronicles` and `GET /v1/push/devices` ("always requires a token");
  - `GET /v1/exports`, `GET /v1/sinks`, `GET /v1/escalation-policies` and `GET /v1/channels`
    ("requires a bearer token").
- The OpenAPI gives `ExportJob.progress` as an integer from 0 to 100.

## Owner questions

1. **Layout.** Is the derived three-column console right? **Default in place: as built.**
2. **Async jobs.** Should the backend list jobs (backtests and others), so the Tasks section can
   show them without an id? **Default in place: no jobs panel; exports only.**
3. **Live panels.** Should source health, exports and sinks have a stream, rather than a 30 s poll?
   **Default in place: a 30 s poll.**
4. **Health default.** Should the board open on every source rather than the enabled ones?
   **Default in place: enabled sources, with every status counted.**
5. **Authoring links.** Which other objects (briefings, escalation policies, cycles, chronicles)
   should get an authoring screen to link to? **Default in place: none yet.**

Questions still open from earlier reports keep their defaults.
