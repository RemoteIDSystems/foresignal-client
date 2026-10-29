# R2-009 — Account My Sources, Quota And Relevance

**Goal.** The per-user view over the shared collection: the user's own source visibility and
styling, their quota and usage and personal LLM budget, and an on-demand source-relevance analysis
for tuning what they watch.

**Read first.** R2-007-CR; 007-CR (Record-Layers) and 008-CR (Aggregation-And-Viewport) for how
sources drive the map layers. Backend contract: `openapi/OpenAPI.json`.

**Backend (OpenAPI only).**
- `GET /v1/me/sources` [`getMySources`] → `UserSourceView` (`UserSourcePref`: `sourceId`,
  `enabled`, `displayName`, `color`).
- `PUT /v1/me/sources` [`updateMySources`] — body `UserSourceViewUpdate` → `UserSourceView`.
- `GET /v1/me/quota` [`getMyQuota`] → `QuotaUsage` (`quota`, `usage`).
- `GET /v1/me/llm/budget` [`getMyLlmBudget`] → `MeLlmBudget` (`providers[]`, `totalSpentUsd`).
- `POST /v1/triggers/analyze-sources` [`analyzeTriggerSources`] — body `SourceRelevanceRequest` →
  `SourceRelevanceAnalysis` (gated `self.alerts`).

**Build.**
- A "My Sources" editor: per-source `enabled`/`displayName`/`color` over the shared collection;
  the map and record layers read this per-user view so a user's styling and visibility take effect.
  Gate `self.sources`.
- A read-only quota/usage panel (`QuotaUsage`) and personal LLM budget (`MeLlmBudget`, `self.llm`).
- A source-relevance action (`analyzeTriggerSources`) that presents the returned
  `SourceRelevanceAnalysis` to help the user choose which sources to keep on.

**Done when.** The per-user source view round-trips through the API and visibly drives the layers;
quota, usage and LLM budget render; the relevance analysis runs and displays. Gated for principals
lacking the respective `self.*` permissions. Compile-only; tests written not run.

**Commit.** `R2-009: Account My Sources, Quota And Relevance`;
`completion-reports/R2-009-CR-Account-My-Sources-Quota-And-Relevance.md` (hash + owner questions).
