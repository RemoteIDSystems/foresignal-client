import { useState, type FormEvent } from 'react';
import { MapPin, X } from 'lucide-react';
import type { ForesignalClient } from '../api/client';
import { useCan } from '../auth/permissions';
import { useStoreKey, type AppState, type Store } from '../state/store';
import { Badge } from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';
import { areaGeometry, searchReferenceAreas, type ReferenceArea } from './referenceAreas';
import styles from './ReferenceAreaPicker.module.css';

/**
 * The reference-area picker (R2-011): search named areas (`searchReferenceAreas`) and, on
 * selection, draw the area's outline on the map (`getReferenceArea`, or a point for a place) by
 * putting it in the shared `referenceArea` store key that the map outlines through the existing
 * overlay plumbing. Gated `data.read`; renders nothing without it.
 */
export function ReferenceAreaPicker({
  api,
  store,
}: {
  api: ForesignalClient | undefined;
  store: Store<AppState>;
}) {
  const can = useCan();
  const drawn = useStoreKey('referenceArea', store);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ReferenceArea[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  if (!can('data.read') || !api) return null;

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError(false);
    try {
      setResults(await searchReferenceAreas(api, q));
    } catch {
      setError(true);
      setResults(null);
    } finally {
      setBusy(false);
    }
  };
  const select = async (area: ReferenceArea) => {
    setBusy(true);
    setError(false);
    try {
      const drawnArea = await areaGeometry(api, area);
      if (drawnArea) store.set('referenceArea', drawnArea);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.panel} aria-label="Reference areas">
      <div className={styles.head}>
        <h2 className={styles.title}>
          <MapPin size={14} aria-hidden="true" /> Reference areas
        </h2>
        {drawn && (
          <IconButton
            label="Clear the drawn area"
            icon={<X size={15} />}
            onClick={() => store.set('referenceArea', undefined)}
          />
        )}
      </div>
      {drawn && (
        <p className={styles.drawn}>
          Outlined: <strong>{drawn.label}</strong>
        </p>
      )}
      <form className={styles.form} onSubmit={search}>
        <input
          type="search"
          className={styles.input}
          placeholder="Country, region or place"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search reference areas"
        />
        <Button type="submit" variant="primary" disabled={busy || !query.trim()}>
          {busy ? '…' : 'Search'}
        </Button>
      </form>
      {error && <p className={styles.muted}>The search did not work. Try again.</p>}
      {results &&
        (results.length === 0 ? (
          <p className={styles.muted}>No areas found.</p>
        ) : (
          <ul className={styles.results} aria-label="Area results">
            {results.map((area) => (
              <li key={`${area.kind}-${area.code ?? area.placeId ?? area.name}`}>
                <button type="button" className={styles.result} onClick={() => void select(area)}>
                  <span className={styles.resultLabel}>{area.label}</span>
                  <Badge tone="neutral" uppercase={false}>
                    {area.kind}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
