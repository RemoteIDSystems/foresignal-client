import { createContext, useContext } from 'react';
import type { ForesignalClient } from '../../api/client';
import type { ProductEntry } from '../../map/products/productCatalog';
import type { ProductLayerStatus } from '../../map/products/productLayers';
import type { RecordLayerStatus } from '../../map/records/recordLayers';
import type { RecordHit } from '../../map/records/recordPicking';
import type { LayerCatalogState } from '../../map/records/useLayerCatalog';
import type { SpriteSheet } from '../../map/style/sprite';
import type { ViewSummaryState } from '../../state/contextSummary';
import type { AppState, Store } from '../../state/store';

/** What the rail reads and changes. The enabled set moves to the store in 012. */
export interface RecordLayersValue {
  /** The layer catalog: kinds by category, with counts and icons, and the sources. */
  catalog: LayerCatalogState;
  /** Enabled kinds. */
  enabled: ReadonlySet<string>;
  /** Turns one kind on or off. */
  toggle: (kind: string) => void;
  /** Turns several kinds on or off together (a category's checkbox). */
  setKinds: (kinds: readonly string[], on: boolean) => void;
  /** Turns every kind off. */
  clear: () => void;
  /** Sources whose records are hidden (the FILTERS tab). */
  hiddenSources: ReadonlySet<string>;
  /** Hides or shows one source's records. */
  toggleSource: (source: string) => void;
  /** Shows every source again. */
  showAllSources: () => void;
  /** What each drawn kind's layer shows now. */
  statuses: Readonly<Record<string, RecordLayerStatus>>;
  /** The backend's raster products and wind fields (009), listed under their categories. */
  products: ProductLayersValue;
  /** The record selected on the map (010), for the selected-entity dossier (014). */
  selection?: RecordHit;
  /** The overlay style's sprite, for icons. */
  sprite?: SpriteSheet;
  api?: ForesignalClient;
  /** The store the page reads (012), for the time cursor and the kinds' live state. */
  store?: Store<AppState>;
  /** The view's context summary (015): counts, activity, insights and related objects. */
  summary?: ViewSummaryState;
  /** Selects an object by its ref, as if picked on the map (015, 016, 017); rejects if it cannot be read. */
  selectRef?: (ref: string) => Promise<void>;
}

/** What the rail reads and changes of the product layers. */
export interface ProductLayersValue {
  /** The products the rail lists. */
  entries: readonly ProductEntry[];
  /** Product layers on, by key (`productLayerKey`). */
  enabled: ReadonlySet<string>;
  /** Turns product layers on or off together. */
  setKeys: (keys: readonly string[], on: boolean) => void;
  /** What each product layer shows now. */
  statuses: Readonly<Record<string, ProductLayerStatus>>;
}

/** The Global Dashboard's record layers, for the rail inside its dock panel. */
export const RecordLayersContext = createContext<RecordLayersValue | undefined>(undefined);

/** The record layers, or undefined outside a page that provides them. */
export function useRecordLayers(): RecordLayersValue | undefined {
  return useContext(RecordLayersContext);
}
