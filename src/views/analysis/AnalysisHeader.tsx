import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Badge } from '../../ui/Badge';
import { confidenceLook, statusTone, utcText, type ConfidenceLook } from '../../intel/analysisView';
import styles from './Analysis.module.css';

/** The information-value meter's levels, as the mock writes them. */
export type InformationLevel = 'Low' | 'Medium' | 'High';

/** Props for {@link AnalysisHeader}. */
export interface AnalysisHeaderProps {
  /** The breadcrumb's middle step: "Situations" or "Investigations". */
  section: string;
  title: string;
  status: string;
  /** The line under the title: kind, started date, duration and scope (or id and date range). */
  subline: ReactNode;
  /** Corroboration share for the confidence gauge; null or absent shows "Not assessed". */
  confidence?: number | null;
  /** The information-value level (021); absent shows "Not assessed". */
  information?: InformationLevel;
  /** When the backend last updated the object. */
  updatedAt?: string;
  /** Set while the last refresh failed: the view keeps its data and says so. */
  refreshError?: string;
  /** The header's buttons. */
  actions?: ReactNode;
}

/**
 * The full-analysis header (019), as the Conflict mock draws it: the breadcrumb, the title with its
 * status badge, the subline, a Confidence gauge, an Information Value meter, Last Updated with the
 * auto-refresh state, and the action buttons.
 */
export function AnalysisHeader({
  section,
  title,
  status,
  subline,
  confidence,
  information,
  updatedAt,
  refreshError,
  actions,
}: AnalysisHeaderProps) {
  const look = confidenceLook(confidence);
  return (
    <header className={styles.header} data-testid="analysis-header">
      <div className={styles.headline}>
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <Link to="/intelligence">Intelligence</Link> › {section} › {title}
        </nav>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          <Badge tone={statusTone(status)}>{status}</Badge>
        </div>
        <div className={styles.subline}>{subline}</div>
      </div>
      <div className={styles.metric} data-testid="analysis-confidence">
        <span className={styles.metricLabel}>Confidence</span>
        {look ? (
          <ConfidenceGauge look={look} />
        ) : (
          <span className={styles.muted}>Not assessed</span>
        )}
      </div>
      <div className={styles.metric} data-testid="analysis-information">
        <span className={styles.metricLabel}>Information Value</span>
        {information ? (
          <InformationMeter level={information} />
        ) : (
          <span className={styles.muted}>Not assessed</span>
        )}
      </div>
      <div className={styles.metric}>
        <span className={styles.metricLabel}>Last Updated</span>
        <span>{utcText(updatedAt)}</span>
        <span
          className={styles.live}
          title={refreshError ? `The last refresh failed: ${refreshError}` : undefined}
        >
          <span className={styles.liveDot} data-error={refreshError ? 'true' : 'false'} />
          {refreshError ? 'Refresh failed' : 'Auto-refresh'}
        </span>
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}

const TONE_COLORS: Readonly<Record<string, string>> = {
  danger: 'var(--fs-color-danger)',
  warning: 'var(--fs-color-warning)',
  success: 'var(--fs-color-success)',
};

/** A half-circle gauge with the percent in its middle and the word under it. */
export function ConfidenceGauge({ look }: { look: ConfidenceLook }) {
  // The arc runs from the left end (180°) to the right (0°); its length is π × r.
  const r = 26;
  const length = Math.PI * r;
  return (
    <svg
      className={styles.gauge}
      width={72}
      height={50}
      viewBox="0 0 72 50"
      role="img"
      aria-label={`Confidence ${look.percent}% ${look.label.toLowerCase()}`}
      data-percent={look.percent}
    >
      <path className={styles.gaugeTrack} d={`M 10 38 A ${r} ${r} 0 0 1 62 38`} />
      <path
        className={styles.gaugeFill}
        d={`M 10 38 A ${r} ${r} 0 0 1 62 38`}
        stroke={TONE_COLORS[look.tone] ?? 'var(--fs-color-accent)'}
        strokeDasharray={`${(length * look.percent) / 100} ${length}`}
      />
      <text className={styles.gaugeText} x={36} y={36} textAnchor="middle">
        {look.percent}%
      </text>
      <text x={36} y={48} textAnchor="middle" fontSize={8} fill="var(--fs-color-text-muted)">
        {look.label}
      </text>
    </svg>
  );
}

const LEVEL_BARS: Readonly<Record<InformationLevel, number>> = { Low: 2, Medium: 4, High: 6 };

/** The information-value word and six bars, lit to its level. */
export function InformationMeter({ level }: { level: InformationLevel }) {
  const lit = LEVEL_BARS[level];
  return (
    <span className={styles.actions} role="img" aria-label={`Information value ${level}`}>
      <span className={styles.metricValue}>{level}</span>
      <span className={styles.bars} aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className={styles.bar}
            data-on={i < lit ? 'true' : 'false'}
            style={{ height: `${6 + i * 3}px` }}
          />
        ))}
      </span>
    </span>
  );
}
