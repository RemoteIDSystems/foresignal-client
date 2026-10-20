import type { Track } from './timeApi';

/** How far back a selected entity's trail reaches from the time cursor, in ms. */
export const TRAIL_WINDOW_MS = 6 * 3_600_000;

/** What a trail shows: its drawable segments and what the backend said of it. */
export interface Trail {
  /** Segments of two or more distinct positions, as [longitude, latitude]. */
  lines: [number, number][][];
  /** Positions the backend returned. */
  points: number;
  /** True when the trail was simplified or estimated (the backend's `approximate`). */
  approximate: boolean;
  /** True when its last position is the entity's current live one. */
  live: boolean;
}

/**
 * Reads a track (`getRecordTrack`) into drawable segments: each segment of the multi-line with its
 * repeated positions collapsed, keeping those that still have two positions. A stationary
 * record's trail, its one point repeated, has no segments: there is nothing to draw but the record.
 */
export function trailOf(track: Track): Trail {
  const geometry = track.geometry as { type?: string; coordinates?: unknown } | null;
  const segments: number[][][] =
    geometry?.type === 'MultiLineString'
      ? (geometry.coordinates as number[][][])
      : geometry?.type === 'LineString'
        ? [geometry.coordinates as number[][]]
        : [];
  const lines: [number, number][][] = [];
  let points = 0;
  for (const segment of segments) {
    const line: [number, number][] = [];
    for (const [lon, lat] of segment) {
      if (lon === undefined || lat === undefined) continue;
      points++;
      const last = line[line.length - 1];
      if (!last || last[0] !== lon || last[1] !== lat) line.push([lon, lat]);
    }
    if (line.length >= 2) lines.push(line);
  }
  return {
    lines,
    points,
    approximate: track.properties.approximate === true,
    live: track.properties.live === true,
  };
}
