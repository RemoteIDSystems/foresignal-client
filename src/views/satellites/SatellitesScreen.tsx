import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Antenna,
  CalendarClock,
  Eye,
  Globe2,
  Image,
  Layers,
  ListOrdered,
  Radar,
  Satellite as SatelliteIcon,
  X,
} from 'lucide-react';
import type { ForesignalClient } from '../../api/client';
import { useTheme } from '../../app/theme';
import { utcText } from '../../intel/analysisView';
import { useRead } from '../../intel/useHypotheses';
import { useOpenObject } from '../../intel/useOpenObject';
import { MapViewer } from '../../map';
import { ConstellationLayer } from '../../satellites/ConstellationLayer';
import {
  CONSTELLATION_SOURCES,
  searchSatellites,
  sourceColors,
  type Satellite,
} from '../../satellites/constellation';
import { nextPass } from '../../satellites/orbit';
import {
  findSatelliteRecord,
  listSensors,
  type Sensor,
  type SensorDiscovery,
} from '../../satellites/satelliteApi';
import {
  areaOf,
  centerOf,
  passRows,
  satelliteFacts,
  SCRUB_HOURS,
  SCRUB_TICKS,
  sensorOf,
  untilText,
  type Bbox,
} from '../../satellites/satelliteView';
import { useConstellation } from '../../satellites/useConstellation';
import { useStoreKey, type AppState, type Store } from '../../state/store';
import { Badge } from '../../ui/Badge';
import { Button, IconButton } from '../../ui/Button';
import { Tabs } from '../../ui/Tabs';
import analysis from '../analysis/Analysis.module.css';
import styles from './Satellites.module.css';

/** Props for {@link SatellitesScreen}. */
export interface SatellitesScreenProps {
  api: ForesignalClient | undefined;
  store: Store<AppState>;
}

type SatelliteTab = 'constellation' | 'passes' | 'stations' | 'sensors';

const TABS: readonly { key: SatelliteTab; label: string }[] = [
  { key: 'constellation', label: 'Constellation View' },
  { key: 'passes', label: 'Passes' },
  { key: 'stations', label: 'Ground Stations' },
  { key: 'sensors', label: 'Sensor Catalog' },
];

/** The sources drawn when the page opens. */
const INITIAL_SOURCES = CONSTELLATION_SOURCES.filter((source) => source.initial).map(
  (source) => source.key,
);

/** How long ahead the passes and sensors are discovered for. */
const WINDOW_HOURS = 24;

/**
 * The Satellite Operations screen (027), as the Analysis View mock lays it out: the SATELLITE
 * OPERATIONS and DATA SOURCES rail, the constellation on the globe with the time scrubber and LIVE,
 * the Selected Satellite panel, and Upcoming Passes. The satellites come from the backend's
 * CelesTrak-compatible element sets (`getCelestrakGp`) and are moved by SGP4 in the browser to the
 * Cesium clock's instant; the passes, ground stations and sensors over the view come from
 * `listSensors`. The 2D / 3D toggle is the map's own (005).
 */
