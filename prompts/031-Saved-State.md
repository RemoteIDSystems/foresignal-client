# 031 — Saved State

**Goal.** Places, saved views and watchlists — reusable, named layer/filter sets and areas of
interest.

**Read first.** 030-CR; [Architecture.md](../docs/Architecture.md) §14. Design: Saved Views /
Watchlists entries in the left rails.

**Backend (OpenAPI only).**
- Places: `GET /v1/places` [`listPlaces`], `POST /v1/places` [`createPlace`], `GET /v1/places/{id}`
  [`getPlace`], `GET /v1/places/{id}/weather` [`getPlaceWeather`].
- Views: `GET /v1/views` [`listViews`], `POST /v1/views` [`createView`], `GET /v1/views/{id}/records`
  [`getViewRecords`], `GET /v1/views/{id}/tiles.json` [`getViewTileJson`], `GET /v1/views/{id}/stream`
  [`streamView`].
- Watchlists: `GET /v1/watchlists` [`listWatchlists`], `POST /v1/watchlists` [`createWatchlist`],
  `GET /v1/watchlists/{id}/items` [`listWatchlistItems`], `POST …/items` [`addWatchlistItems`].

**Build.**
- A Saved Views list: save the current layer/filter set as a view (`createView`) and reopen it;
  a saved view renders from its own tiles (`getViewTileJson`) and live stream (`streamView`) — one
  source for a whole set.
- Places: create/list places (AOIs), fly-to, show place weather.
- Watchlists: list/add items; a watchlist widget surfacing its entities' current state.

**Match the mock.** Saved Views and Watchlists appear as entries in the left rails (Global rail and
the Workbench WORKSPACE section), each row openable; Places are AOIs with fly-to. Saving the current
layer/filter set creates a view that reopens with the same state.

**Done when.** A view saved from the current map reopens with the same layers; a place recenters the
map; a watchlist shows its items. Playwright: save view → reopen restores layers.

**Commit.** `031: Saved State`; `completion-reports/031-CR-Saved-State.md` (hash + owner questions).
