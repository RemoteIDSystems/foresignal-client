/** One hour, in ms. */
const HOUR = 3_600_000;

/**
 * The scrubber's labeled marks, as the Global and Satellite mocks draw them: evenly spaced along
 * the track, so the six hours either side of Now get as much room as the eighteen beyond them.
 */
export const SCRUB_MARKS: readonly { label: string; offset: number; at: number }[] = [
  { label: '-24h', offset: -24 * HOUR, at: 0 },
  { label: '-6h', offset: -6 * HOUR, at: 0.25 },
  { label: 'Now', offset: 0, at: 0.5 },
  { label: '+6h', offset: 6 * HOUR, at: 0.75 },
  { label: '+24h', offset: 24 * HOUR, at: 1 },
];

/** The earliest offset from now the scrubber reaches, in ms (−24 h). */
export const SCRUB_PAST_MS = -SCRUB_MARKS[0]!.offset;

/**
 * The offset from now, in ms, at a position along the track (0 at −24h, 1 at +24h): linear between
 * neighboring marks. Positions outside 0…1 are clamped.
 */
export function positionToOffset(position: number): number {
  const p = Math.min(1, Math.max(0, position));
  for (let i = 1; i < SCRUB_MARKS.length; i++) {
    const a = SCRUB_MARKS[i - 1]!;
    const b = SCRUB_MARKS[i]!;
    if (p <= b.at) return a.offset + ((p - a.at) / (b.at - a.at)) * (b.offset - a.offset);
  }
  return SCRUB_MARKS[SCRUB_MARKS.length - 1]!.offset;
}

/**
 * The position along the track (0…1) of an offset from now in ms; the inverse of
 * {@link positionToOffset}.
 */
export function offsetToPosition(offset: number): number {
  const first = SCRUB_MARKS[0]!;
  const last = SCRUB_MARKS[SCRUB_MARKS.length - 1]!;
  if (offset <= first.offset) return first.at;
  for (let i = 1; i < SCRUB_MARKS.length; i++) {
    const a = SCRUB_MARKS[i - 1]!;
    const b = SCRUB_MARKS[i]!;
    if (offset <= b.offset)
      return a.at + ((offset - a.offset) / (b.offset - a.offset)) * (b.at - a.at);
  }
  return last.at;
}

/** An instant as the HUD shows it, in UTC to the second: `2025-09-18 14:32:17Z`. */
export function formatHudTime(at: number | Date): string {
  const iso = new Date(at).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}Z`;
}

/**
 * An instant as an RFC 3339 string to the whole second (`2025-09-18T14:32:17Z`): the form the
 * backend's `asOf` takes without redirecting (it normalizes other forms with a 301).
 */
export function wholeSecondIso(at: number | Date): string {
  return `${new Date(at).toISOString().slice(0, 19)}Z`;
}

/** Fewest seconds between history frames the backend accepts. */
export const MIN_FRAME_STEP_S = 10;

/** How many frames a playback aims for across its span. */
export const PLAYBACK_FRAMES = 120;

/**
 * The step between history frames for a span, as the backend's duration (`90s`): the span over
 * {@link PLAYBACK_FRAMES}, never under {@link MIN_FRAME_STEP_S}, to the whole second.
 */
export function frameStep(spanMs: number): string {
  return `${Math.max(MIN_FRAME_STEP_S, Math.ceil(spanMs / PLAYBACK_FRAMES / 1_000))}s`;
}

/**
 * The cursor instant for a position, clamped to what can be shown: no earlier than `earliest`
 * (the backend's retention) and no later than now. The scrubber never pins the map in the future:
 * that side is for forecast tracks, which no product provides yet.
 */
export function clampInstant(at: number, now: number, earliest?: number): number {
  return Math.min(now, Math.max(earliest ?? -Infinity, now - SCRUB_PAST_MS, at));
}
