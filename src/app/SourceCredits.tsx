import { useEffect, useState } from 'react';
import { unwrap, type ForesignalClient } from '../api/client';
import { attributionHref, creditList, type Attribution } from '../map/style/attributionModel';
import styles from './SourceCredits.module.css';

/** Where loading the credits stands. */
type CreditsState =
  { status: 'loading' } | { status: 'ready'; items: Attribution[] } | { status: 'error' };

/**
 * Every data source the backend attributes (`getAttributions`), for the About page: each distinct
 * attribution line with its license, linked to its terms when it has a link. The map shows only
 * those whose license requires display; this lists them all, so no source goes uncredited.
 */
export function SourceCredits({ api }: { api?: ForesignalClient }) {
  const [state, setState] = useState<CreditsState>({ status: 'loading' });
  useEffect(() => {
    if (!api) return;
    let active = true;
    unwrap(api.GET('/v1/attributions')).then(
      (summary) => {
        if (active) setState({ status: 'ready', items: creditList(summary.attributions) });
      },
      (error: unknown) => {
        console.warn('ForeSignal: data source credits did not load.', error);
        if (active) setState({ status: 'error' });
      },
    );
    return () => {
      active = false;
    };
  }, [api]);

  if (!api) return <p>Data source credits need a backend connection.</p>;
  if (state.status === 'loading') return <p>Loading the data source credits…</p>;
  if (state.status === 'error') return <p role="alert">The data source credits did not load.</p>;
  return (
    <>
      <p data-testid="source-credits-count">
        {state.items.length} attributions from the backend, for every source it reads.
      </p>
      <table data-testid="source-credits">
        <thead>
          <tr>
            <th>Source</th>
            <th>License</th>
          </tr>
        </thead>
        <tbody>
          {state.items.map((item) => {
            const href = attributionHref(item);
            return (
              <tr key={`${item.text}\u0000${item.licence}`}>
                <td>
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer">
                      {item.text}
                    </a>
                  ) : (
                    item.text
                  )}
                </td>
                <td className={styles.license}>{item.licence}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
