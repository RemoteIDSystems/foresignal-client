import { useCallback, useMemo, useState } from 'react';
import type { ForesignalClient } from '../../api/client';
import { DashboardLayout, type DockPanel } from '../../app/DashboardLayout';
import { useTheme } from '../../app/theme';
import { defaultEnabled, enabledKinds } from '../../map/records/catalog';
import type { RecordLayerStatus } from '../../map/records/recordLayers';
import { useLayerCatalog } from '../../map/records/useLayerCatalog';
import { useOverlayStyle } from '../../map/style/useOverlayStyle';
import { MapViewer } from '../../map/Viewer';
import {
  ActivityTimelinePanel,
  InsightsPanel,
  RecentImageryPanel,
  RelatedEntitiesPanel,
} from './BottomPanels';
import { LayersRail } from './LayersRail';
import { RecordLayersContext, type RecordLayersValue } from './recordLayersContext';
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
 * the bottom row of imagery, activity, insights and related entities. The rail and the map share
 * the overlay style, the layer catalog and the enabled layer set, which starts with every kind
 * that has records now. The other panels are skeletons with placeholder data until their prompts.
 */
export function GlobalDashboard({ api }: { api?: ForesignalClient }) {
  const theme = useTheme();
  const overlayStyle = useOverlayStyle(api, theme.name);
  const overlay = overlayStyle.status === 'ready' ? overlayStyle.overlay : undefined;
  const catalogState = useLayerCatalog(api, overlay?.model);
  const catalog = catalogState.status === 'ready' ? catalogState.catalog : undefined;
  // The user's choice once they toggle; until then the default for the catalog.
  const [chosen, setChosen] = useState<ReadonlySet<string>>();
  const enabled = useMemo(
    () => chosen ?? new Set(catalog ? defaultEnabled(catalog) : []),
    [chosen, catalog],
  );
  const [statuses, setStatuses] = useState<Record<string, RecordLayerStatus>>({});

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(enabled);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setChosen(next);
    },
    [enabled],
  );
  const clear = useCallback(() => setChosen(new Set()), []);
  const onLayerStatus = useCallback((id: string, status: RecordLayerStatus) => {
    setStatuses((current) => ({ ...current, [id]: status }));
  }, []);

  const recordLayers = useMemo(() => [...enabled], [enabled]);
  const legendScope = useMemo(
    () => (catalog ? enabledKinds(catalog, enabled) : undefined),
    [catalog, enabled],
  );
  const value = useMemo<RecordLayersValue>(
    () => ({
      catalog: catalogState,
      enabled,
      toggle,
      clear,
      statuses,
      sprite: overlay?.sprite,
      api,
    }),
    [catalogState, enabled, toggle, clear, statuses, overlay, api],
  );

  return (
    <RecordLayersContext.Provider value={value}>
      <DashboardLayout
        map={
          <MapViewer
            api={api}
            overlayStyle={overlayStyle}
            recordLayers={recordLayers}
            legendScope={legendScope}
            onLayerStatus={onLayerStatus}
          >
            <TimeHudPlaceholder />
          </MapViewer>
        }
        panels={PANELS}
      />
    </RecordLayersContext.Provider>
  );
}
