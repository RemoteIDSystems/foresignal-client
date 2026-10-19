import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock,
  Diamond,
  Flame,
  Orbit,
  Plane,
  Radio,
  Shield,
  Ship,
  TriangleAlert,
  Zap,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { Badge, type BadgeTone } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { List } from '../../ui/List';
import { Panel } from '../../ui/Panel';
import { Tabs } from '../../ui/Tabs';
import {
  PLACEHOLDER_ACTIVITY,
  PLACEHOLDER_IMAGERY,
  PLACEHOLDER_INSIGHTS,
  PLACEHOLDER_RELATED,
  type PlaceholderInsight,
} from './placeholderData';
import styles from './GlobalDashboard.module.css';

/** Placeholder thumbnail fills, one per imagery kind. */
const THUMB_FILLS = [
  'linear-gradient(135deg,#2f5a4a,#1a3040 60%,#3a6a7a)',
  'linear-gradient(135deg,#8a8f94,#5d6366 50%,#b8bcc0)',
  'linear-gradient(135deg,#6e7276,#3c4044 50%,#9a9ea2)',
  'linear-gradient(135deg,#a4a8ac,#6c7074 50%,#d0d4d8)',
  'radial-gradient(circle at 60% 40%,#d8b060 0 4%,#0a0e14 30%)',
  'linear-gradient(135deg,#3a5468,#1c2c38 60%,#c0c8ce)',
];

/** Recent imagery panel. Skeleton; prompt 028 fills it from media and product imagery. */
export function RecentImageryPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'recent' | 'video' | 'satellite' | 'area'>('recent');
  const [thumb, setThumb] = useState(0);
  return (
    <Panel
      title="Recent Imagery"
      titleStyle="plain"
      header={
        <Tabs
          label="Imagery sources"
          value={tab}
          onChange={setTab}
          items={[
            { key: 'recent', label: 'Recent Imagery' },
            { key: 'video', label: 'Video' },
            { key: 'satellite', label: 'Satellite' },
            { key: 'area', label: 'Area Search' },
          ]}
          className={styles.headerTabs}
        />
      }
      onClose={onClose}
      className={styles.hideTitle}
    >
      <div className={styles.imageryBody}>
        <div className={styles.imageryMain}>
          <span className={styles.imageryChip}>
            <Clock size={12} aria-hidden="true" /> {PLACEHOLDER_IMAGERY.capturedAt}
          </span>
          <span className={styles.imageryChipRight}>
            {PLACEHOLDER_IMAGERY.sensor} <ChevronDown size={12} aria-hidden="true" />
          </span>
        </div>
        <div className={styles.thumbs}>
          {PLACEHOLDER_IMAGERY.thumbnails.map((name, i) => (
            <button
              key={name}
              type="button"
              className={styles.thumb}
              aria-pressed={i === thumb}
              onClick={() => setThumb(i)}
            >
              <span style={{ background: THUMB_FILLS[i] }} />
              {name}
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/** Icon per activity category, as in the mockup's timeline. */
const CATEGORY_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  Space: { icon: Orbit, color: '#7fb2f0' },
  RF: { icon: Radio, color: '#c78bff' },
  Maritime: { icon: Ship, color: '#6fb8f0' },
  Energy: { icon: Zap, color: '#ff5a5f' },
  Cyber: { icon: Shield, color: '#ff5a5f' },
  Geologic: { icon: Activity, color: '#ff9b50' },
  Aviation: { icon: Plane, color: '#6fb8f0' },
  Hazard: { icon: Flame, color: '#ff7a3a' },
  Conflict: { icon: Diamond, color: '#ff9b50' },
};

/** Activity timeline panel. Skeleton; prompt 015 fills it from `summarizeContext` activity. */
export function ActivityTimelinePanel() {
  return (
    <Panel
      title="Activity Timeline"
      actions={
        <button type="button" className={styles.select}>
          All Sources <ChevronDown size={13} aria-hidden="true" />
        </button>
      }
    >
      <List
        dense
        label="Recent activity"
        items={PLACEHOLDER_ACTIVITY}
        getKey={(row) => `${row.time}-${row.text}`}
        renderItem={(row) => {
          const meta = CATEGORY_ICONS[row.category] ?? { icon: TriangleAlert, color: '#f0b070' };
          const Icon = row.text.startsWith('Shipping') ? TriangleAlert : meta.icon;
          return (
            <>
              <span className={styles.time}>{row.time}</span>
              <Icon
                size={15}
                color={row.text.startsWith('Shipping') ? '#f0b070' : meta.color}
                aria-hidden="true"
              />
              <span className={styles.rowText}>{row.text}</span>
              <Badge tone={row.tone}>{row.category}</Badge>
            </>
          );
        }}
      />
    </Panel>
  );
}

const LEVEL_TONE: Record<PlaceholderInsight['level'], BadgeTone> = {
  High: 'teal',
  Medium: 'warning',
  Low: 'info',
};

/** Analytics & insights panel. Skeleton; prompts 015 and 022 fill it. */
export function InsightsPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'detections' | 'hypotheses' | 'forecasts' | 'related'>(
    'forecasts',
  );
  return (
    <Panel title="Analytics & Insights" onClose={onClose}>
      <Tabs
        label="Insight types"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'detections', label: 'Detections' },
          { key: 'hypotheses', label: 'Hypotheses' },
          { key: 'forecasts', label: 'Forecasts' },
          { key: 'related', label: 'Related Events' },
        ]}
      />
      <ol className={styles.insights}>
        {PLACEHOLDER_INSIGHTS.map((insight, i) => (
          <li key={insight.title}>
            <span className={styles.rank}>{i + 1}</span>
            <span className={styles.insightText}>
              <span className={styles.insightTitle}>{insight.title}</span>
              <span className={styles.insightDetail}>{insight.detail}</span>
            </span>
            <Badge tone="neutral" uppercase={false}>
              {insight.probability}%
            </Badge>
            <span className={styles.level}>
              <Badge tone={LEVEL_TONE[insight.level]} uppercase={false}>
                {insight.level}
              </Badge>
            </span>
          </li>
        ))}
      </ol>
      <div className={styles.insightsFooter}>
        <Button variant="primary">View Full Analysis</Button>
        <span className={styles.muted}>Last Updated: 2025-09-18 14:30Z</span>
      </div>
    </Panel>
  );
}

