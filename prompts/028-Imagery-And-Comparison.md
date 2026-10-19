# 028 — Imagery & Change Detection

**Goal.** The imagery panels and the before/after change-detection comparison with its metrics and
run action — recent imagery, thumbnails, swipe compare, and the change-detection result in the
Satellite view.

**Read first.** 027-CR; [Architecture.md](../docs/Architecture.md) §12. Design: Satellite view
RECENT IMAGERY and IMAGERY COMPARISON (before/after swipe, building count / disturbed area /
confidence, "Run Change Detection"); Global RECENT IMAGERY strip.

**Backend (OpenAPI only).**
- `GET /v1/media/{id}` [`getMedia`], `GET /v1/media/{id}/thumbnail` [`getMediaThumbnail`],
  `GET /v1/media/{id}/meta` [`getMediaMeta`].
- Product imagery frames (009): `getLatestProductFrame`, `getProductImage`.
- Imagery evidence also arrives via the dossier `imagery` section (014).

**Build.**
- A Recent Imagery strip/grid from the dossier imagery section and `getMediaThumbnail`, newest
  first, with source/time; click → full media (`getMedia`). Full-screen viewer.
- An Imagery Comparison panel: two frames (dates) with a swipe slider, showing the change metrics
  (building count / disturbed area / confidence) supplied by the backend.
- **Run Change Detection:** wire the mockup's action to its backend operation. If the OpenAPI
  exposes a change-detection operation, call it and show progress + result; if it does not, record
  it as an **owner question** in the completion report (per the Charter: a missing backend
  capability is surfaced, never faked in the client) and render the comparison from supplied
  results. Either way the comparison and metrics are built now, not deferred.

**Done when.** Recent imagery renders and opens full frames; the swipe compare works between two
dates with metrics; the run action either invokes its backend op or is reported as an owner question
with the comparison still functional. Playwright: imagery strip + swipe compare render.

**Commit.** `028: Imagery & Change Detection`;
`completion-reports/028-CR-Imagery-And-Change-Detection.md` (hash + owner questions).
