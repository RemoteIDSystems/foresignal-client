# 017 — Search

**Goal.** The top search bar: find entities, locations and events, and locate them on the map.

**Read first.** 016-CR; [Architecture.md](../docs/Architecture.md) §14. Design: the top-nav search
box ("Search entities, locations, events…") and the find/locate bar on the map.

**Backend (OpenAPI only).**
- `GET /v1/search` [`search`] — search records, briefings and alerts.
- `GET /v1/search/status` [`getSearchStatus`] — semantic-search readiness.

**Build.**
- Wire the top-nav search box to `search` (debounced), grouped results (records / briefings /
  alerts) with type + summary; selecting a result sets `selection` and flies the map to it.
- A map find/locate bar (coordinates / place lookup) that recenters the camera.
- Degrade to text search when `getSearchStatus` reports semantic search is not ready; show that state.

**Done when.** Typing in the search box returns grouped results; choosing one selects it and moves
the map. Playwright: query → result → map centered on it.

**Commit.** `017: Search`; `completion-reports/017-CR-Search.md` (hash + owner questions).
