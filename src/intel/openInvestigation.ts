import type { ForesignalClient } from '../api/client';
import type { ObjectEnvelope } from '../objects/objectApi';
import { addInvestigationItem, createInvestigation, type Investigation } from './investigationApi';

/** The envelope action that opens an investigation from an object. */
export const OPEN_INVESTIGATION_ACTION = 'open-investigation';

/**
 * Opens an investigation from an object, as its envelope's `open-investigation` action offers
 * (`createInvestigation`): titled after the object, with the object pinned as its first item
 * (`addInvestigationItem`, an `object` item by its ref). Returns the new investigation; should
 * pinning fail, the investigation is still returned, empty.
 */
export async function openInvestigation(
  api: ForesignalClient,
  envelope: Pick<ObjectEnvelope, 'ref' | 'title'>,
): Promise<Investigation> {
  const investigation = await createInvestigation(api, {
    title: envelope.title.slice(0, 200) || envelope.ref.slice(0, 200),
    status: 'open',
  });
  await addInvestigationItem(api, investigation.id, {
    itemType: 'object',
    ref: envelope.ref,
  }).catch(() => undefined);
  return investigation;
}
