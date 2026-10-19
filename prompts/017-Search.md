# 017 — Search & Ask

**Goal.** The top search bar (find entities, locations and events and locate them) **and** the
"Ask ForeSignal" natural-language panel over the data.

**Read first.** 016-CR; [Architecture.md](../docs/Architecture.md) §14. Design: the top-nav search
box, the map find/locate bar, and the "Ask ForeSignal" tool in the left rail.

**Backend (OpenAPI only).**
- `GET /v1/search` [`search`] — search records, briefings and alerts.
- `GET /v1/search/status` [`getSearchStatus`] — semantic-search readiness.
- `POST /v1/ask` [`ask`], `POST /v1/ask/stream` [`askStream`] — natural-language Q&A over the data.
- `GET /v1/ask/threads` [`listAskThreads`], `GET /v1/ask/threads/{id}` [`getAskThread`],
  `DELETE /v1/ask/threads/{id}` [`deleteAskThread`] — thread history.

**Build.**
- Wire the top-nav search box to `search` (debounced), grouped results (records / briefings /
  alerts) with type + summary; selecting a result sets `selection` and flies the map to it.
- A map find/locate bar (coordinates / place lookup) that recenters the camera.
- Fall back to text search when `getSearchStatus` reports semantic search is unavailable; show that
  state.
- **Ask ForeSignal panel:** a streaming Q&A (`askStream`) with cited objects clickable → selection,
  and thread history (`listAskThreads` / `getAskThread`, delete). Show the `409 LLM_NOT_CONFIGURED`
  state plainly when no LLM provider is assigned.

**Done when.** Search returns grouped results and selecting one moves the map; Ask returns a
streamed, cited answer whose citations navigate. Playwright: query → result → map centered;
ask → answer with a clickable citation.

**Commit.** `017: Search & Ask`; `completion-reports/017-CR-Search-And-Ask.md` (hash + owner questions).
