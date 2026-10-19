# ForeSignal Client — design mockups

The authoritative visual spec for this client. Each screen-building prompt matches the relevant
mockup here (build order in [`../docs/Roadmap.md`](../docs/Roadmap.md); rationale in
[`../docs/Product-Charter.md`](../docs/Product-Charter.md) and
[`../docs/Architecture.md`](../docs/Architecture.md)).

**The backend API is defined solely by [`../openapi/OpenAPI.json`](../openapi/OpenAPI.json).** These
images describe layout and behavior only — they are not an API reference, and no prose document is.

| File | Screen |
|---|---|
| `Foresignal Global Intelligence Dashboard.png` | **Primary.** Global situational awareness: layers rail, live 2D/3D globe, selected-entity dossier, activity timeline, insights, related entities |
| `Foresignal Conflict Intelligence Dashboard.png` | Situation full analysis (Russia–Ukraine): conflict layers, AI analysis tabs, timeline, territorial change, metrics, evidence, competing hypotheses, forecasts |
| `Foresignal Tropical Storm Intelligence Dashboard.png` | Investigation workspace: key findings, filters, map with official track and cone, evidence, hypotheses, forecasts, related intelligence |
| `ForeSignal_Analyst_Workbench.png` | Evidence/relationship graph, timeline, hypotheses, analyst notes |
| `ForeSignal_Analysis_View.png` | Satellite operations / analysis: constellation (3D globe, live orbits), passes, imagery, change detection |
| `Foresignal Intelligence Dashboard Split-Screen.png` | Split view: the Analyst Workbench and satellite operations side by side (same components as the two rows above) |

Two nav spaces — **RF / Sensors** and **Operations** — have no mockup; they are built from backend
capabilities in this same design language (prompts 032–033), review-gated so the owner shapes them.
