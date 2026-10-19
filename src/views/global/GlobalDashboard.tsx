import type { ForesignalClient } from '../../api/client';
import { DashboardLayout, type DockPanel } from '../../app/DashboardLayout';
import {
  ActivityTimelinePanel,
  InsightsPanel,
  RecentImageryPanel,
  RelatedEntitiesPanel,
} from './BottomPanels';
import { LayersRail } from './LayersRail';
import { MapViewer } from '../../map/Viewer';
import { TimeHudPlaceholder } from './TimeHudPlaceholder';
import { SelectedEntityPanel } from './SelectedEntityPanel';

/** The Global Dashboard's panels and the slots they dock into. */
const PANELS: readonly DockPanel[] = [
  { id: 'layers', title: 'Layers', slot: 'left', render: () => <LayersRail /> },
  {
    id: 'selected-entity',
    title: 'Selected Entity',
    slot: 'right',
    render: (close) => <SelectedEntityPanel onClose={close} />,
  },
  {
    id: 'recent-imagery',
    title: 'Recent Imagery',
    slot: 'bottom',
    grow: 1.12,
    render: (close) => <RecentImageryPanel onClose={close} />,
  },
  {
    id: 'activity',
    title: 'Activity Timeline',
    slot: 'bottom',
    grow: 1.06,
    render: () => <ActivityTimelinePanel />,
  },
  {
    id: 'insights',
    title: 'Analytics & Insights',
    slot: 'bottom',
    grow: 1.03,
    render: (close) => <InsightsPanel onClose={close} />,
  },
  {
    id: 'related',
    title: 'Related Entities',
    slot: 'bottom',
    grow: 0.94,
    render: () => <RelatedEntitiesPanel />,
  },
];

/**
 * The Global Intelligence Dashboard (primary mockup): layers rail, map, selected-entity panel and
 * the bottom row of imagery, activity, insights and related entities. Skeleton with placeholder
 * data; later prompts wire each panel to the backend. The map gets `api` for its overlay style.
 */
export function GlobalDashboard({ api }: { api?: ForesignalClient }) {
  return (
    <DashboardLayout
      map={
        <MapViewer api={api}>
          <TimeHudPlaceholder />
        </MapViewer>
      }
      panels={PANELS}
    />
  );
}
