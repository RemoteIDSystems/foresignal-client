import { ListChecks, MapPin, Save, type LucideIcon } from 'lucide-react';
import type { SavedTab } from '../state/store';

/** One saved-state entry of a rail: its dialog tab, label and icon. */
export interface SavedEntry {
  tab: SavedTab;
  label: string;
  icon: LucideIcon;
}

/** The saved-state entries the rails list (031), in order. */
export const SAVED_ENTRIES: readonly SavedEntry[] = [
  { tab: 'views', label: 'Saved Views', icon: Save },
  { tab: 'places', label: 'Places', icon: MapPin },
  { tab: 'watchlists', label: 'Watchlists', icon: ListChecks },
];
