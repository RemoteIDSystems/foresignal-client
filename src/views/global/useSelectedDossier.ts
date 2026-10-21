import { selectionRef } from '../../objects/selectObject';
import { useDossier, type DossierState } from '../../objects/useDossier';
import { appStore, useStoreKey } from '../../state/store';
import { useRecordLayers } from './recordLayersContext';

/** The page's selected object and its dossier, as the panels that show it read them. */
export interface SelectedDossier {
  /** The selected object's ref; undefined with nothing selected, or a hexagon cell. */
  ref?: string;
  /** The time machine's instant while the map is pinned (013). */
  asOf?: string;
  /** The dossier. */
  state: DossierState;
}

/**
 * The selected object's dossier, read as of the time machine's instant while the map is pinned
 * (013) and read again when the live stream says its kind changed (012). Every panel that calls
 * this shares one request: the dossier source answers concurrent reads of one dossier together.
 */
export function useSelectedDossier(): SelectedDossier {
  const layers = useRecordLayers();
  const store = layers?.store ?? appStore;
  const selection = layers?.selection;
  const ref = selectionRef(selection);
  const time = useStoreKey('time', store);
  const asOf = time.mode === 'asOf' ? time.asOf : undefined;
  const live = useStoreKey(`layer:${selection?.id.kind ?? ''}`, store);
  const state = useDossier(layers?.api, ref, asOf, live?.at);
  return { ref, asOf, state };
}
