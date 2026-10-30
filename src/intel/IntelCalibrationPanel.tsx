import { useMemo } from 'react';
import type { ForesignalClient } from '../api/client';
import { useCan } from '../auth/permissions';
import { useTheme } from '../app/theme';
import { Badge } from '../ui/Badge';
import { reliabilityOption } from '../ui/charts/chartOptions';
import { EChart } from '../ui/charts/EChart';
import { calibrationCurve, reliabilityBins, scoreText } from './forecastsView';
import { getIntelCalibration, type IntelCalibration } from './intelApi';
import { utcText } from './analysisView';
import { useRead } from './useHypotheses';
import styles from '../views/analysis/Analysis.module.css';

const readCalibration = (api: ForesignalClient, _key: string, signal: AbortSignal) =>
  getIntelCalibration(api, signal);

/** One scope's reliability diagram and its Brier score and sample counts. */
function ScopeCalibration({ scope }: { scope: IntelCalibration }) {
  const theme = useTheme();
  const option = useMemo(
    () => reliabilityOption(theme.tokens, reliabilityBins(scope), calibrationCurve(scope)),
    [scope, theme.tokens],
  );
  const hasBins = (scope.bins ?? []).some((bin) => typeof bin.n === 'number' && bin.n > 0);
  return (
    <div>
      <p className={styles.muted}>
        <strong>{scope.scope}</strong>{' '}
        {scope.calibrated ? (
          <Badge tone="success" uppercase={false}>
            calibrated
          </Badge>
        ) : (
          <Badge tone="warning" uppercase={false}>
            warming up
          </Badge>
        )}{' '}
        · n = {scope.sampleN} / {scope.minSamples} · Brier {scoreText(scope.brier)}
        {scope.fittedAt ? ` · fitted ${utcText(scope.fittedAt)}` : ''}
      </p>
      {hasBins ? (
        <EChart
          option={option}
          height={240}
          label={`Calibration of ${scope.scope}: forecast against observed frequency`}
          testId={`intel-calibration-${scope.scope}`}
        />
      ) : (
        <p className={styles.muted}>
          Not enough resolved outcomes to draw a reliability diagram yet.
        </p>
      )}
    </div>
  );
}

/**
 * Read-only intel calibration (R2-010): the reliability of each scope's scores from
 * `getIntelCalibration`, shown in the analyst views so an analyst knows how much to trust the
 * signals. Hidden for a principal without `intel.read`.
 */
export function IntelCalibrationPanel({ api }: { api: ForesignalClient }) {
  const can = useCan();
  const calibration = useRead(can('intel.read') ? api : undefined, 'intel', readCalibration);
  if (!can('intel.read')) return null;
  return (
    <section
      className={styles.card}
      aria-labelledby="intel-calibration-title"
      data-testid="intel-calibration"
    >
      <h2 id="intel-calibration-title" className={styles.cardTitle}>
        Intel calibration
      </h2>
      {calibration.status === 'loading' && <p className={styles.muted}>Loading calibration…</p>}
      {calibration.status === 'error' && <p className={styles.error}>{calibration.message}</p>}
      {calibration.status === 'ready' &&
        (calibration.value.length === 0 ? (
          <p className={styles.muted}>No calibrated scopes yet.</p>
        ) : (
          calibration.value.map((scope) => <ScopeCalibration key={scope.scope} scope={scope} />)
        ))}
    </section>
  );
}
