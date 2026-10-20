# 021 — Completion Report: Hypotheses ACH

| Field                 | Value                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Status                | Complete; tests written, not run (standing rule: no test execution until code-complete) |
| Implementation commit | `f4b9bf6708b611018668a8409e87336c3c7e9681`                                              |
| Run mode              | Unattended (owner's batch 019–022, no review gates)                                     |
| Screenshots           | None taken (compile-only run). `e2e/hypotheses.e2e.ts` takes none either.               |
| Mock comparison       | From the Conflict mock and the code, not from a screenshot (below).                     |

## Results

- **The Hypotheses tab** of the full-analysis view is filled. It holds four cards.
  - **Competing Hypotheses** shows:
    - the set's key question, its kind, review cadence, horizon and last revision, and its
      confidence;
    - a row per hypothesis, numbered H1…Hn by probability. Each row has its label and statement,
      `Indicators: x/y` with the observed ones for and against, a Low, Moderate or High confidence
      tag, its ICD term and prior, and a probability pill with its trend (`72% ↑`). The pill's
      title gives the change in points;
    - **+ Add hypothesis**, when the set's envelope offers it;
    - **View hypothesis analysis →**, which opens the ACH matrix.
  - **Information Value:** the set's pending indicators ranked by expected information gain
    (`getInformationValue`). Each has its family, gain, the gain it would have if fully observable,
    and its detection chance. Those the backend flags are tagged Collection gap.
  - **Indicators:** the set's indicators (`listIndicators`), each with its state, family and due
    date.
  - **Key Assumptions:** shown when the set has any, with linchpins tagged.
- **The ACH matrix** (`getAchMatrix`) replaces the cards until "← Hypotheses".
  - Rows are the live evidence, heaviest first. Each shows its description (which opens its object
    when it has a ref), its source, credibility and relevance, its weight, and a rating per
    hypothesis (CC, C, N, NA, I or II, colored, with the meaning as the cell's title).
  - The footer has each hypothesis's weighted inconsistency, with the least inconsistent marked.
  - Rows that cannot tell the hypotheses apart are tagged Non-diagnostic, and circular reporting
    is tagged.
  - The backend's audit-view note and the rating key are shown.
- **The header's Information Value** is now filled from the analysis's primary hypothesis set (the
  first active one). It reads High, Medium or Low, as decision 4 explains. It still says "Not
  assessed" when no set is linked or nothing is pending.
- **Which sets are shown.** A situation shows the sets linked to it (`listHypothesisSets` by
  `situationId`). An investigation shows the sets it links (`hypothesisSetIds`, read one by one).
  With more than one, a Key question chooser picks one.
- **The local backend has no hypothesis data.** In this session, `GET /v1/hypotheses/sets?limit=3`
  and `GET /v1/indicators?limit=3` through the dev proxy each answered `{"items":[],"nextCursor":null}`
  with 200 (curl). The tests use stand-in data (`src/intel/testing/hypothesisFixtures.ts`), typed
  against the generated schema.

## What was built

- **`intel/hypothesisApi.ts`**:
  - `listHypothesisSets` (by situation or status), `getHypothesisSet`;
  - `getAchMatrix`, `getInformationValue`;
  - `listIndicators` (by set or state);
  - `addHypothesis`.
- **`intel/hypothesesView.ts`** holds the view logic:
  - the scope (a situation's id or an investigation's links) and the primary set;
  - H-numbering by probability, the pill tones, the trend arrow and text;
  - confidence words and tones;
  - likelihood lookup (by hypothesis id, or by label as the OpenAPI allows) and indicator counts;
  - prior text;
  - rating text and tones;
  - the matrix's live rows and the non-diagnostic test;
  - the information level and the indicators by rank.
- **`intel/useHypotheses.ts`**:
  - `useHypothesisSets` reads by the scope as JSON, so a 60-second analysis refresh with the same
    scope does not read again.
  - `useRead` is a small keyed reader, returning the `Part` shape from 020. A version number
    forces a re-read after an addition.
- **`views/analysis/HypothesesTab.tsx`**: the tab, `HypothesesPanel`, the add form,
  `InformationValuePanel`, `IndicatorsPanel` and `AchMatrixView`.
- **`AnalysisView`**:
  - reads the sets once and gives them to the tab;
  - reads the primary set's information value for the header;
  - renders the tab.

  **`frame.ts`** no longer lists Hypotheses as pending. The rail's Hypotheses and Indicators
  entries already open this tab.

## How it was checked

### Tests (written, not run)

- `intel/hypothesisApi.test.ts` (3):
  - the sets query by situation, and the indicators query by set;
  - the set, matrix and information-value paths;
  - the addition's path and body.
- `intel/hypothesesView.test.ts` (12):
  - scopes, including an investigation with and without links; the primary set;
  - H-numbering; pill tones at 72%, 21%, 5% and 3%; trend arrows and text;
  - confidence words and tones;
  - indicator counts: observed of live, for and against, with retired and neutral ones excluded;
  - a likelihood keyed by label; prior text;
  - matrix rows (a removed row dropped, heaviest first); non-diagnostic by flag and by list;
    rating tones;
  - information levels High, Medium and Low, and none; indicator ranking.
- `views/analysis/HypothesesTab.test.tsx` (8):
  - rows by probability with pills, trend titles, `Indicators: 2/3 (1 for, 0 against)`, and the
    confidence tags; the `situationId` query; the header's "Information value High";
  - the ranked pending indicators, the indicators count and the assumptions;
  - the matrix: header order H2, H1, H3 as the backend orders its columns; rows heaviest first;
    II, Non-diagnostic, the scores and the least inconsistent; back to the hypotheses;
  - adding a hypothesis (body, then the set read again);
  - no Add without the envelope's action;
  - switching sets by question;
  - an investigation's linked set, with no list query;
  - no linked set, with the header still "Not assessed".
- `views/analysis/AnalysisView.test.tsx`: the pending-tab case now opens Forecasts (022).
- `e2e/hypotheses.e2e.ts` (1), with stand-in situation and hypothesis reads:
  - the header's Information Value;
  - three rows with `72% ↑` and `Indicators: 2/3`;
  - Add hypothesis offered, and two ranked pending indicators;
  - the matrix's two rows and its least-inconsistent mark;
  - no console errors.

### Checks

| Check                                                       | Result                                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                         | Passed                                                                                        |
| `npm run lint`                                              | Passed                                                                                        |
| `npx prettier --check src e2e`                              | Passed                                                                                        |
| `npm run build`                                             | Passed. `index` 664.42 kB (204.14 kB gzip); `EChartCanvas` unchanged at 558.43 kB             |
| `npm test`, `npm run e2e`                                   | **Not run** (standing rule)                                                                   |
| Guard: `test_us_english.py`                                 | 14 tests OK                                                                                   |
| Guard: `check_us_english.py` over the project               | 797 hits, unchanged from 020 (that report explains the one wire string over the 796 baseline) |
| Guard: `check_us_english.py` over the new and changed files | `[]` (`src/intel` reports only 020's known `analyticsFixtures.ts:88`)                         |

## Compared to the mock

Compared by reading the Conflict mock's COMPETING HYPOTHESES (cropped from the design PNG and read
in this session) against the components; no screenshot of the app was taken.

- **Matches:**
  - the rows: each with a statement and a basis line, `Indicators: x/y`, and `Confidence:` with a
    colored word;
  - the probability pill on the right with its trend arrow, colored as the mock's four (green 72%,
    violet 21%, gray 5%, red 3%);
  - `+ Add hypothesis` at the top right and `View hypothesis analysis →` at the bottom right.
- **Differs:**
  - **Row labels.** Rows carry an H1…Hn label before the title, as the prompt asks; the mock's
    crop shows none.
  - **Confidence word.** It reads Moderate, the backend's word, where the mock writes Medium
    (decision 2).
  - **Extra detail.** Each row also shows the ICD term and the prior with its basis, and the
    `x/y` count adds the observed indicators for and against.
  - **The ACH matrix, Information Value, Indicators and Key Assumptions** are not in the mock's
    panel. The prompt asks for the matrix and the ranking.
  - **Placement.** The panel fills the Hypotheses tab rather than sitting under the map on Full
    Analysis; that layout is 023's.

## Decisions taken (unattended run)

1. **Row content.** The title is the hypothesis's `label`. The second line is its `statement`,
   clamped to two lines. The meta line is the indicators, the confidence, and the ICD term with
   the prior and its basis.
2. **Confidence** uses the backend's `ConfidenceLevel` words (Low, Moderate, High) rather than the
   mock's Medium. The colors are high green, moderate amber, low orange, as the mock shows Low.
3. **`Indicators: x/y`.** y counts the indicators that are not retired and carry a likelihood for
   the hypothesis. x counts those observed. "For" and "against" split the observed ones by their
   likelihood's direction, and a neutral class counts as neither.
4. **Information Value** in the header is the best pending indicator's expected information gain
   over the set's entropy: High from 0.25, Medium from 0.10, Low below. It belongs to the primary
   set, the first active one.
5. **Pill tones** are by probability: green from 50%, violet from 15%, gray from 5%, red below.
   This reproduces the mock's four. The trend arrow shows for a change of half a point or more.
6. **+ Add hypothesis** shows only when the envelope of `hypothesis-set:<id>` offers a `POST …/hypotheses`.
   That ref type is one the OpenAPI names (`listForecastQuestions`' `linked` parameter). The form
   sends `type: outcome` and an operator prior basis with an optional rationale. Then the set, its
   indicators, information value and matrix are read again.
7. **The matrix columns** keep the backend's order, labeled with the same H numbers as the list.
8. **Sets are read when the analysis loads**, not on every refresh. Opening another set reads it.

## Deviations from the prompt text

- **"Read-only rendering of `getHypothesisSet`":** the panel itself is read-only. **+ Add
  hypothesis** is added because the mock shows it. It is gated on the envelope, as 019's item
  actions and 020's dismissal are.
- **"Playwright: hypotheses panel + matrix render":** written as `e2e/hypotheses.e2e.ts`, not run
  (standing rule). It uses stand-in data, because the local backend has no hypothesis sets.

## Backend observations

- **Local data.** `GET /v1/hypotheses/sets` and `GET /v1/indicators` answer empty lists (curl, this
  session).
- **Likelihood keys.** `Indicator.lr` is keyed "per hypothesis id (or label when created with its
  set)", so the client matches either.
- **No hypothesis-set ref example.** The OpenAPI names `hypothesis-set:` as a ref type only in the
  `linked` parameter's examples. Whether `getObject` answers it is not stated.

## Owner questions

1. **Confidence word.** Should the UI write the mock's Medium, or the backend's Moderate? **Default
   in place: Moderate.**
2. **Information Value.** Is the best pending indicator's gain against the set's entropy the right
   reading for the header's meter? Should it use another measure, or a backend field? **Default in
   place: High ≥ 0.25, Medium ≥ 0.10, else Low.**
3. **Add hypothesis.** Is a hypothesis added from the panel an `outcome` with an operator prior,
   or should the form ask for the type and the basis? **Default in place: outcome, operator basis,
   optional rationale.**
4. **Envelope for a set.** Does `getObject` answer `hypothesis-set:<id>`, and what is the
   add-hypothesis action's id? **Default in place: matched by method and href; no envelope means no
   Add.**

Questions still open from earlier reports keep their defaults.
