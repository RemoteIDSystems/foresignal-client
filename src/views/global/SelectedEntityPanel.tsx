import { useState } from 'react';
import { ChevronRight, Ellipsis, ExternalLink, Route, Tornado, X } from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { Button, IconButton } from '../../ui/Button';
import { Tabs } from '../../ui/Tabs';
import { PLACEHOLDER_ENTITY } from './placeholderData';
import styles from './GlobalDashboard.module.css';

type EntityTab = 'overview' | 'imagery' | 'forecast' | 'impacts' | 'related';

/** A simple forecast-track sketch: coast, cone, track and labeled points. */
function ForecastTrack() {
  const points = [
    { x: 92, y: 40 },
    { x: 182, y: 42 },
    { x: 236, y: 70 },
    { x: 300, y: 104 },
  ];
  const labels = PLACEHOLDER_ENTITY.forecastTrack;
  return (
    <svg className={styles.trackMap} viewBox="0 0 380 130" aria-hidden="true">
      <rect width="380" height="130" fill="#0e1c26" />
      <path d="M0 30 C 30 40, 40 70, 30 130 L0 130 Z" fill="#1b2b22" />
      <path d="M40 0 C 70 30, 110 34, 130 0 Z" fill="#1b2b22" />
      <path d="M70 34 Q 200 4 340 100 L 330 116 Q 200 64 80 54 Z" fill="#9fb8d0" opacity="0.14" />
      <polyline
        points={
          [...points]
            .reverse()
            .map((p) => `${p.x},${p.y}`)
            .join(' ') + ' 330,118'
        }
        fill="none"
        stroke="#e8eef5"
        strokeWidth="1.4"
        strokeDasharray="4 3"
      />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3.2" fill="#bcd2ea" />
          <rect
            x={p.x - 25}
            y={p.y - 33}
            width="50"
            height="26"
            rx="3"
            fill="#0b1520"
            stroke="#3a4a5c"
          />
          <text x={p.x} y={p.y - 22} textAnchor="middle" className={styles.trackLabel}>
            {labels[i]?.label}
          </text>
          <text x={p.x} y={p.y - 11} textAnchor="middle" className={styles.trackLabel}>
            {labels[i]?.wind}
          </text>
        </g>
      ))}
      <circle cx="330" cy="118" r="6" fill="#ff3b3b" />
    </svg>
  );
}

/**
 * The right-hand selected-entity panel (dossier). Skeleton with placeholder data; prompt 014
 * fills it from `getObjectDossier`.
 */
export function SelectedEntityPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<EntityTab>('overview');
  const entity = PLACEHOLDER_ENTITY;
  return (
    <section className={styles.entityPanel} aria-label="Selected entity">
      <header className={styles.entityHeader}>
        <ChevronRight size={14} aria-hidden="true" />
        <h2 className={styles.sectionLabel}>Selected Entity</h2>
        <span className={styles.spacer} />
        <IconButton label="Close Selected Entity" icon={<X size={15} />} onClick={onClose} />
        <IconButton label="Open in new view" icon={<ExternalLink size={14} />} />
      </header>

      <div className={styles.entityTitleRow}>
        <div className={styles.entityIcon}>
          <Tornado size={28} color="#ff3b3b" strokeWidth={2} aria-hidden="true" />
        </div>
        <div>
          <div className={styles.entityTitle}>{entity.title}</div>
          <div className={styles.entityTags}>
            {entity.tags.map((tag) => (
              <Badge key={tag.label} tone={tag.tone}>
                {tag.label}
              </Badge>
            ))}
            <span className={styles.muted}>ID: {entity.id}</span>
          </div>
        </div>
      </div>

      <Tabs
        label="Entity sections"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'overview', label: 'Overview' },
          { key: 'imagery', label: 'Imagery' },
          { key: 'forecast', label: 'Forecast' },
          { key: 'impacts', label: 'Impacts' },
          { key: 'related', label: `Related (${entity.relatedCount})` },
        ]}
      />

      {tab === 'overview' ? (
        <div className={styles.entityBody}>
          <div className={styles.overviewGrid}>
            <div>
              <div
                className={styles.stormImage}
                role="img"
                aria-label="Storm imagery placeholder"
              />
              <div className={styles.entityActions}>
                <Button icon={<Route size={14} />}>Track</Button>
                <Button>Add to Workspace</Button>
                <IconButton variant="bordered" label="More actions" icon={<Ellipsis size={15} />} />
              </div>
            </div>
            <dl className={styles.facts}>
              {entity.facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <h3 className={styles.sectionLabel}>Forecast Track</h3>
          <ForecastTrack />
          <div className={styles.legend}>
            <span>
              <i className={styles.dotCurrent} /> Current
            </span>
            <span>
              <i className={styles.dotForecast} /> Forecast
            </span>
            <span>
              <i className={styles.dotCone} /> Cone of Uncertainty
            </span>
          </div>
        </div>
      ) : (
        <p className={styles.empty}>This section fills from the dossier (prompt 014).</p>
      )}
    </section>
  );
}
