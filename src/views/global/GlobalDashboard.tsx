import { useCallback, useMemo, useState } from 'react';
import type { ForesignalClient } from '../../api/client';
import { DashboardLayout, type DockPanel } from '../../app/DashboardLayout';
import { useTheme } from '../../app/theme';
import { defaultEnabled, drawnLayers, enabledKinds } from '../../map/records/catalog';
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
 * the overlay style, the layer catalog, the enabled kinds (at first, the kinds of the categories the
 * mock shows checked) and the sources the FILTERS tab hides. The other panels are skeletons with
 * placeholder data until their prompts.
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
    (kind: string) => {
      const next = new Set(enabled);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      setChosen(next);
    },
    [enabled],
  );
  const setKinds = useCallback(
    (kinds: readonly string[], on: boolean) => {
      const next = new Set(enabled);
      for (const kind of kinds) {
        if (on) next.add(kind);
        else next.delete(kind);
      }
      setChosen(next);
    },
    [enabled],
  );
  const clear = useCallback(() => setChosen(new Set()), []);

  const [hiddenSources, setHiddenSources] = useState<ReadonlySet<string>>(() => new Set());
  const toggleSource = useCallback((source: string) => {
    setHiddenSources((current) => {
      const next = new Set(current);
      if (!next.delete(source)) next.add(source);
      return next;
    });
  }, []);
  const showAllSources = useCallback(() => setHiddenSources(new Set()), []);

  const onLayerStatus = useCallback((id: string, status: RecordLayerStatus) => {
    setStatuses((current) => ({ ...current, [id]: status }));
  }, []);

  const recordLayers = useMemo(
    () => (catalog ? drawnLayers(catalog, enabled) : []),
    [catalog, enabled],
  );
  const legendScope = useMemo(
    () => (catalog ? enabledKinds(catalog, enabled, hiddenSources) : undefined),
    [catalog, enabled, hiddenSources],
  );
  const value = useMemo<RecordLayersValue>(
    () => ({
      catalog: catalogState,
      enabled,
      toggle,
      setKinds,
      clear,
      hiddenSources,
      toggleSource,
      showAllSources,
      statuses,
      sprite: overlay?.sprite,
      api,
    }),
    [
      catalogState,
      enabled,
      toggle,
      setKinds,
      clear,
      hiddenSources,
      toggleSource,
      showAllSources,
      statuses,
      overlay,
      api,
    ],
  );

  return (
    <RecordLayersContext.Provider value={value}>
      <DashboardLayout
        map={
          <MapViewer
            api={api}
            overlayStyle={overlayStyle}
            recordLayers={recordLayers}
            hiddenSources={hiddenSources}
            legendScope={legendScope}
            legendEmptyNote={
              enabled.size > 0 ? 'The layers that are on have no records right now.' : undefined
            }
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
