import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';
import type { LocateRequest } from '../state/store';

/** A country of the backend's bundled reference table (`listReferenceCountries`). */
export type ReferenceCountry = components['schemas']['CountryRef'];

/** A place the locate bar can move the map to. */
export interface LocateTarget {
  /** What the place is called, as shown in the bar's suggestions. */
  label: string;
  longitude: number;
  latitude: number;
  /** A country's ISO code, when it is one. */
  iso2?: string;
}

/**
 * Reads typed coordinates: `lat, lon` in decimal degrees (`38.8, -122.7`), or with hemisphere
 * letters in either order (`38.8N 122.7W`, `122.7W 38.8N`). Undefined when the text is not a
 * coordinate pair, or is out of range.
 */
export function parseCoordinates(text: string): LocateTarget | undefined {
  const parts = text
    .trim()
    .toUpperCase()
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (parts.length !== 2) return undefined;
  const read = (part: string) => {
    const match = /^([+-]?\d+(?:\.\d+)?)°?([NSEW])?$/.exec(part);
    if (!match) return undefined;
    const value = Number(match[1]);
    const hemisphere = match[2];
    return {
      value: hemisphere === 'S' || hemisphere === 'W' ? -Math.abs(value) : value,
      axis: hemisphere === 'N' || hemisphere === 'S' ? 'lat' : hemisphere ? 'lon' : undefined,
    };
  };
  const first = read(parts[0]!);
  const second = read(parts[1]!);
  if (!first || !second) return undefined;
  const swapped = first.axis === 'lon' || second.axis === 'lat';
  const latitude = swapped ? second.value : first.value;
  const longitude = swapped ? first.value : second.value;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
  return {
    label: `${Math.abs(latitude).toFixed(4)}°${latitude < 0 ? 'S' : 'N'}, ${Math.abs(longitude).toFixed(4)}°${longitude < 0 ? 'W' : 'E'}`,
    longitude,
    latitude,
  };
}

/** A request for the map to move to a place (the store's `locate`), stamped with the time asked. */
export function locateRequest(longitude: number, latitude: number, height?: number): LocateRequest {
  return { longitude, latitude, ...(height !== undefined && { height }), at: Date.now() };
}

/** The backend's country table, with label points and aliases; open, and read once per client. */
const COUNTRIES = new WeakMap<ForesignalClient, Promise<ReferenceCountry[]>>();

/** The reference countries (`listReferenceCountries`), read once per API client. */
export function referenceCountries(api: ForesignalClient): Promise<ReferenceCountry[]> {
  let countries = COUNTRIES.get(api);
  if (!countries) {
    countries = unwrap(api.GET('/v1/reference/countries'));
    countries.catch(() => COUNTRIES.delete(api));
    COUNTRIES.set(api, countries);
  }
  return countries;
}

/**
 * Countries whose name, long name, alias or ISO code matches the text: exact names and codes
 * first, then names starting with it, then names containing it; at most `limit`.
 */
export function matchCountries(
  countries: readonly ReferenceCountry[],
  text: string,
  limit = 5,
): LocateTarget[] {
  const query = text.trim().toLowerCase();
  if (query.length < 2) return [];
  const scored: { score: number; country: ReferenceCountry }[] = [];
  for (const country of countries) {
    const names = [country.name, country.nameLong, ...(country.aliases ?? [])]
      .filter((name): name is string => !!name)
      .map((name) => name.toLowerCase());
    const codes = [country.iso2, country.iso3].map((code) => code?.toLowerCase());
    const score =
      names.includes(query) || codes.includes(query)
        ? 0
        : names.some((name) => name.startsWith(query))
          ? 1
          : names.some((name) => name.includes(query))
            ? 2
            : undefined;
    if (score !== undefined) scored.push({ score, country });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.country.name.localeCompare(b.country.name))
    .slice(0, limit)
    .map(({ country }) => ({
      label: country.name,
      longitude: country.labelLon,
      latitude: country.labelLat,
      iso2: country.iso2,
    }));
}
