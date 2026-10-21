import { useCallback, useMemo, useState } from 'react';
import { Antenna, RadioTower, X } from 'lucide-react';
import type { ForesignalClient } from '../../api/client';
import { useTheme } from '../../app/theme';
import { utcText } from '../../intel/analysisView';
import type { Part } from '../../intel/useEvidence';
import { useRead } from '../../intel/useHypotheses';
import { useOpenObject } from '../../intel/useOpenObject';
import { parseObjectRef } from '../../lib/objectRef';
import { MapViewer } from '../../map/Viewer';
import { drawnLayers, enabledKinds } from '../../map/records/catalog';
import type { RecordHit } from '../../map/records/recordPicking';
import { useLayerCatalog } from '../../map/records/useLayerCatalog';
import { useOverlayStyle } from '../../map/style/useOverlayStyle';
import { keyFacts, sectionMessage } from '../../objects/dossierView';
import { selectionRef } from '../../objects/selectObject';
import { useDossier } from '../../objects/useDossier';
import { listSignals } from '../../rf/rfApi';
import {
  filterSensors,
  rfKinds,
  SENSOR_KINDS,
  sensorFacts,
  sensorHit,
  SIGNAL_LIMIT,
  signalHit,
  signalRef,
  stationSourceId,
  stationsOf,
  type SensorFilter,
} from '../../rf/rfView';
import { usePolarplot } from '../../rf/usePolarplot';
import { listSensors, type Sensor, type SensorDiscovery } from '../../satellites/satelliteApi';
import { areaOf, type Bbox } from '../../satellites/area';
import { locateRequest } from '../../search/locate';
import { useArrowNavigation } from '../../shortcuts/arrowNavigation';
import { appStore, useStoreKey, type AppState, type Store } from '../../state/store';
import { Badge } from '../../ui/Badge';
import { Button, IconButton } from '../../ui/Button';
import analysis from '../analysis/Analysis.module.css';
import styles from './RfSensors.module.css';

/** Props for {@link RfSensorsView}. */
export interface RfSensorsViewProps {
  api: ForesignalClient | undefined;
  /** The store the selection, viewport and map requests live in (012); the app's by default. */
  store?: Store<AppState>;
}

/** How far ahead sensors are discovered for (passes in the window). */
const WINDOW_HOURS = 6;

/**
 * The RF / Sensors workspace (032). There is no mock for it, so it is laid out in the dashboard's
 * language: a left rail of the RF / Spectrum layers and the sensor catalog (`listSensors` over the
 * map's view, filtered by kind and text), the map drawing the RF kinds' record tiles (007), a right
 * detail panel for the selected sensor or signal (`getObjectDossier`), and a bottom row of the
 * ground stations and receivers, with each SatDump station's live polar plot
 * (`getGroundStationPolarplot`), and the newest signals in the view (`listRecords`). Choosing a
 * sensor or signal sets the shared selection (014) and moves the map to it.
 */
