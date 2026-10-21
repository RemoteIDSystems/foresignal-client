import { useEffect, useMemo, useState } from 'react';
import type { ForesignalClient } from '../api/client';
import { buildConstellation, CONSTELLATION_SOURCES, type Satellite } from './constellation';
import { getGpElements, type GpElement } from './satelliteApi';

/** One source's element sets as read, or why they were not. */
export type SourceState =
  { status: 'loading' } | { status: 'ready'; count: number } | { status: 'error'; message: string };

/** The constellation of the chosen sources, and each source's state. */
export interface ConstellationState {
  satellites: Satellite[];
  sources: Readonly<Record<string, SourceState>>;
}

/** Element sets read so far, per client, by source key; a source is read once per client. */
const reads = new WeakMap<ForesignalClient, Map<string, Promise<GpElement[]>>>();

/** A source's element sets, read once per client; a failed read is tried again next time. */
function readSource(api: ForesignalClient, key: string): Promise<GpElement[]> {
  let known = reads.get(api);
  if (!known) {
    known = new Map();
    reads.set(api, known);
  }
  const kept = known.get(key);
  if (kept) return kept;
  const source = CONSTELLATION_SOURCES.find((entry) => entry.key === key);
  const read = source?.selector ? getGpElements(api, source.selector) : Promise.resolve([]);
  known.set(key, read);
  const map = known;
  read.catch(() => map.delete(key));
  return read;
}

/**
 * The satellites of the chosen sources (`getCelestrakGp`), one per catalog number, in the sources'
 * order. Each source is read once per client and kept, so turning one off and on again does not
 * read it again.
 */
export function useConstellation(
  api: ForesignalClient | undefined,
  chosen: readonly string[],
): ConstellationState {
  const [elements, setElements] = useState<Readonly<Record<string, GpElement[]>>>({});
  const [failures, setFailures] = useState<Readonly<Record<string, string>>>({});
  const key = chosen.join(',');
  useEffect(() => {
    if (!api || !key) return;
    let live = true;
    for (const source of key.split(',')) {
      readSource(api, source).then(
        (list) => live && setElements((known) => ({ ...known, [source]: list })),
        (error: unknown) =>
          live &&
          setFailures((known) => ({
            ...known,
            [source]: error instanceof Error ? error.message : 'It did not load.',
          })),
      );
    }
    return () => {
      live = false;
    };
  }, [api, key]);

  return useMemo(() => {
    const keys = key ? key.split(',') : [];
    const sources: Record<string, SourceState> = {};
    for (const source of keys) {
      const list = elements[source];
      const failure = failures[source];
      sources[source] = list
        ? { status: 'ready', count: list.length }
        : failure
          ? { status: 'error', message: failure }
          : { status: 'loading' };
    }
    const ordered = CONSTELLATION_SOURCES.filter((source) => keys.includes(source.key));
    const satellites = buildConstellation(
      ordered.flatMap((source) => {
        const list = elements[source.key];
        return list ? [{ source: source.key, elements: list }] : [];
      }),
    );
    return { satellites, sources };
  }, [key, elements, failures]);
}