/** Related entities panel. Skeleton; prompt 016 fills it from `listRelatedObjects`. */
export function RelatedEntitiesPanel() {
  const [tab, setTab] = useState<'nearby' | 'operational' | 'infrastructure' | 'historical'>(
    'nearby',
  );
  return (
    <Panel title="Related Entities">
      <Tabs
        label="Relation types"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'nearby', label: 'Nearby' },
          { key: 'operational', label: 'Operational' },
          { key: 'infrastructure', label: 'Infrastructure' },
          { key: 'historical', label: 'Historical' },
        ]}
      />
      <List
        label="Related entities"
        items={PLACEHOLDER_RELATED}
        getKey={(row) => row.name}
        renderItem={(row) => (
          <>
            <span className={styles.relatedThumb} />
            <span className={styles.relatedMain}>
              <span className={styles.relatedName}>{row.name}</span>
              <Badge>{row.type}</Badge>
            </span>
            <span className={styles.relatedMeta}>
              {row.distance && <span>{row.distance}</span>}
              <span className={styles[`status_${row.statusTone}`]}>
                {row.statusTone === 'ok' && <CircleCheck size={12} aria-hidden="true" />}
                {row.statusTone === 'alert' && <TriangleAlert size={12} aria-hidden="true" />}
                {row.statusTone === 'warn' && <Diamond size={12} aria-hidden="true" />} {row.status}
              </span>
            </span>
            <ChevronRight size={15} className={styles.muted} aria-hidden="true" />
          </>
        )}
      />
    </Panel>
  );
}
