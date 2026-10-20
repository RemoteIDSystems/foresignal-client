# 023 — Assessments

**Goal.** The "AI Analysis" tabs: narrative assessments (executive summary, key insights, what
changed, outlook, risks), with on-demand re-assessment where allowed.

**Read first.** 022-CR; [Architecture.md](../docs/Architecture.md) §10. Design: Conflict Dashboard
AI ANALYSIS (Executive Summary / Key Insights / What Changed / Outlook / Risks / Analyst Notes,
model + generated-at, View prompt / Re-run).

**Backend (OpenAPI only).**
- `GET /v1/assessments` [`listAssessments`], `GET /v1/assessments/{id}` [`getAssessment`],
  `GET /v1/assessments/latest` [`getLatestAssessment`].
- `GET /v1/situations/{id}/assessments` [`listSituationAssessments`].
- `POST /v1/situations/{id}/assessment` [`createSituationAssessment`] — on-demand (if the envelope
  action allows it).
- `GET /v1/assessments/{id}/bundle` [`getAssessmentBundle`] — cited objects.

**Build.**
- An AI-Analysis panel with the design's tabs from the latest situation assessment; show the model,
  generated-at, and `textOrigin` so operators know it is LLM-written.
- Cited objects (from the bundle) are clickable → selection (014).
- "Re-run" calls `createSituationAssessment` only when offered; show progress and refresh.

**Match the mock (AI ANALYSIS).** Tabs **Executive Summary / Key Insights / What Changed / Outlook /
Risks / Analyst Notes**; a header with **Model** (e.g. Claude, local), **Generated** timestamp, and
`View prompt` / `Re-run`. Below the summary, **Key Takeaways** cards (numbered, each a one-line point
with a Confidence %). `textOrigin` makes clear it's LLM-written; cited objects are clickable.

**Done when.** A situation shows its latest assessment across the tabs with model/timestamp, cited
objects navigate, and re-run works where permitted. Playwright: AI-Analysis tabs render.

**Commit.** `023: Assessments`; `completion-reports/023-CR-Assessments.md` (hash + owner questions).
