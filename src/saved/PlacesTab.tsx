import { useState } from 'react';
import type { ForesignalClient } from '../api/client';
import { useTheme } from '../app/theme';
import { utcText } from '../intel/analysisView';
import { useRead } from '../intel/useHypotheses';
import type { Part } from '../intel/useEvidence';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EChart } from '../ui/charts/EChart';
import { timeSeriesOption } from '../ui/charts/chartOptions';
import analysis from '../views/analysis/Analysis.module.css';
import { createPlace, getPlaceWeather, type Place } from './savedApi';
import { pointPlace, temperatureSeries, weatherRows } from './savedView';
import styles from './Saved.module.css';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A place's weather (`getPlaceWeather`): each section's status and value, and the forecast. */
function PlaceWeatherPanel({ api, place }: { api: ForesignalClient | undefined; place: Place }) {
  const theme = useTheme();
  const weather = useRead(api, place.id, (client, id, signal) =>
    getPlaceWeather(client, id, signal),
  );
  if (weather.status === 'loading') return <p className={analysis.muted}>Loading weather…</p>;
  if (weather.status === 'error')
    return <p className={analysis.muted}>The weather did not load: {weather.message}</p>;
  const rows = weatherRows(weather.value.weather);
  const series = temperatureSeries(weather.value);
  return (
    <section aria-label={`Weather at ${place.name}`}>
      {rows.length ? (
        <div className={analysis.tableWrap}>
          <table className={analysis.table}>
            <thead>
              <tr>
                <th scope="col">Section</th>
                <th scope="col">Status</th>
                <th scope="col">Now</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.section}>
                  <td>{row.section}</td>
                  <td>{row.status}</td>
                  <td>{row.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={analysis.muted}>No weather record for this place yet.</p>
      )}
      {series.length > 0 && (
        <EChart
          option={timeSeriesOption(theme.tokens, series)}
          height={160}
          label={`Forecast temperature at ${place.name}, °C`}
          testId="place-forecast"
        />
      )}
      <p className={analysis.muted}>As of {utcText(weather.value.serverTime)}.</p>
    </section>
  );
}

/** Props for {@link PlacesTab}. */
export interface PlacesTabProps {
  api: ForesignalClient | undefined;
  places: Part<Place[]>;
  /** The map's center, offered for a new place. */
  center?: [number, number];
  /** Moves the map to a place. */
  onFly: (place: Place) => void;
  /** Called after a place is created, to read the places again. */
  onChanged: () => void;
}

/**
 * The places (031): areas of interest with their shape, radius and kind; **Fly to** recenters the
 * map on one, **Weather** shows its place weather. A new point place takes a name, a position (the
 * map's center by default) and a radius (`createPlace`).
 */
export function PlacesTab({ api, places, center, onFly, onChanged }: PlacesTabProps) {
  const [shown, setShown] = useState<string>();
  const [name, setName] = useState('');
  const [longitude, setLongitude] = useState(center ? center[0].toFixed(4) : '');
  const [latitude, setLatitude] = useState(center ? center[1].toFixed(4) : '');
  const [radius, setRadius] = useState('20');
  const [note, setNote] = useState<string>();
  const list = places.status === 'ready' ? places.value : [];
  const lon = Number(longitude);
  const lat = Number(latitude);
  const km = Number(radius);
  const valid =
    name.trim() !== '' &&
    longitude.trim() !== '' &&
    latitude.trim() !== '' &&
    Math.abs(lon) <= 180 &&
    Math.abs(lat) <= 90 &&
    km >= 0.1 &&
    km <= 500;
  const create = async () => {
    if (!api || !valid) return;
    try {
      const place = await createPlace(
        api,
        pointPlace(name, lon, lat, km, new Set(list.map((existing) => existing.id))),
      );
      setNote(`Created “${place.name}”.`);
      setName('');
      onChanged();
    } catch (error) {
      setNote(`Not created: ${messageOf(error)}`);
    }
  };
  return (
    <div className={styles.dialog}>
      {places.status === 'loading' && <p className={analysis.muted}>Loading places…</p>}
      {places.status === 'error' && (
        <p className={analysis.muted}>The places did not load: {places.message}</p>
      )}
      {places.status === 'ready' && !list.length && (
        <p className={analysis.muted}>No places yet.</p>
      )}
      <ul className={styles.list} aria-label="Places">
        {list.map((place) => (
          <li key={place.id} className={styles.row} aria-label={place.name}>
            <div className={styles.rowHead}>
              <span className={styles.rowName}>{place.name}</span>
              <Badge tone="info">{place.shape}</Badge>
              <Badge>{place.kind ?? 'user'}</Badge>
              {place.shape === 'point' && (
                <span className={styles.muted}>{place.radiusKm ?? 20} km</span>
              )}
              <Button type="button" onClick={() => onFly(place)}>
                Fly to
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-expanded={shown === place.id}
                onClick={() => setShown(shown === place.id ? undefined : place.id)}
              >
                Weather
              </Button>
            </div>
            {shown === place.id && <PlaceWeatherPanel api={api} place={place} />}
          </li>
        ))}
      </ul>
      <form
        className={styles.form}
        aria-label="New place"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <label className={styles.field}>
          Name
          <input
            className={styles.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          Longitude
          <input
            className={styles.input}
            inputMode="decimal"
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          Latitude
          <input
            className={styles.input}
            inputMode="decimal"
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          Radius (km)
          <input
            className={styles.input}
            inputMode="decimal"
            value={radius}
            onChange={(event) => setRadius(event.target.value)}
          />
        </label>
        <Button type="submit" variant="primary" disabled={!valid}>
          Add place
        </Button>
      </form>
      {note && <p className={analysis.muted}>{note}</p>}
    </div>
  );
}
