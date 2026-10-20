import { useState } from 'react';
import { ChevronDown, Clock } from 'lucide-react';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { List } from '../../ui/List';
import { Panel } from '../../ui/Panel';
import { Tabs } from '../../ui/Tabs';
import { formatPanelTime } from '../../objects/dossierView';
import type { ViewSummaryState } from '../../state/contextSummary';
import {
  ALL_SOURCES,
  activityLook,
  activityTime,
  familiesOf,
  familyLabel,
  filterActivity,
  insightBasis,
  insightsFor,
  percent,
  termTag,
  type InsightTab,
} from './insightsView';
import { PLACEHOLDER_IMAGERY } from './placeholderData';
import { useRecordLayers } from './recordLayersContext';
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

/** Activity timeline panel: the view's merged activity feed (015), newest first, by family. */
export function ActivityTimelinePanel() {
  const { summary, selectRef } = useRecordLayers() ?? {};
  const [family, setFamily] = useState(ALL_SOURCES);
  const activity = summary?.summary?.activity ?? [];
  const families = familiesOf(activity);
  const shown = filterActivity(activity, families.includes(family) ? family : ALL_SOURCES);
  return (
    <Panel
      title="Activity Timeline"
      actions={
        <label className={styles.select}>
          <span className={styles.visuallyHidden}>Filter activity by source</span>
          <select
            value={families.includes(family) ? family : ALL_SOURCES}
            onChange={(event) => setFamily(event.target.value)}
            data-testid="activity-filter"
          >
            <option>{ALL_SOURCES}</option>
            {families.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <ChevronDown size={13} aria-hidden="true" />
        </label>
      }
    >
      <div data-testid="activity-timeline" data-count={shown.length}>
        <SummaryNote state={summary} empty={shown.length === 0} what="activity" />
        <List
          dense
          label="Recent activity"
          items={shown}
          getKey={(item) => `${item.at}|${item.ref}`}
          renderItem={(item) => {
            const look = activityLook(item);
            const Icon = look.icon;
            return (
              <button
                type="button"
                className={styles.rowButton}
                onClick={() => void selectRef?.(item.ref)}
                title={item.title}
              >
                <span className={styles.time}>{activityTime(item.at)}</span>
                <Icon size={15} color={look.color} aria-hidden="true" />
                <span className={styles.rowText}>{item.title}</span>
                <Badge tone={look.tone}>{familyLabel(item)}</Badge>
              </button>
            );
          }}
        />
      </div>
    </Panel>
  );
}

/**
 * The line a summary panel shows above its rows: loading, the failed read (the last rows stay),
 * or that the view has nothing.
 */
function SummaryNote({
  state,
  empty,
  what,
}: {
  state: ViewSummaryState | undefined;
  empty: boolean;
  what: string;
}) {
  if (state?.error) {
    return (
      <p className={styles.summaryNote} role="alert">
        The view summary did not load: {state.error}
      </p>
    );
  }
  if (!state?.summary) return <p className={styles.summaryNote}>Summarizing this view…</p>;
  if (empty) return <p className={styles.summaryNote}>No {what} in this view.</p>;
  return null;
}

/** Analytics & insights panel: the view's findings, band changes, forecasts and situations (015). */
export function InsightsPanel({ onClose }: { onClose: () => void }) {
  const { summary, selectRef } = useRecordLayers() ?? {};
  const [tab, setTab] = useState<InsightTab>('forecasts');
  const view = summary?.summary;
  const insights = tab === 'related' ? [] : insightsFor(view?.insights ?? [], tab);
  const related = view?.related ?? [];
  const empty = tab === 'related' ? related.length === 0 : insights.length === 0;
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
      <div data-testid="insights" data-tab={tab}>
        <SummaryNote
          state={summary}
          empty={empty}
          what={tab === 'related' ? 'related events' : `${tab}`}
        />
        <ol className={styles.insights}>
          {tab === 'related'
            ? related.map((object, i) => (
                <li key={object.ref}>
                  <button
                    type="button"
                    className={styles.rowButton}
                    onClick={() => void selectRef?.(object.ref)}
                  >
                    <span className={styles.rank}>{i + 1}</span>
                    <span className={styles.insightText}>
                      <span className={styles.insightTitle}>{object.title}</span>
                      <span className={styles.insightDetail}>
                        {[object.type, object.status].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            : insights.map((insight, i) => {
                const term = termTag(insight.estimativeTerm);
                const basis = insightBasis(insight);
                return (
                  <li key={insight.ref}>
                    <button
                      type="button"
                      className={styles.rowButton}
                      onClick={() => void selectRef?.(insight.ref)}
                    >
                      <span className={styles.rank}>{i + 1}</span>
                      <span className={styles.insightText}>
                        <span className={styles.insightTitle}>{insight.title}</span>
                        {basis && <span className={styles.insightDetail}>{basis}</span>}
                      </span>
                      {typeof insight.probability === 'number' && (
                        <Badge tone="neutral" uppercase={false}>
                          {percent(insight.probability)}
                        </Badge>
                      )}
                      <span className={styles.level}>
                        {term && (
                          <Badge tone={term.tone} uppercase={false}>
                            {term.label}
                          </Badge>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
        </ol>
      </div>
      <div className={styles.insightsFooter}>
        <Button
          variant="primary"
          disabled
          title="The full analysis view comes with a later prompt."
        >
          View Full Analysis
        </Button>
        <span className={styles.muted} data-testid="insights-updated">
          Last Updated: {view ? formatPanelTime(view.generatedAt) : '—'}
        </span>
      </div>
    </Panel>
  );
}
