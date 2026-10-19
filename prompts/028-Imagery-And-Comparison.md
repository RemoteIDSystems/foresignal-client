# 028 — Imagery And Comparison

**Goal.** The imagery panels and the before/after change-detection comparison — recent imagery,
thumbnails, and a swipe compare.

**Read first.** 027-CR; [Architecture.md](../docs/Architecture.md) §12. Design: Satellite view
RECENT IMAGERY and IMAGERY COMPARISON (before/after swipe, building count / disturbed area /
confidence); Global RECENT IMAGERY strip.

**Backend (OpenAPI only).**
- `GET /v1/media/{id}` [`getMedia`], `GET /v1/media/{id}/thumbnail` [`getMediaThumbnail`],
  `GET /v1/media/{id}/meta` [`getMediaMeta`].
- Product imagery frames (009): `getLatestProductFrame`, `getProductImage`.
- Imagery evidence also arrives via the dossier `imagery` section (014).

**Build.**
- A Recent Imagery strip/grid from the dossier imagery section and `getMediaThumbnail`, newest
  first, with source/time; click → full media (`getMedia`).
- An Imagery Comparison panel: two frames (dates) with a **swipe slider** (a UI widget), showing the
  provided change metrics (building count / disturbed area / confidence) as supplied by the backend.
- Full-screen imagery viewer.

**Done when.** Recent imagery renders with thumbnails and opens full frames; the comparison swipe
works between two dates and shows the metrics. Playwright: imagery strip + swipe compare render.

**Commit.** `028: Imagery And Comparison`; `completion-reports/028-CR-Imagery-And-Comparison.md` (hash + owner questions).
