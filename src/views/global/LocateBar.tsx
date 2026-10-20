import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Crosshair, Globe2, LocateFixed } from 'lucide-react';
import {
  locateRequest,
  matchCountries,
  parseCoordinates,
  referenceCountries,
  type LocateTarget,
  type ReferenceCountry,
} from '../../search/locate';
import { appStore } from '../../state/store';
import { useRecordLayers } from './recordLayersContext';
import styles from './GlobalDashboard.module.css';

/** The camera height a located country is shown from, in meters. */
export const COUNTRY_HEIGHT_M = 3_000_000;

/** The camera height located coordinates are shown from, in meters. */
export const POINT_HEIGHT_M = 250_000;

/**
 * The map's find bar (017): typed coordinates (`38.8, -122.7`, `38.8N 122.7W`) or a country by
 * name, alias or ISO code, from the backend's bundled reference table (`listReferenceCountries`,
 * open). Choosing one asks the map to move there (the store's `locate`).
 */
export function LocateBar() {
  const layers = useRecordLayers();
  const api = layers?.api;
  const store = layers?.store ?? appStore;
  const listId = useId();
  const [text, setText] = useState('');
  const [countries, setCountries] = useState<ReferenceCountry[]>();
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!api || !open || countries) return;
    let live = true;
    referenceCountries(api).then(
      (all) => live && setCountries(all),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, open, countries]);

  const point = parseCoordinates(text);
  const suggestions: LocateTarget[] = point ? [point] : matchCountries(countries ?? [], text);

  /** Moves the map to a place and closes the suggestions. */
  const go = (target: LocateTarget) => {
    store.set(
      'locate',
      locateRequest(
        target.longitude,
        target.latitude,
        target.iso2 ? COUNTRY_HEIGHT_M : POINT_HEIGHT_M,
      ),
    );
    setText(target.label);
    setOpen(false);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const target = suggestions[active] ?? suggestions[0];
    if (target) go(target);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') setOpen(false);
    if (suggestions.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + suggestions.length) % suggestions.length);
    }
  };

  const showList = open && text.trim().length >= 2;
  return (
    <form className={styles.locateBar} onSubmit={onSubmit} role="search" data-testid="locate-bar">
      <LocateFixed size={14} aria-hidden="true" />
      <input
        type="text"
        placeholder="Find a place or coordinates"
        aria-label="Find a place or coordinates"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul id={listId} role="listbox" aria-label="Places" className={styles.locateList}>
          {suggestions.map((target, index) => (
            <li
              key={`${target.label}|${target.iso2 ?? ''}`}
              role="option"
              aria-selected={index === active}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => go(target)}
            >
              {target.iso2 ? (
                <Globe2 size={13} aria-hidden="true" />
              ) : (
                <Crosshair size={13} aria-hidden="true" />
              )}
              <span>{target.label}</span>
              {target.iso2 && <span className={styles.muted}>{target.iso2}</span>}
            </li>
          ))}
          {suggestions.length === 0 && (
            <li className={styles.muted} aria-disabled="true">
              {failed
                ? 'The place list did not load; coordinates still work.'
                : countries
                  ? 'No country or coordinates match.'
                  : 'Loading places…'}
            </li>
          )}
        </ul>
      )}
    </form>
  );
}
