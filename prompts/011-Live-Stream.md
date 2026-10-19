# 011 — Live Stream

**Goal.** Keep the map and panels current from **one** multiplexed, resumable SSE stream — not one
per source — with re-filtering, resume and catch-up.

**Read first.** 010-CR; [Architecture.md](../docs/Architecture.md) §6.1. Design: the "LIVE" state
on the Global/Tropical-Storm maps and the Activity Timeline.

**Backend (OpenAPI only).**
- `GET /v1/events/stream` [`streamEvents`] — multiplexed, re-filterable event stream (SSE).
- `PATCH /v1/events/stream/{streamId}/filter` [`updateEventStreamFilter`] — swap the open stream's
  filter (on layer/viewport change).
- `GET /v1/changes/stream` [`streamChanges`] — record change stream (head updates, frame/template swaps).
- `GET /v1/changes` [`listChanges`] — `after=<seq>` catch-up after background.
- `POST /v1/stream-tickets` [`createStreamTicket`] — `?ticket=` for `EventSource` when reads are closed.

**Build.**
- `api/stream/ChangeStream.ts`: a hand-written SSE client that opens one stream, resumes with
  `Last-Event-ID`, reconnects with backoff when heartbeats stop, catches up via `listChanges` on
  resume, and reloads affected layers on `410 RESYNC_REQUIRED`.
- Re-filter the open stream as enabled layers / viewport change (debounced), using
  `updateEventStreamFilter`; confirm application via `filter-applied {atSeq}`.
- Pass a ticket when reads are closed; over HTTP/1.1 keep exactly one stream (optionally a
  `SharedWorker` owning it across tabs).
- Emit parsed events to the store (012) as per-key deltas; new raster frames swap the 009 template.

**Done when.** A single stream stays connected, survives a forced reconnect without data loss
(resume + catch-up), re-filters live when layers change, and drives a visible live update on the
map. Unit-test resume/backoff/resync with a fake event source.

**Commit.** `011: Live Stream`; `completion-reports/011-CR-Live-Stream.md` (hash + owner questions).
