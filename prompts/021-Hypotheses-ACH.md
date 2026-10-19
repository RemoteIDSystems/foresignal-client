# 021 — Hypotheses (ACH)

**Goal.** The competing-hypotheses panel with the ACH matrix and information value — the Conflict
Dashboard's COMPETING HYPOTHESES and the Analyst Workbench hypotheses.

**Read first.** 020-CR; [Architecture.md](../docs/Architecture.md) §10. Design: COMPETING HYPOTHESES
(H1…Hn with probabilities, indicators, confidence) and the hypothesis builder.

**Backend (OpenAPI only).**
- `GET /v1/hypotheses/sets` [`listHypothesisSets`], `GET /v1/hypotheses/sets/{id}` [`getHypothesisSet`].
- `GET /v1/hypotheses/sets/{id}/matrix` [`getAchMatrix`] — the ACH matrix.
- `GET /v1/hypotheses/sets/{id}/information-value` [`getInformationValue`] — rank pending indicators.
- `GET /v1/indicators` [`listIndicators`].

**Build.**
- A hypotheses panel listing each hypothesis with probability, supporting/contradicting indicator
  counts, and confidence (read-only rendering of `getHypothesisSet`).
- An ACH matrix view from `getAchMatrix` (hypotheses × evidence, consistency scoring).
- Information-value ranking of pending indicators from `getInformationValue`.

**Done when.** A situation/investigation shows its competing hypotheses with probabilities and an
ACH matrix. Playwright: hypotheses panel + matrix render.

**Commit.** `021: Hypotheses ACH`; `completion-reports/021-CR-Hypotheses-ACH.md` (hash + owner questions).
