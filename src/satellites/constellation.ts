import type { SatRec } from 'satellite.js';
import type { ThemeTokens } from '../app/theme';
import { toSatrec } from './orbit';
import type { GpElement, GpSelector } from './satelliteApi';

/** One of the mock's DATA SOURCES, and the backend selector it reads, if any. */
export interface ConstellationSource {
  key: string;
  label: string;
  /** The `getCelestrakGp` selector; none for a source the backend does not serve this way. */
  selector?: GpSelector;
  /** Drawn when the page opens. */
  initial?: boolean;
  /** Why a source without a selector is not offered. */
  unavailable?: string;
}

/**
 * The mock's DATA SOURCES, in its order, each read from the backend's CelesTrak-compatible cache:
 * a CelesTrak group, or a name match (Sentinel). The mock's NORAD, SatDump and Custom have no such
 * selector and are shown unavailable. Stations, Earth resources and weather are drawn at first.
 */
export const CONSTELLATION_SOURCES: readonly ConstellationSource[] = [
  { key: 'stations', label: 'CelesTrak (TLE)', selector: { group: 'stations' }, initial: true },
  {
    key: 'norad',
    label: 'NORAD',
    unavailable: 'The backend serves NORAD catalog numbers one at a time (CATNR), not as a set.',
  },
  { key: 'starlink', label: 'Starlink', selector: { group: 'starlink' } },
  { key: 'planet', label: 'Planet', selector: { group: 'planet' } },
  { key: 'sentinel', label: 'Sentinel', selector: { name: 'SENTINEL' } },
  { key: 'goes', label: 'GOES', selector: { group: 'goes' } },
  { key: 'weather', label: 'Weather Satellites', selector: { group: 'weather' }, initial: true },
  { key: 'resource', label: 'Earth Resources', selector: { group: 'resource' }, initial: true },
  {
    key: 'satdump',
    label: 'SatDump (Local)',
    unavailable: 'SatDump stations are listed under Ground Stations, not as orbits.',
  },
  {
    key: 'custom',
    label: 'Custom Sources',
    unavailable: 'No custom element sets are offered by the backend.',
  },
];

/** A satellite to draw: its element set, its SGP4 record, and the source it was read for. */
export interface Satellite {
  norad: number;
  name: string;
  /** The international designator (`1998-067A`). */
  objectId: string;
  /** The {@link ConstellationSource} key it was read for: its color on the globe. */
  source: string;
  element: GpElement;
  satrec: SatRec;
}

/**
 * The satellites to draw from each source's element sets, in source order: one per catalog number
 * (the first source that lists it keeps it), without element sets SGP4 cannot use.
 */
export function buildConstellation(
  bySource: ReadonlyArray<{ source: string; elements: readonly GpElement[] }>,
): Satellite[] {
  const seen = new Set<number>();
  const satellites: Satellite[] = [];
  for (const { source, elements } of bySource) {
    for (const element of elements) {
      if (seen.has(element.NORAD_CAT_ID)) continue;
      const satrec = toSatrec(element);
      if (!satrec) continue;
      seen.add(element.NORAD_CAT_ID);
      satellites.push({
        norad: element.NORAD_CAT_ID,
        name: element.OBJECT_NAME,
        objectId: element.OBJECT_ID,
        source,
        element,
        satrec,
      });
    }
  }
  return satellites;
}

/** The most satellites whose orbit rings are drawn; above it only the points and labels are. */
export const MAX_RINGS = 400;

/** The most satellites whose labels are drawn. */
export const MAX_LABELS = 150;

/** Satellites matching a search, by name, catalog number or designator, best first. */
export function searchSatellites(
  satellites: readonly Satellite[],
  text: string,
  limit = 20,
): Satellite[] {
  const query = text.trim().toLowerCase();
  if (!query) return [];
  const scored = satellites
    .map((satellite) => {
      const name = satellite.name.toLowerCase();
      const score =
        String(satellite.norad) === query || satellite.objectId.toLowerCase() === query
          ? 0
          : name.startsWith(query)
            ? 1
            : name.includes(query)
              ? 2
              : -1;
      return { satellite, score };
    })
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.satellite.name.localeCompare(b.satellite.name));
  return scored.slice(0, limit).map((entry) => entry.satellite);
}

/**
 * Each source's color on the globe, from the theme's tones, as the mock colors satellites by type:
 * one hue per source.
 */
export function sourceColors(tokens: ThemeTokens): Readonly<Record<string, string>> {
  return {
    stations: tokens.color.text,
    starlink: tokens.tone.infoFg,
    planet: tokens.tone.tealFg,
    sentinel: tokens.tone.violetFg,
    goes: tokens.tone.warningFg,
    weather: tokens.tone.orangeFg,
    resource: tokens.tone.successFg,
  };
}
