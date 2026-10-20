# 015 — Context Insights

**Goal.** The Analytics & Insights and Activity Timeline panels, driven by the backend's deterministic
context summary for the current viewport and time window.

**Read first.** 014-CR; [Architecture.md](../docs/Architecture.md) §8. Design: Global Dashboard
ACTIVITY TIMELINE and ANALYTICS & INSIGHTS (Detections/Hypotheses/Forecasts/Related tabs).

**Backend (OpenAPI only).**
- `POST /v1/context/summary` [`summarizeContext`] — for a viewport (bbox or center+radius), time
  window and filters: `layerCounts`, `activity` (alerts/findings/situation changes, newest first,
  each with signal family), `insights` (top findings with base rate, open ledger questions with
  probability/ICD term, hypothesis band changes), `related` (top open situations).

**Build.**
- Call `summarizeContext` on viewport/time change (debounced, reusing the 008 scoped viewport);
  honor the 30 s per-context cache (`cacheAgeSeconds`).
- **Activity Timeline** panel: the merged `activity` list, newest first, each item typed by signal
  family and linking to its object (selection → 014).
- **Analytics & Insights** panel with the design's tabs, from `insights`; show probabilities, ICD
  terms, base rates, confidence.
- Handle `409 WORKSPACE_CONTEXT_INCOMPLETE` (a workspace without a viewport/time) gracefully.

**Match the mock.** Two bottom panels of the Global dashboard: **ACTIVITY TIMELINE** (an
`All Sources` filter; time-stamped rows newest first, each with a source/family tag chip) and
**ANALYTICS & INSIGHTS** (tabs **Detections / Hypotheses / Forecasts / Related Events**; numbered
insight rows with a title, one-line basis, a % confidence pill and a Low/Medium/High tag; a
`View Full Analysis` link; a `Last Updated` stamp).

**Done when.** Both panels populate for the current view and refresh as the viewport/time change;
items link to selection. Playwright: panels show live activity/insights for a region.

**Commit.** `015: Context Insights`; `completion-reports/015-CR-Context-Insights.md` (hash + owner questions).
