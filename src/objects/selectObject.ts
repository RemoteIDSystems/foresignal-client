import type { ForesignalClient } from '../api/client';
import { parseObjectRef, recordRef } from '../lib/objectRef';
import type { RecordHit } from '../map/records/recordPicking';
import { envelopePoint } from './dossierView';
import { dossiersFor } from './objectApi';

/**
 * The selection for an object named by its ref, from a panel rather than the map (an activity row,
 * a related object, a search result): its dossier is read (and kept, so the selected-entity panel
 * opens it at once) for its title, position and kind. A record is selected as the map would pick
 * it (layer and kind its kind, with its source and id), so its marker and trail show; any other
 * object carries its ref. An object with no position has non-finite coordinates: it is shown in
 * the panel and the map stays where it is.
 */
export async function hitForRef(
  api: ForesignalClient,
  ref: string,
  asOf?: string,
  signal?: AbortSignal,
): Promise<RecordHit> {
  const dossier = await dossiersFor(api).load(ref, asOf, signal);
  const { envelope } = dossier;
  const parts = parseObjectRef(ref);
  const fields =
    dossier.sections.overview?.status === 'ok' ? dossier.sections.overview.fields : undefined;
  const kind = typeof fields?.kind === 'string' ? fields.kind : envelope.type;
  const point = envelopePoint(envelope);
  return {
    id: {
      layer: kind,
      kind,
      ...(parts?.record
        ? { source: parts.record.sourceId, externalId: parts.record.externalId }
        : { ref }),
    },
    title: envelope.title,
    type: 'point',
    longitude: point?.[0] ?? Number.NaN,
    latitude: point?.[1] ?? Number.NaN,
    distance: 0,
  };
}

/**
 * A selection's object ref: the one it carries (a panel's selection), else a record's, from the
 * source and id the map picked it by. Undefined for nothing selected, or a hexagon cell.
 */
export function selectionRef(selection: RecordHit | undefined): string | undefined {
  const id = selection?.id;
  if (id?.ref) return id.ref;
  return id?.source !== undefined && id.externalId !== undefined
    ? recordRef(id.source, id.externalId)
    : undefined;
}
