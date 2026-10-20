import { createContext, useContext } from 'react';
import type { ForesignalClient } from '../../api/client';
import type { RecordLayerStatus } from '../../map/records/recordLayers';
import type { LayerCatalogState } from '../../map/records/useLayerCatalog';
import type { SpriteSheet } from '../../map/style/sprite';

/** What the layer rail reads and changes. The enabled set moves to the store in 012. */
export interface RecordLayersValue {
  /** The layer catalog: `listTileLayers` with counts and icons. */
  catalog: LayerCatalogState;
  /** Enabled layer ids. */
  enabled: ReadonlySet<string>;
  /** Turns a layer on or off. */
  toggle: (id: string) => void;
  /** Turns every layer off. */
  clear: () => void;
  /** What each enabled layer draws now. */
  statuses: Readonly<Record<string, RecordLayerStatus>>;
  /** The overlay style's sprite, for icons. */
  sprite?: SpriteSheet;
  api?: ForesignalClient;
}

/** The Global Dashboard's record layers, for the rail inside its dock panel. */
export const RecordLayersContext = createContext<RecordLayersValue | undefined>(undefined);

/** The record layers, or undefined outside a page that provides them. */
export function useRecordLayers(): RecordLayersValue | undefined {
  return useContext(RecordLayersContext);
}
