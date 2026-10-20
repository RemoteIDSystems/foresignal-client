# 013 — Time Machine

**Goal.** The time scrubber and history playback: a density histogram, keyframe/delta playback,
entity trails, and a paused (asOf) map.

**Read first.** 012-CR; [Architecture.md](../docs/Architecture.md) §7. Design: the Global and
Satellite time scrubbers (−24h … Now … +24h), Tropical-Storm track.

**Backend (OpenAPI only).**
- `GET /v1/timeline` [`getTimeline`] — scrubber density histogram (buckets; `retainedFrom`).
- `GET /v1/history/frames` [`getHistoryFrames`] — keyframe + delta frames for playback.
- `GET /v1/records/{sourceId}/{externalId}/track` [`getRecordTrack`] — simplified entity trail.
- asOf tiles — the `asOf` form of the TileJSON/tile endpoints (take the concrete returned template;
  never build the time string).

**Build.**
- A scrubber component fed by `getTimeline`; `retainedFrom`/`horizon` clamp the range; the `time`
  store key switches between **live** and an **asOf** cursor.
- Playback: fetch `getHistoryFrames`, apply keyframe then frames in order, step by the scrubber.
- When paused, swap map layers to asOf tiles for the cursor; resume live from `watermarkSeq`.
- Entity trails via `getRecordTrack` for the selected entity.
- Surface `approximate` flags to the user.

**Match the mock.** The scrubber matches the Global/Satellite mock: a date-time box (e.g.
`2025-09-18 14:32:17Z`), a green **LIVE** indicator, and a track labeled `−24h · −6h · Now · +6h ·
+24h` with a handle at Now. Dragging left pauses the map at an asOf instant (history); the future
side shows forecast tracks where a product provides them; returning the handle to Now resumes live.

**Done when.** Dragging the scrubber pauses the map at an instant (asOf tiles), playback steps
through frames, returning to Now resumes the live stream cleanly, and a selected entity shows a
trail. Playwright captures a paused vs live map.

**Commit.** `013: Time Machine`; `completion-reports/013-CR-Time-Machine.md` (hash + owner questions).
