import { useEffect, useState } from 'react';
import { unwrap, type ForesignalClient } from '../../api/client';
import { attributionHref, requiredAttributions, type Attribution } from './attributionModel';
import styles from './attribution.module.css';

/** Props for {@link MapAttribution}. */
export interface MapAttributionProps {
  api?: ForesignalClient;
  /**
   * Source layer ids on the map. Omitted, the attributions cover every source the caller may
   * read; empty, there is nothing to attribute.
   */
  sources?: readonly string[];
  /**
   * Attributions of what else is on the map, already structured (a product's own `attribution`,
   * 009); shown after the backend's, when their license requires display.
   */
  extra?: readonly Attribution[];
  /**
   * The credit of the basemap drawn now (038): shown first, whatever its license asks, since it
   * names what the map itself is.
   */
  basemap?: Attribution;
}

/**
 * The map's required attribution line, from the backend's structured attributions
 * (`getAttributions`, never hard-coded). Shows only entries whose license requires display, each
 * linked to its terms when it has a link, then those of the products on the map, after the
 * basemap's credit when there is one; renders nothing when there is nothing to credit.
 */
export function MapAttribution({ api, sources, extra, basemap }: MapAttributionProps) {
  const [loaded, setLoaded] = useState<{ key: string; items: Attribution[] }>();
  const sourceKey = sources?.join(',');
  const key = sourceKey ?? '*';
  useEffect(() => {
    if (!api || sourceKey === '') return;
    let active = true;
    const query = sourceKey === undefined ? {} : { source: [sourceKey] };
    unwrap(api.GET('/v1/attributions', { params: { query } })).then(
      (summary) => {
        if (active) setLoaded({ key, items: requiredAttributions(summary.attributions) });
      },
      (error: unknown) => {
        console.warn('ForeSignal: map attributions did not load.', error);
      },
    );
    return () => {
      active = false;
    };
  }, [api, sourceKey, key]);

  const fromApi = api && sourceKey !== '' && loaded?.key === key ? loaded.items : [];
  const required = extra?.length ? requiredAttributions([...fromApi, ...extra]) : fromApi;
  const items = basemap
    ? [basemap, ...required.filter((item) => item.text !== basemap.text)]
    : required;
  if (items.length === 0) return null;
  return (
    <div className={styles.attribution} data-testid="map-attribution">
      {items.map((item, i) => {
        const href = attributionHref(item);
        return (
          <span key={item.text}>
            {i > 0 && ' · '}
            {href ? (
              <a href={href} target="_blank" rel="noreferrer">
                {item.text}
              </a>
            ) : (
              item.text
            )}
          </span>
        );
      })}
    </div>
  );
}