export default function SatellitesScreen({ api, store }: SatellitesScreenProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<SatelliteTab>('constellation');
  const [chosen, setChosen] = useState<readonly string[]>(INITIAL_SOURCES);
  const [selected, setSelected] = useState<number>();
  const [offsetHours, setOffsetHours] = useState(0);
  const [clockAt, setClockAt] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const { satellites, sources } = useConstellation(api, chosen);
  const tokens = useTheme().tokens;
  const colors = useMemo(() => sourceColors(tokens), [tokens]);
  const viewport = useStoreKey('viewport', store);
  const area = areaOf(viewport?.bbox);
  // Read for the window from the hour the page opened, so the clock running does not read again.
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
  const sensors = discovery.status === 'ready' ? discovery.value.items : [];
  const chosenSatellite = satellites.find((satellite) => satellite.norad === selected);
  const toggleSource = useCallback(
    (key: string) =>
      setChosen((current) =>
        current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
      ),
    [],
  );
  const matches = searchSatellites(satellites, search, 8);

  return (
    <div className={analysis.frame}>
      <nav className={analysis.rail} aria-label="Satellite operations">
        <h2 className={analysis.railHeading}>Satellite Operations</h2>
        <RailButton
          icon={Globe2}
          label="Constellation View"
          current={tab === 'constellation'}
          onClick={() => setTab('constellation')}
        />
        <RailButton
          icon={Radar}
          label="Live Tracking"
          current={tab === 'constellation' && offsetHours === 0}
          onClick={() => {
            setTab('constellation');
            setOffsetHours(0);
          }}
        />
        <RailButton
          icon={Layers}
          label="Sensor Catalog"
          current={tab === 'sensors'}
          onClick={() => setTab('sensors')}
        />
        <RailButton
          icon={CalendarClock}
          label="Tasking & Events"
          disabled="Foresignal cannot task public satellites or third-party sensors."
        />
        <RailButton
          icon={Image}
          label="Imagery Analysis"
          onClick={() => void navigate('/imagery')}
        />
        <RailButton
          icon={Eye}
          label="Change Detection"
          onClick={() => void navigate('/imagery?tab=change')}
        />
        <RailButton
          icon={Antenna}
          label="Ground Stations"
          current={tab === 'stations'}
          onClick={() => setTab('stations')}
        />
        <RailButton
          icon={ListOrdered}
          label="Pass Predictions"
          current={tab === 'passes'}
          onClick={() => setTab('passes')}
        />
        <RailButton
          icon={SatelliteIcon}
          label="Acquisition Queue"
          disabled="The backend has no acquisition queue."
        />
        <h2 className={analysis.railHeading}>Data Sources</h2>
        <ul className={styles.sources} aria-label="Data sources">
          {CONSTELLATION_SOURCES.map((source) => {
            const state = sources[source.key];
            return (
              <li key={source.key}>
                <label
                  className={styles.source}
                  title={source.unavailable}
                  data-source={source.key}
                >
                  <input
                    type="checkbox"
                    checked={chosen.includes(source.key)}
                    disabled={!source.selector}
                    onChange={() => toggleSource(source.key)}
                  />
                  <span
                    className={styles.swatch}
                    style={{ background: colors[source.key] ?? 'transparent' }}
                    aria-hidden="true"
                  />
                  <span className={styles.sourceName}>{source.label}</span>
                  <span className={styles.sourceCount}>
                    {state?.status === 'ready'
                      ? state.count
                      : state?.status === 'loading'
                        ? '…'
                        : state?.status === 'error'
                          ? '!'
                          : ''}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </nav>
      <main className={styles.main}>
        <div className={styles.toolbar}>
          <h1 className={analysis.visuallyHidden}>Satellite Operations</h1>
          <Tabs items={TABS} value={tab} onChange={setTab} label="Satellite views" />
          <div className={styles.search}>
            <input
              className={analysis.input}
              type="search"
              placeholder="Find a satellite…"
              aria-label="Find a satellite"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {matches.length > 0 && (
              <ul className={styles.matches} aria-label="Matching satellites">
                {matches.map((satellite) => (
                  <li key={satellite.norad}>
                    <button
                      type="button"
                      className={analysis.linkButton}
                      onClick={() => {
                        setSelected(satellite.norad);
                        setSearch('');
                      }}
                    >
                      {satellite.name} <span className={analysis.muted}>{satellite.norad}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className={styles.body}>
          <section
            className={styles.globe}
            aria-label="Constellation"
            data-testid="constellation"
            data-satellites={satellites.length}
            data-selected-satellite={selected}
            data-clock={clockAt.toISOString()}
          >
            <MapViewer
              api={api}
              store={store}
              legendEmptyNote="Satellites are colored by data source."
              scene={
                <ConstellationLayer
                  satellites={satellites}
                  colors={colors}
                  {...(selected !== undefined && { selected })}
                  onSelect={setSelected}
                  offsetHours={offsetHours}
                  onTime={setClockAt}
                />
              }
            >
              <TimeScrubber at={clockAt} offsetHours={offsetHours} onOffset={setOffsetHours} />
            </MapViewer>
          </section>
          {chosenSatellite ? (
            <SelectedSatellite
              api={api}
              store={store}
              satellite={chosenSatellite}
              at={clockAt}
              area={area}
              sensors={sensors}
              note={discovery.status === 'ready' ? discovery.value.note : undefined}
              onClose={() => setSelected(undefined)}
            />
          ) : (
            <aside className={styles.side} aria-label="Selected satellite">
              <h2 className={analysis.cardTitle}>Selected Satellite</h2>
              <p className={analysis.muted}>
                {satellites.length === 0
                  ? constellationHint(sources)
                  : 'Select a satellite on the globe, or find one by name.'}
              </p>
            </aside>
          )}
          <section className={styles.bottom} aria-label={bottomLabel(tab)}>
            <BottomPanel
              tab={tab}
              discovery={discovery}
              sensors={sensors}
              clockAt={clockAt}
              satellites={satellites}
              onSelect={setSelected}
            />
          </section>
        </div>
      </main>
    </div>
  );
}

/** A rail entry: a tool that switches the view, or one shown disabled with why. */
function RailButton({
  icon: Icon,
  label,
  current,
  onClick,
  disabled,
}: {
  icon: typeof Globe2;
  label: string;
  current?: boolean;
  onClick?: () => void;
  disabled?: string;
}) {
  return (
    <button
      type="button"
      className={analysis.railItem}
      aria-current={current ? 'true' : undefined}
      disabled={disabled !== undefined}
      title={disabled}
      onClick={onClick}
    >
      <Icon size={15} aria-hidden="true" />
      {label}
    </button>
  );
}

/** What the globe says when no satellites are drawn. */
function constellationHint(sources: Readonly<Record<string, { status: string }>>): string {
  const states = Object.values(sources);
  if (states.length === 0) return 'Choose a data source to draw its satellites.';
  if (states.some((state) => state.status === 'loading')) return 'Loading element sets…';
  return 'The backend holds no element sets for these sources yet (its celestrak-gp source may be off).';
}

/**
 * The time scrubber, as the mock draws it: the clock's instant in UTC, LIVE, and a slider from
 * 24 hours back to 24 hours ahead. Moving it sets the Cesium clock; LIVE returns it to now.
 */
function TimeScrubber({
  at,
  offsetHours,
  onOffset,
}: {
  at: Date;
  offsetHours: number;
  onOffset: (hours: number) => void;
}) {
  const live = offsetHours === 0;
  return (
    <div className={styles.scrubber} role="group" aria-label="Time scrubber">
      <div className={styles.scrubberHead}>
        <span className={styles.clock} data-testid="satellite-clock">
          {at.toISOString().slice(0, 19).replace('T', ' ')}Z
        </span>
        <button
          type="button"
          className={live ? styles.liveOn : styles.liveOff}
          aria-pressed={live}
          onClick={() => onOffset(0)}
        >
          ● LIVE
        </button>
      </div>
      <input
        type="range"
        min={-SCRUB_HOURS}
        max={SCRUB_HOURS}
        step={1}
        value={offsetHours}
        aria-label="Hours from now"
        aria-valuetext={offsetHours === 0 ? 'now' : `${offsetHours > 0 ? '+' : ''}${offsetHours} h`}
        onChange={(event) => onOffset(Number(event.target.value))}
      />
      <div className={styles.ticks} aria-hidden="true">
        {SCRUB_TICKS.map((tick) => (
          <span key={tick.label}>{tick.label}</span>
        ))}
      </div>
    </div>
  );
}

/** The Selected Satellite panel: the mock's facts, the next pass over the view, and its sensors. */
function SelectedSatellite({
  api,
  store,
  satellite,
  at,
  area,
  sensors,
  note,
  onClose,
}: {
  api: ForesignalClient | undefined;
  store: Store<AppState>;
  satellite: Satellite;
  at: Date;
  area: Bbox;
  sensors: readonly Sensor[];
  note: string | undefined;
  onClose: () => void;
}) {
  const open = useOpenObject(api, store);
  const record = useRead(
    api,
    JSON.stringify([satellite.objectId, satellite.norad]),
    (client, key, signal) => {
      const [objectId, norad] = JSON.parse(key) as [string, number];
      return findSatelliteRecord(client, objectId, norad, signal);
    },
  );
  const found = record.status === 'ready' ? record.value : undefined;
  const sensor = sensorOf(satellite, sensors);
  const facts = satelliteFacts(satellite, at, found, sensor);
  // Worked out again only when the hour or the satellite changes, not every second.
  const hour = Math.floor(at.getTime() / 3_600_000);
  const center = centerOf(area);
  const pass = useMemo(
    () => nextPass(satellite.satrec, center, new Date(hour * 3_600_000), 24),
    // The center is a pair of numbers; its parts are the dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [satellite, hour, center.longitude, center.latitude],
  );
  const source = CONSTELLATION_SOURCES.find((entry) => entry.key === satellite.source);
  return (
    <aside className={styles.side} aria-label="Selected satellite">
      <div className={styles.sideHead}>
        <h2 className={analysis.cardTitle}>Selected Satellite</h2>
        <IconButton label="Clear the selection" icon={<X size={14} />} onClick={onClose} />
      </div>
      <h3 className={styles.sideTitle}>{satellite.name}</h3>
      <div className={analysis.listMeta}>
        {source && (
          <Badge tone="info" uppercase={false}>
            {source.label}
          </Badge>
        )}
        {sensor?.capabilities?.sensorTypes?.[0] && (
          <Badge tone="success" uppercase={false}>
            {sensor.capabilities.sensorTypes[0]}
          </Badge>
        )}
      </div>
      <dl className={analysis.facts} data-testid="satellite-facts">
        {facts.map((fact) => (
          <div key={fact.label} className={styles.fact}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
        <div className={styles.fact}>
          <dt>Next Pass</dt>
          <dd data-testid="next-pass">
            {pass
              ? `${utcText(pass.aos.toISOString())}, max ${Math.round(pass.maxElevationDeg)}° (${untilText(at, pass.aos)})`
              : 'None in 24 h over the view'}
          </dd>
        </div>
      </dl>
      <Button
        variant="primary"
        disabled={!found}
        title={found ? undefined : 'The backend holds no record for this satellite.'}
        onClick={() =>
          found && void open(`record:${found.source}/${encodeURIComponent(found.externalId)}`)
        }
      >
        View Details →
      </Button>
      <h2 className={analysis.cardTitle}>Sensors</h2>
      {sensor?.capabilities?.sensorTypes?.length ? (
        <ul className={styles.sensorList} data-testid="satellite-sensors">
          {sensor.capabilities.sensorTypes.map((type) => (
            <li key={type}>
              <span>{type}</span>
              <span className={analysis.muted}>
                {sensor.capabilities?.resolutionM != null
                  ? `${sensor.capabilities.resolutionM} m`
                  : '—'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={analysis.muted}>No sensor capabilities listed for this satellite.</p>
      )}
      {note && <p className={analysis.muted}>{note}</p>}
    </aside>
  );
}

/** The bottom panel's accessible name for a tab. */
function bottomLabel(tab: SatelliteTab): string {
  return tab === 'stations'
    ? 'Ground stations'
    : tab === 'sensors'
      ? 'Sensor catalog'
      : 'Upcoming passes';
}

/**
 * The bottom panel: Upcoming Passes (next 24 h) for the constellation and passes tabs, else the
 * ground stations and receivers, or every sensor, over the view (`listSensors`).
 */
function BottomPanel({
  tab,
  discovery,
  sensors,
  clockAt,
  satellites,
  onSelect,
}: {
  tab: SatelliteTab;
  discovery:
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; value: SensorDiscovery };
  sensors: readonly Sensor[];
  clockAt: Date;
  satellites: readonly Satellite[];
  onSelect: (norad: number) => void;
}) {
  if (discovery.status === 'loading') return <p className={analysis.muted}>Loading sensors…</p>;
  if (discovery.status === 'error') return <p className={analysis.muted}>{discovery.message}</p>;
  if (tab === 'stations' || tab === 'sensors') {
    const shown =
      tab === 'stations'
        ? sensors.filter(
            (sensor) => sensor.sensorKind === 'station' || sensor.sensorKind === 'receiver',
          )
        : sensors;
    return (
      <>
        <h2 className={analysis.cardTitle}>
          {tab === 'stations' ? 'Ground Stations' : 'Sensor Catalog'} ({shown.length})
        </h2>
        {shown.length === 0 ? (
          <p className={analysis.muted}>
            {tab === 'stations'
              ? 'No ground stations or receivers in range of the view.'
              : 'No sensors observe the view.'}
          </p>
        ) : (
          <div className={analysis.tableWrap}>
            <table className={analysis.table} data-testid="sensor-table">
              <thead>
                <tr>
                  <th>Sensor</th>
                  <th>Kind</th>
                  <th>Families</th>
                  <th>Range</th>
                  <th>Detection</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((sensor) => (
                  <tr key={sensor.ref}>
                    <td>{sensor.title}</td>
                    <td>{sensor.sensorKind}</td>
                    <td>{sensor.families?.join(', ') || '—'}</td>
                    <td>{sensor.rangeKm != null ? `${Math.round(sensor.rangeKm)} km` : '—'}</td>
                    <td>{sensor.pDetect != null ? `${Math.round(sensor.pDetect * 100)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }
  const rows = passRows(sensors, clockAt);
  const drawn = new Set(satellites.map((satellite) => satellite.norad));
  return (
    <>
      <h2 className={analysis.cardTitle}>Upcoming Passes (Next 24h)</h2>
      {rows.length === 0 ? (
        <p className={analysis.muted}>No satellite passes predicted over the view.</p>
      ) : (
        <div className={analysis.tableWrap}>
          <table className={analysis.table} data-testid="pass-table">
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>Satellite</th>
                <th>Type</th>
                <th>Max El.</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>{utcText(row.aos)}</td>
                  <td>
                    {row.norad !== undefined && drawn.has(row.norad) ? (
                      <button
                        type="button"
                        className={analysis.linkButton}
                        onClick={() => onSelect(row.norad!)}
                      >
                        {row.satellite}
                      </button>
                    ) : (
                      row.satellite
                    )}
                  </td>
                  <td>{row.types}</td>
                  <td>{Math.round(row.maxElevationDeg)}°</td>
                  <td>{row.minutes} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
