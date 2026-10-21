# 023 — Completion Report: Assessments

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete) |
| Implementation commit | `4f8c16d9e2e8fa6909ed3b6b3dd7085fc013ffe5`                                              |
| Run mode              | Unattended (owner's batch 023–036, no pausing)                                          |
| Screenshots           | None taken (compile-only run). `e2e/assessments.e2e.ts` takes none either.              |
| Mock comparison       | From the Conflict mock and the code, not from a screenshot (below).                     |

## Results

- **The Full Analysis tab** of the analysis view is filled with the **AI Analysis** card, built
  from the situation's latest assessment (`listSituationAssessments`, newest first).
  - **The header** has View prompt and Re-run. Below them it shows:
    - the model and its effort, written "none" when the backend sends no model;
    - when it was generated;
    - the cadence and the status;
    - the assessment's text origin, as the backend's own word.

    The text origin is `llm`, `deterministic` or `mixed`; mixed means some sections and judgments
    were written by each.

  - **The tabs** are Executive Summary, Key Insights, What Changed, Outlook, Risks and Analyst
    Notes, as the mock shows, then **More**. More holds the sections the mock has no tab for
    (decision 1). Each section shows its heading, its text-origin badge, its Markdown, and any lint
    warnings. A tab with no section says "This assessment has no … section."
  - **Key Takeaways** sit under the summary. They are the assessment's `bluf` key judgments,
    numbered. Each has:
    - its text;
    - its likelihood as the backend gives it (`72% · likely`);
    - `Confidence:` with the backend's word (Low, Moderate, High);
    - its own text origin, and "downgraded" when lint downgraded it;
    - the confidence statement, the change explanation, and its citations as buttons.
  - **Cited Objects** lists the bundle's objects (`getAssessmentBundle`, as JSON). Each one, and
    each citation in the text or a takeaway, opens through `useOpenObject` (014), as the other
    tabs do.
  - **View prompt** opens a drawer with each prompt template the assessment names
    (`getPromptTemplate` at its version, as JSON).
  - **Re-run** shows only when the `situation:<id>` envelope offers
    `POST /situations/{id}/assessment`. It calls `createSituationAssessment` and polls the run
    every 3 s (`getCycleRun`), with a spinner, until the run finishes. Then it reads the list
    again. If the run cannot be read, it reads the list on each tick instead, and stops when a
    newer assessment is on top. It gives up after 10 minutes.
- **An investigation** shows "Assessments are written for situations; an investigation has none of
  its own."
- **Markdown is rendered by a small parser written here**, with no new dependency and no HTML
  insertion (decision 5).
- **Local data.** In this session, curl through the dev proxy gave:
  - `GET /v1/assessments?limit=2`: 200, `{"items":[],"nextCursor":null}`;
  - `GET /v1/assessments/latest`: 404 `UNKNOWN_ASSESSMENT`, "No assessment exists yet."

  So the tests use stand-ins (`src/intel/testing/assessmentFixtures.ts`), typed against the
  generated schema.

- **Also in this batch, under the owner's as-is rule:** commit `7a90c6c` ("020: show corroboration
  as the backend writes it") changed 020's evidence rows. They had mapped corroboration onto
  High, Medium and Low; they now show the backend's word, colored green for corroborated, red for
  uncorroborated and amber otherwise.

## What was built

- **`ui/markdown/parseMarkdown.ts`** reads Markdown into blocks and inlines:
  - blocks: headings, paragraphs, bullet and numbered lists (with continuation lines), quotes,
    fenced code, pipe tables and rules;
  - inlines: code, bold, italics and links;
  - helpers: `inlineText`, `isObjectRef` and `isWebLink`.
- **`ui/markdown/Markdown.tsx`** renders the blocks as React elements:
  - a level-n heading renders as `h(n+2)`, below the card's own headings;
  - web links open in a new tab with `rel="noopener noreferrer"`;
  - object-ref links become buttons when given a handler, otherwise text.
- **`intel/assessmentApi.ts`**:
  - `listSituationAssessments`, `getAssessment` and `getAssessmentBundle` (as JSON);
  - `createSituationAssessment` and `getCycleRun`;
  - `getPromptTemplate` (at a version, `Accept: application/json`).
- **`intel/assessmentView.ts`**: the tabs and their section kinds, `tabSections`,
  `assessmentOrigin`, `runFinished` and `likelihoodText`.
- **`views/analysis/AssessmentTab.tsx`**: the tab, its header, the re-run hook, the body, the
  takeaways, the prompt drawer and the cited objects.
- **`AnalysisView`** renders the tab. **`frame.ts`** no longer lists Full Analysis as pending; only
  Reports remains.
- **`e2e/standIns.ts`** is a shared helper for e2e stand-in situations, used by the new spec.

## How it was checked

### Tests (written, not run)

- `ui/markdown/parseMarkdown.test.ts` (3):
  - the blocks;
  - nested inlines;
  - object refs told from web links.
- `ui/markdown/Markdown.test.tsx` (2):
  - the blocks render, an object ref opens, a `javascript:` link is not a link, and a `<script>`
    in the source stays text;
  - an object ref without a handler stays text.
- `intel/assessmentApi.test.ts` (3):
  - the list, the assessment and the bundle as JSON;
  - the on-demand POST and the run read;
  - the template at its version, as JSON.
- `intel/assessmentView.test.ts` (5):
  - the tabs, then More;
  - each tab's sections;
  - the origin (llm, deterministic, mixed);
  - when a run is over;
  - likelihood text.
- `views/analysis/AssessmentTab.test.tsx` (9):
  - the header's model, effort, time and origin; the summary;
  - each tab's sections, and the missing-section text;
  - a cited object opened from the bundle and from a takeaway;
  - a citation inside a takeaway;
  - the prompt drawer;
  - a re-run that is followed to the end, after which the newer assessment shows (fake timers);
  - no Re-run without the envelope's action;
  - no assessment;
  - an investigation.
- `views/analysis/AnalysisView.test.tsx`: the pending-tab case now opens Reports.
- `e2e/assessments.e2e.ts` (1), with a stand-in situation and assessment:
  - the header's model and origin, Re-run offered, and two takeaways;
  - every tab opens, and Risks shows its section;
  - no console errors;
  - a cited object opening on the global view.

### Checks

| Check                                                       | Result                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `npm run typecheck`                                         | Passed (exit 0)                                                    |
| `npm run lint`                                              | Passed (exit 0)                                                    |
| `npx prettier --check src e2e`                              | Passed                                                             |
| `npm run build`                                             | Passed. `index` 692.17 kB (211.03 kB gzip)                         |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                                        |
| Guard: `test_us_english.py`                                 | 14 tests OK (174.6 s)                                              |
| Guard: `check_us_english.py` over the project               | 797 hits, unchanged from 020 (one wire string over 796)            |
| Guard: `check_us_english.py` over the new and changed files | `[]` (every file changed since `7a90c6c`, including 7a90c6c's own) |

## Compared to the mock

Compared by reading the Conflict mock's AI ANALYSIS card against the components; no screenshot of
the app was taken.

- **Matches:**
  - the tabs Executive Summary, Key Insights, What Changed, Outlook, Risks and Analyst Notes;
  - the Model and Generated header, with View prompt and Re-run;
  - the numbered Key Takeaways under the summary, each a short point with its likelihood.
- **Differs:**
  - **More** follows the mock's six tabs.
  - **The header** also shows the cadence, the status and the text origin.
  - **Each takeaway** shows the backend's probability and term (`72% · likely`) where the mock
    writes "Confidence %". The backend's confidence word follows it as a separate tag, because the
    schema keeps confidence apart from likelihood.
  - **Cited Objects** is a card the mock does not draw; the prompt asks for clickable citations.
  - **Analyst Notes** says "No analyst notes." until 026 fills it.

## Decisions taken (unattended run)

1. **Tabs and sections.** Each tab shows these backend section kinds:
   - Executive Summary: `bluf`;
   - Key Insights: `key-insights`;
   - What Changed: `what-changed`;
   - Outlook: `outlook`;
   - Risks: `risks`;
   - More: situations, hypotheses, indicators, forecasts, speculation, sources, collection gaps
     and social.
2. **Latest** is the first of `listSituationAssessments`. `getLatestAssessment` is not
   situation-scoped, so it is not used.
3. **Text origin** is the backend's word, on the assessment, on each section and on each judgment.
   The assessment's own word is `mixed` when its parts differ.
4. **Model** shows "none" when the backend sends no model, as a deterministic assessment would.
5. **Markdown** is parsed here, with no dependency, and rendered as React elements only. Nothing
   in an assessment's text can become HTML.
6. **Re-run** is gated on the envelope, polls every 3 s, has the fallback above, and gives up
   after 10 minutes.
7. **Investigations** show no assessment; the OpenAPI has none for them.
8. **Analyst Notes** waits on 026's notes; the tab takes them as a prop.

## Deviations from the prompt text

- **"Cited objects … → selection (014)":** they open through `useOpenObject`. An analysis ref
  opens its analysis. Any other ref goes to the global view and is selected there.
- **"Playwright: AI-Analysis tabs render":** written as `e2e/assessments.e2e.ts`, not run (standing
  rule). It uses stand-in data, because the local backend has no assessments.
- **`listAssessments`, `getAssessment` by itself and `getLatestAssessment`** are not called by the
  panel. `getAssessment` is in the API module.

## Backend observations

- **Local data:** `GET /v1/assessments` answers an empty list, and `/v1/assessments/latest`
  answers 404 `UNKNOWN_ASSESSMENT` (curl, this session).
- **`getCycleRun` needs the agent scope** (OpenAPI). An operator's token may not be able to read
  the run it started, hence the fallback.
- **The filled prompt is not exposed.** The OpenAPI gives the templates by id and version, but not
  the text the model was sent.
- **`KeyJudgment` keeps confidence apart from likelihood.** Its `confidenceStatement` is described
  as "never in the same sentence as the likelihood term".

## Owner questions

1. **Analyst Notes.** Should the tab show the situation's annotations (026), or something the
   assessment carries? **Default in place: "No analyst notes." until 026 passes the notes in.**
2. **View prompt.** Should it show the filled prompt the model was sent? The OpenAPI exposes only
   the templates. **Default in place: the named templates at their versions.**
3. **Cited object refs.** Which ref types can a bundle hold, and should each open in place rather
   than on the global view? **Default in place: analysis refs open their analysis; others select on
   the global view.**
4. **Investigation assessments.** Should an investigation be able to have its own? **Default in
   place: none, with a line saying so.**
5. **Run progress.** Can an operator read `getCycleRun`, or should the re-run response carry
   progress? **Default in place: poll the run; if it cannot be read, re-read the list until a new
   assessment appears.**

Questions still open from earlier reports keep their defaults.
