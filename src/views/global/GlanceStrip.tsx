import { Activity, Bell, Trophy } from 'lucide-react';
import { seriesPoints, seriesTotal } from '../../glance/glanceApi';
import { alertsText, heatCells, leader, statusLook } from '../../glance/glanceView';
import type { GlanceState } from '../../glance/useGlance';
import { Sparkline } from '../../ui/Sparkline';
import styles from './GlobalDashboard.module.css';

/**
 * The dashboard's status strip (018), small and quiet at the foot of the map: the backend's health
 * (`getGlance`), record changes in the last 24 hours with a sparkline of them by hour
 * (`getStatsTimeseries`), the busiest source and kind (`getStatsTop`) and the alerts. Aggregates
 * only.
 */
export function GlanceStrip({ state }: { state: GlanceState }) {
  const glance = state.glance?.glance;
  const look = statusLook(glance?.status);
  const points = seriesPoints(state.series);
  const total = seriesTotal(state.series);
  const source = leader(state.topSources);
  const kind = leader(state.topKinds);
  const lastHour = glance?.activity?.versionsLastHour ?? points.at(-1)?.value;
  return (
    <div
      className={styles.glanceStrip}
      data-testid="glance-strip"
      data-status={glance?.status ?? 'loading'}
      title={state.error ? `The status did not load: ${state.error}` : undefined}
    >
      <span className={`${styles.glanceStatus} ${styles[`status_${look.tone}`]}`}>
        <span className={styles.glanceDot} aria-hidden="true" /> {look.label}
      </span>
      <span className={styles.glanceItem} data-testid="glance-activity" data-total={total}>
        <Activity size={12} aria-hidden="true" />
        {total.toLocaleString('en-US')} changes · 24 h
        <Sparkline
          values={points.map((point) => point.value)}
          label={`Record changes per hour over the last 24 hours${lastHour !== undefined ? `; ${lastHour.toLocaleString('en-US')} in the last hour` : ''}`}
        />
      </span>
      {(source ?? kind) && (
        <span className={styles.glanceItem} data-testid="glance-top">
          <Trophy size={12} aria-hidden="true" />
          {[source, kind]
            .filter((entry) => entry !== undefined)
            .map((entry) => `${entry.label} ${entry.count.toLocaleString('en-US')}`)
            .join(' · ')}
        </span>
      )}
      <span className={styles.glanceItem} data-testid="glance-alerts">
        <Bell size={12} aria-hidden="true" />
        {alertsText(glance)}
      </span>
    </div>
  );
}

/** A heat dot's radius on the inset's 360 × 180 plane: the quietest cell, and the added span. */
const HEAT_DOT_MIN = 2.5;
const HEAT_DOT_SPAN = 3.5;

/**
 * The activity heat drawn over the global-view inset (018): each H3 cell of the last 24 hours'
 * record changes (`getStatsGrid`) as a dot at its center, larger and brighter where there were
 * more.
 */
export function InsetHeat({ state }: { state: GlanceState }) {
  const cells = heatCells(state.grid);
  if (cells.length === 0) return null;
  return (
    <svg
      className={styles.insetHeat}
      viewBox="0 0 360 180"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-testid="inset-heat"
      data-cells={cells.length}
    >
      {cells.map((cell) => (
        <circle
          key={cell.id}
          cx={cell.x}
          cy={cell.y}
          r={HEAT_DOT_MIN + HEAT_DOT_SPAN * cell.weight}
          style={{ opacity: 0.45 + 0.5 * cell.weight }}
        />
      ))}
    </svg>
  );
}
