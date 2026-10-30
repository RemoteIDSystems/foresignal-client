import type { ForesignalClient } from '../api/client';
import { useCan } from '../auth/permissions';
import { getIntelCorroboration, type IntelCorroboration } from './intelApi';
import { useRead } from './useHypotheses';
import styles from '../views/analysis/Analysis.module.css';

const readCorroboration = (api: ForesignalClient, _key: string, signal: AbortSignal) =>
  getIntelCorroboration(api, signal);

/** A labeled value row, omitted when the value is absent. */
function row(label: string, value: number | string | boolean | null | undefined) {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'boolean' ? (value ? 'on' : 'off') : String(value);
  return (
    <>
      <dt>{label}</dt>
      <dd>{text}</dd>
    </>
  );
}

/**
 * Read-only corroboration policy (R2-010): the gates that promote evidence to a trusted signal
 * (`getIntelCorroboration`), shown where evidence is presented so an analyst can see the bar the
 * backend applied. The policy is set in `foresignal-admin` (a `system.settings` PUT), never here.
 * Hidden for a principal without `intel.read`.
 */
export function IntelCorroborationPanel({ api }: { api: ForesignalClient }) {
  const can = useCan();
  const policy = useRead(can('intel.read') ? api : undefined, 'corroboration', readCorroboration);
  if (!can('intel.read')) return null;

  const render = (value: IntelCorroboration) => {
    const event = value.eventQuality;
    const activation = value.situationActivation;
    const auto = value.autoCorroborate;
    return (
      <div className={styles.grid}>
        {event && (
          <div>
            <h3 className={styles.cardTitle}>Event quality</h3>
            <dl>
              {row('Strong: signal families', event.strongFamilies)}
              {row('Strong: evidence groups', event.strongGroups)}
              {row('Moderate: signal families', event.moderateFamilies)}
              {row('Strong: required modalities', event.requireModalities)}
            </dl>
          </div>
        )}
        {activation && (
          <div>
            <h3 className={styles.cardTitle}>Situation activation</h3>
            <dl>
              {row('Min signal families', activation.minFamilies)}
              {row('Min evidence groups', activation.minGroups)}
            </dl>
          </div>
        )}
        {auto && (
          <div>
            <h3 className={styles.cardTitle}>Auto-corroborate</h3>
            <dl>
              {row('Enabled', auto.enabled)}
              {row('Search radius (km)', auto.withinKm)}
              {row('Time window', auto.window)}
              {row('Max members attached', auto.maxMembers)}
            </dl>
          </div>
        )}
      </div>
    );
  };

  return (
    <section
      className={styles.card}
      aria-labelledby="intel-corroboration-title"
      data-testid="intel-corroboration"
    >
      <h2 id="intel-corroboration-title" className={styles.cardTitle}>
        Corroboration policy
      </h2>
      <p className={styles.muted}>The gates the backend applies to promote evidence to a signal.</p>
      {policy.status === 'loading' && <p className={styles.muted}>Loading the policy…</p>}
      {policy.status === 'error' && <p className={styles.error}>{policy.message}</p>}
      {policy.status === 'ready' && render(policy.value)}
    </section>
  );
}