export function RfSensorsView({ api, store = appStore }: RfSensorsViewProps) {
  const theme = useTheme();
  const overlayStyle = useOverlayStyle(api, theme.name);
  const overlay = overlayStyle.status === 'ready' ? overlayStyle.overlay : undefined;
  const catalogState = useLayerCatalog(api, overlay?.model);
  const catalog = catalogState.status === 'ready' ? catalogState.catalog : undefined;
  const kinds = rfKinds(catalog);
  // Every RF kind is on until the person turns one off.
  const [off, setOff] = useState<ReadonlySet<string>>(() => new Set());
  const enabled = useMemo(
    () => new Set(kinds.map((kind) => kind.id).filter((id) => !off.has(id))),
    [kinds, off],
  );
  const layers = useMemo(() => (catalog ? drawnLayers(catalog, enabled) : []), [catalog, enabled]);
  const legendScope = useMemo(
    () => (catalog ? enabledKinds(catalog, enabled) : undefined),
    [catalog, enabled],
  );
  const toggle = useCallback(
    (kind: string) =>
      setOff((current) => {
        const next = new Set(current);
        if (next.has(kind)) next.delete(kind);
        else next.add(kind);
        return next;
      }),
    [],
  );

  const viewport = useStoreKey('viewport', store);
  const area = areaOf(viewport?.bbox);
  // Read for the window from the hour the page opened, so a re-render does not read again.
  const [windowStart] = useState(() => {
    const start = new Date();
    start.setUTCMinutes(0, 0, 0);
    return start.toISOString();
  });
  const discovery = useRead(api, JSON.stringify({ area, windowStart }), (client, key, signal) => {
    const query = JSON.parse(key) as { area: Bbox; windowStart: string };
    const to = new Date(Date.parse(query.windowStart) + WINDOW_HOURS * 3_600_000).toISOString();
    return listSensors(client, query.area, query.windowStart, to, undefined, signal);
  });
  const sensors = useMemo(
    () => (discovery.status === 'ready' ? discovery.value.items : []),
    [discovery],
  );
  const signals = useRead(api, JSON.stringify({ layers, area }), (client, key, signal) => {
    const query = JSON.parse(key) as { layers: string[]; area: Bbox };
    return listSignals(client, query.layers, query.area, SIGNAL_LIMIT, signal);
  });

  const selection = useStoreKey('selection', store);
  const selectedRef = selectionRef(selection);
  const select = useCallback(
    (hit: RecordHit | undefined) =>
      store.batch(() => {
        store.set('selection', hit);
        if (hit && Number.isFinite(hit.longitude))
          store.set('locate', locateRequest(hit.longitude, hit.latitude));
      }),
    [store],
  );
  const onMapSelect = useCallback(
    (hit: RecordHit | undefined) => store.set('selection', hit),
    [store],
  );

  return (
    <div className={analysis.frame}>
      <nav className={analysis.rail} aria-label="RF and sensors">
        <h1 className={analysis.visuallyHidden}>RF / Sensors</h1>
        <h2 className={analysis.railHeading}>RF / Spectrum Layers</h2>
        {catalogState.status === 'loading' ? (
          <p className={analysis.muted}>Loading layers…</p>
        ) : catalogState.status === 'error' ? (
          <p className={analysis.error}>The layer catalog did not load.</p>
        ) : kinds.length === 0 ? (
          <p className={analysis.muted}>The backend lists no RF kinds.</p>
        ) : (
          <ul className={styles.list} aria-label="RF layers">
            {kinds.map((kind) => (
              <li key={kind.id}>
                <label className={styles.layer} data-layer={kind.id}>
                  <input
                    type="checkbox"
                    checked={enabled.has(kind.id)}
                    onChange={() => toggle(kind.id)}
                  />
                  <span className={styles.name}>{kind.label}</span>
                  <span className={styles.count}>{kind.count.toLocaleString('en-US')}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <SensorCatalog
          discovery={discovery}
          sensors={sensors}
          selectedRef={selectedRef}
          onSelect={(sensor) => select(sensorHit(sensor))}
        />
      </nav>
      <main className={styles.body}>
        <section
          className={styles.map}
          aria-label="RF map"
          data-testid="rf-map"
          data-layers={layers.join(',')}
        >
          <MapViewer
            api={api}
            overlayStyle={overlayStyle}
            recordLayers={layers}
            legendScope={legendScope}
            legendEmptyNote={
              kinds.length > 0 && layers.length === 0
                ? 'The RF layers that are on have no records right now.'
                : undefined
            }
            selected={selection}
            onSelect={onMapSelect}
            store={store}
          />
        </section>
        <SelectedDetail
          api={api}
          store={store}
          selectedRef={selectedRef}
          sensor={sensors.find((sensor) => sensor.ref === selectedRef)}
          onClose={() => store.set('selection', undefined)}
        />
        <div className={styles.bottomRow}>
          <section className={styles.panel} aria-label="Ground stations and receivers">
            <GroundStations
              api={api}
              discovery={discovery}
              stations={stationsOf(sensors)}
              onSelect={(sensor) => select(sensorHit(sensor))}
            />
          </section>
          <section className={styles.panel} aria-label="Signals">
            <h2 className={analysis.cardTitle}>Signals in View</h2>
            {layers.length === 0 ? (
              <p className={analysis.muted}>No RF kind with records is on.</p>
            ) : signals.status === 'loading' ? (
              <p className={analysis.muted}>Loading signals…</p>
            ) : signals.status === 'error' ? (
              <p className={analysis.error}>{signals.message}</p>
            ) : signals.value.length === 0 ? (
              <p className={analysis.muted}>No RF records in the view.</p>
            ) : (
              <div className={analysis.tableWrap}>
                <table className={analysis.table} data-testid="signal-table">
                  <thead>
                    <tr>
                      <th>Signal</th>
                      <th>Kind</th>
                      <th>Source</th>
                      <th>Observed (UTC)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signals.value.map((record) => (
                      <tr key={signalRef(record)} aria-selected={signalRef(record) === selectedRef}>
                        <td>
                          <button
                            type="button"
                            className={analysis.linkButton}
                            onClick={() => select(signalHit(record))}
                          >
                            {record.title ?? record.externalId}
                          </button>
                        </td>
                        <td>{record.kind}</td>
                        <td>{record.source}</td>
                        <td>{record.observedAt ? utcText(record.observedAt) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

/** The discovery read, as {@link useRead} hands it over. */
type Discovery = Part<SensorDiscovery>;

/** The rail's sensor catalog: a kind filter, a search, and the sensors over the view. */
function SensorCatalog({
  discovery,
  sensors,
  selectedRef,
  onSelect,
}: {
  discovery: Discovery;
  sensors: readonly Sensor[];
  selectedRef: string | undefined;
  onSelect: (sensor: Sensor) => void;
}) {
  const [filter, setFilter] = useState<SensorFilter>('all');
  const [text, setText] = useState('');
  // Up and down walk the sensor list (036).
  const onArrow = useArrowNavigation('button');
  const shown = filterSensors(sensors, filter, text);
  return (
    <>
      <h2 className={analysis.railHeading}>Sensor Catalog</h2>
      <div className={styles.filters}>
        <select
          className={analysis.select}
          aria-label="Sensor kind"
          value={filter}
          onChange={(event) => setFilter(event.target.value as SensorFilter)}
        >
          <option value="all">All kinds</option>
          {SENSOR_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
        <input
          className={analysis.input}
          type="search"
          placeholder="Filter sensors…"
          aria-label="Filter sensors"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      {discovery.status === 'loading' ? (
        <p className={analysis.muted}>Loading sensors…</p>
      ) : discovery.status === 'error' ? (
        <p className={analysis.error}>{discovery.message}</p>
      ) : shown.length === 0 ? (
        <p className={analysis.muted}>
          {sensors.length === 0 ? 'No sensors observe the view.' : 'No sensor matches.'}
        </p>
      ) : (
        <ul
          className={styles.list}
          aria-label="Sensors"
          data-testid="sensor-catalog"
          onKeyDown={onArrow}
        >
          {shown.map((sensor) => (
            <li key={sensor.ref}>
              <button
                type="button"
                className={analysis.railItem}
                aria-current={sensor.ref === selectedRef ? 'true' : undefined}
                data-sensor-kind={sensor.sensorKind}
                onClick={() => onSelect(sensor)}
              >
                {sensor.sensorKind === 'station' || sensor.sensorKind === 'receiver' ? (
                  <Antenna size={14} aria-hidden="true" />
                ) : (
                  <RadioTower size={14} aria-hidden="true" />
                )}
                <span className={styles.name}>{sensor.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {discovery.status === 'ready' && (
        <p className={styles.note}>
          {shown.length} of {sensors.length}
          {discovery.value.truncated ? ' (more over the view)' : ''}. {discovery.value.note}
        </p>
      )}
    </>
  );
}

/** The right panel: the selected sensor or signal's dossier, with a sensor's own facts. */
function SelectedDetail({
  api,
  store,
  selectedRef,
  sensor,
  onClose,
}: {
  api: ForesignalClient | undefined;
  store: Store<AppState>;
  selectedRef: string | undefined;
  sensor: Sensor | undefined;
  onClose: () => void;
}) {
  const state = useDossier(api, selectedRef, undefined, undefined);
  const open = useOpenObject(api, store);
  const [now] = useState(() => Date.now());
  if (!selectedRef) {
    return (
      <aside className={styles.side} aria-label="Selected sensor or signal">
        <h2 className={analysis.cardTitle}>Selected</h2>
        <p className={analysis.muted}>
          Choose a sensor in the catalog, a station or signal below, or a record on the map.
        </p>
      </aside>
    );
  }
  const dossier = state.status === 'ready' ? state.dossier : undefined;
  const title = dossier?.envelope.title ?? sensor?.title ?? selectedRef;
  const { key, more } = dossier ? keyFacts(dossier, undefined) : { key: [], more: [] };
  const facts = [...(sensor ? sensorFacts(sensor, now) : []), ...key, ...more];
  const overview = dossier?.sections.overview;
  const isRecord = parseObjectRef(selectedRef)?.record !== undefined;
  const plotSource = sensor && stationSourceId(sensor);
  return (
    <aside
      className={styles.side}
      aria-label="Selected sensor or signal"
      data-testid="rf-detail"
      data-ref={selectedRef}
    >
      <div className={styles.sideHead}>
        <h2 className={analysis.cardTitle}>Selected</h2>
        <IconButton label="Clear the selection" icon={<X size={14} />} onClick={onClose} />
      </div>
      <h3 className={styles.sideTitle}>{title}</h3>
      <div className={analysis.listMeta}>
        <Badge tone="info" uppercase={false}>
          {sensor?.sensorKind ?? dossier?.envelope.type ?? parseObjectRef(selectedRef)?.type}
        </Badge>
        {dossier?.envelope.status && (
          <Badge tone="neutral" uppercase={false}>
            {dossier.envelope.status}
          </Badge>
        )}
      </div>
      {(dossier?.envelope.summary ?? sensor?.summary) && (
        <p className={styles.summary}>{dossier?.envelope.summary ?? sensor?.summary}</p>
      )}
      {state.status === 'loading' && <p className={analysis.muted}>Loading the dossier…</p>}
      {state.status === 'error' && <p className={analysis.error}>{state.message}</p>}
      {overview && overview.status !== 'ok' && (
        <p className={analysis.muted}>
          {sectionMessage(overview.status as never, 'Overview', overview.message)}
        </p>
      )}
      {facts.length > 0 && (
        <dl className={analysis.facts} data-testid="rf-facts">
          {facts.map((fact) => (
            <div key={fact.label} className={styles.fact}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {plotSource && <Polarplot api={api} sourceId={plotSource} title={title} />}
      {isRecord && (
        <Button variant="primary" onClick={() => void open(selectedRef)}>
          Open on Global →
        </Button>
      )}
    </aside>
  );
}

/** The bottom row's ground stations and receivers, each SatDump station with its polar plot. */
function GroundStations({
  api,
  discovery,
  stations,
  onSelect,
}: {
  api: ForesignalClient | undefined;
  discovery: Discovery;
  stations: readonly Sensor[];
  onSelect: (sensor: Sensor) => void;
}) {
  return (
    <>
      <h2 className={analysis.cardTitle}>Ground Stations &amp; Receivers ({stations.length})</h2>
      {discovery.status === 'loading' ? (
        <p className={analysis.muted}>Loading sensors…</p>
      ) : discovery.status === 'error' ? (
        <p className={analysis.error}>{discovery.message}</p>
      ) : stations.length === 0 ? (
        <p className={analysis.muted}>No ground stations or receivers in range of the view.</p>
      ) : (
        <ul className={styles.stations} data-testid="ground-stations">
          {stations.map((station) => {
            const source = stationSourceId(station);
            return (
              <li key={station.ref} className={styles.station} aria-label={station.title}>
                <button
                  type="button"
                  className={analysis.linkButton}
                  onClick={() => onSelect(station)}
                >
                  {station.title}
                </button>
                <span className={analysis.muted}>
                  {station.sensorKind}
                  {station.rangeKm != null ? `, ${Math.round(station.rangeKm)} km` : ''}
                </span>
                {source && <Polarplot api={api} sourceId={source} title={station.title} />}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** A ground station's live polar plot, read again every few seconds. */
function Polarplot({
  api,
  sourceId,
  title,
}: {
  api: ForesignalClient | undefined;
  sourceId: string;
  title: string;
}) {
  const plot = usePolarplot(api, sourceId);
  return (
    <figure className={styles.plot} data-testid="polarplot" data-state={plot.status}>
      {plot.status === 'ready' ? (
        <img src={plot.url} alt={`Live pass polar plot from ${title}`} />
      ) : (
        <p className={analysis.muted}>
          {plot.status === 'loading'
            ? 'Loading the polar plot…'
            : plot.status === 'no-pass'
              ? 'No active pass.'
              : plot.message}
        </p>
      )}
      <figcaption className={styles.note}>
        Live pass
        {plot.status === 'ready' ? `, read ${utcText(new Date(plot.at).toISOString())}` : ''}
      </figcaption>
    </figure>
  );
}
