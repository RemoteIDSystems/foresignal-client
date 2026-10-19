# Client screen ideas

Parked design material for the future Foresignal client applications (3D globe, analyst workstation, satellite, RF/sensors, intelligence and operations workspaces). These are **not** part of the broker build: no prompt reads or implements them. They will move to the client projects when those repositories exist.

| File | What it shows | Served by (Foresignal) |
|---|---|---|
| `Foresignal Global Intelligence Dashboard.png` | Global situational-awareness view: layers, live globe, selected-object panel, activity timeline, insights, related entities | records, tiles and SSE; dossier and context summary (129); situations (118); ledger (122) |
| `Foresignal Conflict Intelligence Dashboard.png` | Situation "full analysis" (Russia–Ukraine): conflict layers, AI analysis tabs, timeline, territorial change, metrics, evidence, competing hypotheses, forecasts | situations (118), assessments incl. on-demand (128), findings and series (119), hypotheses (125), ledger history (122), evidence items (130), news coverage (133) |
| `Foresignal Tropical Storm Intelligence Dashboard.png` | Investigation workspace (tropical storm): key findings, filters, map with official track and cone, evidence, hypotheses, forecasts, related intelligence | investigations (101, 130), dossier (129), impact projection (127), ledger (122) |
| `Foresignal Intelligence Dashboard Split-Screen.png` | Analyst workbench (evidence graph, timeline, hypotheses, notes) and satellite operations (constellation, passes, imagery, comparison) | relation graph (129), comments and TLP (130), chronicles (131), reports (132), sensor discovery (129), raster and STAC products (042–046, 096) |

Every panel is meant to be served by Foresignal through `docs/Client-Contract.md`; the client owns presentation only. Satellite tasking and imagery change detection are outside the broker (see `docs/Intelligence-Design.md` §16).
