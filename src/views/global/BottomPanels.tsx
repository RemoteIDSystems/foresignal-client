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
import { useRecordLayers } from './recordLayersContext';
import { ImageryViewer } from '../../imagery/ImageryViewer';
import {
  imageryForTab,
  NO_VIDEO,
  type GlobalImageryTab,
  type ImageryItem,
} from '../../imagery/imageryView';
import { Picture } from '../../imagery/Picture';
import { ImageryTile } from '../../imagery/RecentImagery';
import { useRecentImagery } from '../../imagery/useRecentImagery';
import { utcText } from '../../intel/analysisView';
import styles from './GlobalDashboard.module.css';

/** How many thumbnails the strip shows. */
const STRIP_SIZE = 6;

/**
 * Recent imagery panel (028): the newest picture over the view large, with its time and source,
 * and a strip of the next ones; selecting one shows it, and the large one opens the full-frame
 * viewer. The tabs narrow it to satellite products, or to the scenes acquired over the view in
 * the last week (Area Search); the backend stores no video.
 */
export function RecentImageryPanel({ onClose }: { onClose: () => void }) {
  const { api, store, selectRef } = useRecordLayers() ?? {};
  const [tab, setTab] = useState<GlobalImageryTab>('recent');
  const [chosen, setChosen] = useState<string>();
  const [open, setOpen] = useState<ImageryItem>();
  const { imagery } = useRecentImagery(api, store);
  const items = imagery.status === 'ready' ? imageryForTab(imagery.value.items, tab) : [];
  const main = items.find((item) => item.key === chosen) ?? items[0];
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
      <div className={styles.imageryBody} data-testid="global-imagery" data-count={items.length}>
        {main ? (
          <>
            <button
              type="button"
              className={styles.imageryMain}
              aria-label={`Open ${main.title} full frame`}
              onClick={() => setOpen(main)}
            >
              <Picture api={api} spec={main.thumb} size="thumb" alt={main.title} />
              <span className={styles.imageryChip}>
                <Clock size={12} aria-hidden="true" /> {utcText(main.time)}
              </span>
              <span className={styles.imageryChipRight}>
                {main.title} <ChevronDown size={12} aria-hidden="true" />
              </span>
            </button>
            <ul className={styles.thumbs} aria-label="Imagery">
              {items.slice(0, STRIP_SIZE).map((item) => (
                <li key={item.key}>
                  <ImageryTile
                    api={api}
                    item={item}
                    pressed={item.key === main.key}
                    onOpen={(picked) => setChosen(picked.key)}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className={styles.muted}>
            {tab === 'video'
              ? NO_VIDEO
              : imagery.status === 'loading'
                ? 'Loading imagery…'
                : imagery.status === 'error'
                  ? imagery.message
                  : tab === 'area'
                    ? 'No scene was acquired over the view in the last week.'
                    : 'No imagery over the view: no enabled imagery product has a frame.'}
          </p>
        )}
      </div>
      <ImageryViewer
        api={api}
        item={open}
        onClose={() => setOpen(undefined)}
        {...(selectRef && { onOpenObject: (ref: string) => void selectRef(ref).catch(() => {}) })}
      />
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
