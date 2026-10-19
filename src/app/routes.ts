import {
  Crosshair,
  Globe,
  Image,
  Lightbulb,
  Map,
  RadioTower,
  Satellite,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

/** One primary navigation destination. */
export interface NavTab {
  /** Route path. */
  path: string;
  /** Tab label. */
  label: string;
  /** Tab icon. */
  icon: LucideIcon;
}

/** The primary navigation tabs, in order. Each maps to a client-side route. */
export const NAV_TABS: readonly NavTab[] = [
  { path: '/global', label: 'Global', icon: Globe },
  { path: '/analyst', label: 'Analyst', icon: Crosshair },
  { path: '/map', label: 'Map', icon: Map },
  { path: '/imagery', label: 'Imagery', icon: Image },
  { path: '/satellites', label: 'Satellites', icon: Satellite },
  { path: '/rf-sensors', label: 'RF / Sensors', icon: RadioTower },
  { path: '/intelligence', label: 'Intelligence', icon: Lightbulb },
  { path: '/operations', label: 'Operations', icon: Workflow },
];

/** The route the app opens on. */
export const DEFAULT_ROUTE = '/global';
