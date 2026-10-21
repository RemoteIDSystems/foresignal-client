import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import { toFsError } from '../api/errors';
import type { components } from '../api/generated/schema';

/** A record as `listRecords` returns it. */
export type RfRecord = components['schemas']['Record'];

/** The code `getGroundStationPolarplot` answers 404 with while the station tracks no pass. */
export const NO_ACTIVE_PASS = 'NO_ACTIVE_PASS';

/**
 * A SatDump ground station's latest polar plot (`getGroundStationPolarplot`), as a blob. The
 * backend holds it in memory during an active autotrack pass only; outside a pass it answers 404
 * `NO_ACTIVE_PASS`, thrown here as an `FsError` with that code.
 */
export async function getPolarplotBlob(
  api: ForesignalClient,
  sourceId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const { data, error, response } = await api.GET('/v1/ground-stations/{sourceId}/polarplot.jpeg', {
    params: { path: { sourceId } },
    parseAs: 'blob',
    headers: { Accept: 'image/jpeg, application/problem+json' },
    signal,
  });
  if (!response.ok) throw toFsError(response, error);
  if (!(data instanceof Blob)) throw new Error(`HTTP ${response.status}`);
  return data;
}

/**
 * The newest records of the RF and signal kinds in an area (`listRecords`, newest observed first),
 * for the signals list. No kinds asks for nothing.
 */
export async function listSignals(
  api: ForesignalClient,
  kinds: readonly string[],
  bbox: readonly [number, number, number, number],
  limit: number,
  signal?: AbortSignal,
): Promise<RfRecord[]> {
  if (kinds.length === 0) return [];
  const page = await unwrap(
    api.GET('/v1/records', {
      params: {
        query: { kind: [...kinds], bbox: bbox.join(','), limit, order: 'observed' },
      },
      headers: { Accept: 'application/json' },
      signal,
    }),
  );
  return (page as { items: RfRecord[] }).items;
}
