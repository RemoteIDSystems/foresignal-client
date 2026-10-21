import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';

/** One CCSDS OMM element set in CelesTrak's `FORMAT=JSON` shape (`CelestrakGpElement`). */
export type GpElement = components['schemas']['CelestrakGpElement'];

/** Something that can observe an area in a window (`Sensor`; no tasking). */
export type Sensor = components['schemas']['Sensor'];

/** What can observe an area in a window (`SensorDiscoveryResult`). */
export type SensorDiscovery = components['schemas']['SensorDiscoveryResult'];

/** A sensor's kind: `source`, `receiver`, `station`, `satellite`, `scene` or `raster-product`. */
export type SensorKind = Sensor['sensorKind'];

/** A record as `listRecords` returns it. */
export type SatelliteRecord = components['schemas']['Record'];

/** One selector of `getCelestrakGp`: a CelesTrak group, or a substring of the object's name. */
export type GpSelector = { group: string } | { name: string };

/** What `getCelestrakGp` answers, with status 200, when nothing matches. */
export const NO_GP_DATA = 'No GP data found';

/**
 * The element sets for one selector, from the backend's CelesTrak-compatible endpoint
 * (`getCelestrakGp`, `FORMAT=json`), which serves its `celestrak-gp` cache and never calls
 * CelesTrak. "No GP data found" (a 200 in plain text) is an empty list.
 */
export async function getGpElements(
  api: ForesignalClient,
  selector: GpSelector,
  signal?: AbortSignal,
): Promise<GpElement[]> {
  const text = await unwrap(
    api.GET('/compat/celestrak/gp.php', {
      params: {
        query: {
          FORMAT: 'json',
          ...('group' in selector ? { GROUP: selector.group } : { NAME: selector.name }),
        },
      },
      parseAs: 'text',
      signal,
    }),
  );
  const body = String(text).trim();
  if (!body || body === NO_GP_DATA) return [];
  const parsed = JSON.parse(body) as unknown;
  return Array.isArray(parsed) ? (parsed as GpElement[]) : [];
}

/**
 * The sensors that can observe an area in a window (`listSensors`): sources, receivers and
 * stations in range, predicted satellite passes, scenes and raster products.
 */
export function listSensors(
  api: ForesignalClient,
  bbox: readonly [number, number, number, number],
  from: string,
  to: string,
  kinds?: readonly SensorKind[],
  signal?: AbortSignal,
): Promise<SensorDiscovery> {
  return unwrap(
    api.GET('/v1/sensors', {
      params: {
        query: {
          bbox: bbox.join(','),
          from,
          to,
          limit: 500,
          ...(kinds && kinds.length > 0 && { kinds: [...kinds] }),
        },
      },
      signal,
    }),
  );
}

/**
 * A satellite's record (`listRecords`, kind `satellite`), found by its international designator,
 * which the `celestrak-gp` source searches (`OBJECT_ID`); the one with the same catalog number is
 * kept. Undefined when the backend holds none.
 */
export async function findSatelliteRecord(
  api: ForesignalClient,
  objectId: string,
  norad: number,
  signal?: AbortSignal,
): Promise<SatelliteRecord | undefined> {
  const page = await unwrap(
    api.GET('/v1/records', {
      params: { query: { kind: ['satellite'], q: objectId, limit: 20 } },
      signal,
    }),
  );
  const { items } = page as { items: SatelliteRecord[] };
  return (
    items.find((record) => Number(recordField(record, 'NORAD_CAT_ID')) === norad) ??
    items.find((record) => recordField(record, 'OBJECT_ID') === objectId)
  );
}

/** A field of a record's payload, by its upstream name; undefined when absent. */
export function recordField(record: SatelliteRecord, name: string): unknown {
  return (record.payload as Record<string, unknown>)[name];
}
