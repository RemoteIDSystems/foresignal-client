import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight, Ellipsis, ExternalLink, X } from 'lucide-react';
import type { ForesignalClient } from '../../api/client';
import { AnnotationsPanel } from '../../annotations/AnnotationsPanel';
import { prettifyId } from '../../lib/labels';
import { parseObjectRef } from '../../lib/objectRef';
import { KindSwatch } from '../../map/style/legend';
import type { RecordHit } from '../../map/records/recordPicking';
import {
  actionLabel,
  formatPanelTime,
  keyFacts,
  relatedCount,
  sectionMessage,
  SHOWN_ACTIONS,
  statusTone,
} from '../../objects/dossierView';
import type { Dossier, ObjectAction, ObjectEnvelope, SectionStatus } from '../../objects/objectApi';
import { analysisPath } from '../../intel/analysisView';
import { OPEN_INVESTIGATION_ACTION, openInvestigation } from '../../intel/openInvestigation';
import { isStormLike } from '../../objects/threeD';
import { loadTrack } from '../../time/timeApi';
import { TRAIL_WINDOW_MS, trailOf, type Trail } from '../../time/trail';
import { Badge } from '../../ui/Badge';
import { Button, IconButton } from '../../ui/Button';
import { Tabs } from '../../ui/Tabs';
import { useToast } from '../../ui/toast-context';
import { useWorkspaceSync } from '../../workspace/workspaceSyncContext';
import { workbenchPath } from '../workbench/workbench';
import { useRecordLayers } from './recordLayersContext';
import { useSelectedDossier } from './useSelectedDossier';
import styles from './GlobalDashboard.module.css';

type EntityTab = 'overview' | 'imagery' | 'forecast' | 'impacts' | 'related' | 'notes';

/** The envelope action that adds an object to a workspace (the OpenAPI's example id). */
const ADD_TO_WORKSPACE_ACTION = 'add-to-workspace';

/**
 * Actions this client carries out itself, by action id: opening an investigation from the object
 * (019), which then opens its workspace, and adding the object to the open workspace's selected
 * refs (025; with none open, the Workspaces dialog opens). The rest are shown, from the envelope,
 * but not yet wired: annotating comes with 026.
 */
function useActionHandlers(
  envelope: ObjectEnvelope,
): Readonly<Record<string, (action: ObjectAction) => void>> {
  const api = useRecordLayers()?.api;
  const workspaces = useWorkspaceSync();
  const navigate = useNavigate();
  const toast = useToast();
  return useMemo((): Readonly<Record<string, (action: ObjectAction) => void>> => {
    if (!api) return {};
    const addToWorkspace = () => {
      if (!workspaces) return;
      const active = workspaces.active;
      if (!active) {
        workspaces.openDialog();
        toast.show({ title: 'Open a workspace first', detail: 'Then add the object again.' });
        return;
      }
      void workspaces.addRef(envelope.ref).then(
        (saved) =>
          toast.show(
            saved
              ? { title: `Added to ${active.name}`, tone: 'success' }
              : {
                  title: 'The object was not added',
                  detail: workspaces.active?.error,
                  tone: 'danger',
                },
          ),
        (error: unknown) =>
          toast.show({
            title: 'The object was not added',
            detail: error instanceof Error ? error.message : undefined,
            tone: 'danger',
          }),
      );
    };
    return {
      ...(workspaces && { [ADD_TO_WORKSPACE_ACTION]: addToWorkspace }),
      [OPEN_INVESTIGATION_ACTION]: () =>
        void openInvestigation(api, envelope).then(
          (investigation) => navigate(analysisPath(`investigation:${investigation.id}`) ?? '/'),
          (error: unknown) =>
            toast.show({
              title: 'The investigation was not opened',
              detail: error instanceof Error ? error.message : undefined,
              tone: 'danger',
            }),
        ),
    };
  }, [api, envelope, navigate, toast, workspaces]);
}

/**
 * The right-hand selected-entity panel (014), as the Global mock draws it, from the selected
 * record's dossier (`getObjectDossier`, revalidated by its ETag): the header with the kind's icon,
 * the title, kind and status badges and the record's id; the tabs Overview, Imagery, Forecast,
 * Impacts and Related (n); and in Overview the latest image, the action buttons the envelope
 * lists (two shown, the rest under `…`), the key fields, the Forecast Track mini-map for storm-like
 * kinds and the recent updates. Each section renders to its own status, so one that is unavailable
 * says so while the others show. The dossier is read as of the time machine's instant while the map
 * is pinned (013), and read again when the live stream says the record's kind changed (012).
 */
export function SelectedEntityPanel({ onClose }: { onClose: () => void }) {
  const layers = useRecordLayers();
  const navigate = useNavigate();
  const api = layers?.api;
  const selection = layers?.selection;
  const { ref, asOf, state } = useSelectedDossier();
  const catalog = layers?.catalog.status === 'ready' ? layers.catalog.catalog : undefined;
  const kind = selection?.id.kind;
  const kindEntry = kind ? catalog?.kinds.find((entry) => entry.id === kind) : undefined;

  return (
    <section
      className={styles.entityPanel}
      aria-label="Selected entity"
      data-testid="entity-panel"
      data-ref={ref}
      data-state={state.status}
    >
      <header className={styles.entityHeader}>
        <ChevronRight size={14} aria-hidden="true" />
        <h2 className={styles.sectionLabel}>Selected Entity</h2>
        <span className={styles.spacer} />
        <IconButton label="Close Selected Entity" icon={<X size={15} />} onClick={onClose} />
        <IconButton
          label="Open in new view"
          title="Opens the object in the Analyst Workbench"
          icon={<ExternalLink size={14} />}
          disabled={!ref}
          onClick={() => ref && void navigate(workbenchPath(ref))}
        />
      </header>
      {!selection ? (
        <p className={styles.empty}>Select a record on the map to see its dossier.</p>
      ) : !ref ? (
        <p className={styles.empty}>
          {selection.id.count !== undefined
            ? `${selection.id.count.toLocaleString('en-US')} records counted together here. Zoom in to select one.`
            : 'This item has no dossier.'}
        </p>
      ) : (
        <>
          <TitleRow
            selection={selection}
            dossier={state.status === 'ready' ? state.dossier : undefined}
            icon={
              kindEntry?.swatch && (
                <KindSwatch style={kindEntry.swatch} sprite={layers?.sprite} api={api} />
              )
            }
            kindLabel={kindEntry?.label ?? (kind ? prettifyId(kind) : undefined)}
          />
          {state.status === 'ready' ? (
            <DossierBody
              key={ref}
              api={api}
              selection={selection}
              dossier={state.dossier}
              kindLabel={kindEntry?.label ?? (kind ? prettifyId(kind) : undefined)}
              asOf={asOf}
            />
          ) : state.status === 'error' ? (
            <p className={styles.empty} role="alert">
              The dossier did not load: {state.message}
            </p>
          ) : (
            <p className={styles.empty}>Loading the dossier…</p>
          )}
        </>
      )}
    </section>
  );
}

/** The panel's title row: icon, title, kind and status badges, and the record's id. */
function TitleRow({
  selection,
  dossier,
  icon,
  kindLabel,
}: {
  selection: RecordHit;
  dossier: Dossier | undefined;
  icon: ReactNode;
  kindLabel: string | undefined;
}) {
  const envelope = dossier?.envelope;
  return (
    <div className={styles.entityTitleRow}>
      <div className={styles.entityIcon} aria-hidden="true">
        {icon}
      </div>
      <div className={styles.entityTitleText}>
        <div className={styles.entityTitle} data-testid="entity-title">
          {envelope?.title ?? selection.title ?? kindLabel}
        </div>
        <div className={styles.entityTags}>
          {kindLabel && <Badge tone="info">{kindLabel}</Badge>}
          {envelope?.status && <Badge tone={statusTone(envelope.status)}>{envelope.status}</Badge>}
          {envelope?.severity && <Badge tone="warning">{envelope.severity}</Badge>}
          <span className={styles.muted}>
            ID: {selection.id.externalId ?? parseObjectRef(selection.id.ref ?? '')?.id}
          </span>
        </div>
      </div>
    </div>
  );
}

/** The tabs and the section shown, from a loaded dossier. */
function DossierBody({
  api,
  selection,
  dossier,
  kindLabel,
  asOf,
}: {
  api: ForesignalClient | undefined;
  selection: RecordHit;
  dossier: Dossier;
  kindLabel: string | undefined;
  asOf: string | undefined;
}) {
  const [tab, setTab] = useState<EntityTab>('overview');
  const { sections } = dossier;
  return (
    <>
      <Tabs
        label="Entity sections"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'overview', label: 'Overview' },
          { key: 'imagery', label: 'Imagery' },
          { key: 'forecast', label: 'Forecast' },
          { key: 'impacts', label: 'Impacts' },
          { key: 'related', label: `Related (${relatedCount(dossier)})` },
          { key: 'notes', label: 'Notes' },
        ]}
      />
      <div className={styles.entityBody}>
        {tab === 'overview' && (
          <Overview
            api={api}
            selection={selection}
            dossier={dossier}
            kindLabel={kindLabel}
            asOf={asOf}
          />
        )}
        {tab === 'imagery' && (
          <Section
            name="Imagery"
            status={sections.imagery?.status}
            message={sections.imagery?.message}
          >
            <ul className={styles.dossierList}>
              {sections.imagery?.items?.map((item) => (
                <li key={item.ref}>
                  <span>{item.title ?? prettifyId(item.kind)}</span>
                  <span className={styles.muted}>
                    {[item.sourceId, item.time && formatPanelTime(item.time)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {tab === 'forecast' && (
          <Section
            name="Forecast"
            status={sections.forecast?.status}
            message={sections.forecast?.message}
          >
            <ul className={styles.dossierList}>
              {sections.forecast?.official?.map((forecast) => (
                <li key={forecast.ref}>
                  <span>{forecast.title ?? forecast.kind ?? forecast.ref}</span>
                  <span className={styles.muted}>
                    {[forecast.issuer, forecast.issuedAt && formatPanelTime(forecast.issuedAt)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              ))}
              {sections.forecast?.questions?.map((question) => (
                <li key={question.id}>
                  <span>{question.title}</span>
                  <span className={styles.muted}>
                    {question.probability != null
                      ? `${Math.round(question.probability * 100)}%`
                      : question.status}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {tab === 'impacts' && (
          <>
            <Section
              name="Impacts"
              status={sections.impacts?.status}
              message={sections.impacts?.message}
            >
              <ul className={styles.dossierList}>
                {sections.impacts?.items?.map((impact) => (
                  <li key={impact.findingId}>
                    <span>
                      {prettifyId(impact.impactFamily)}
                      {impact.admin1 ? ` (${impact.admin1})` : ''}
                    </span>
                    <span className={styles.muted}>{Math.round(impact.pImpact * 100)}%</span>
                  </li>
                ))}
              </ul>
            </Section>
            <Section
              name="Analysis"
              status={sections.analysis?.status}
              message={sections.analysis?.message}
            >
              <ul className={styles.dossierList}>
                {[
                  ...(sections.analysis?.findings ?? []),
                  ...(sections.analysis?.hypothesisSets ?? []),
                  ...(sections.analysis?.assessments ?? []),
                ].map((object) => (
                  <li key={object.ref}>
                    <span>{object.title}</span>
                    <span className={styles.muted}>{prettifyId(object.type)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          </>
        )}
        {tab === 'notes' && (
          <AnnotationsPanel
            api={api}
            objectRef={dossier.envelope.ref}
            actions={dossier.envelope.actions}
            heading="Notes"
          />
        )}
        {tab === 'related' && (
          <Section
            name="Related objects"
            status={sections.related?.status}
            message={sections.related?.message}
          >
            {(['nearby', 'operational', 'infrastructure', 'historical'] as const).map((group) => {
              const items = sections.related?.[group] ?? [];
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <h3 className={styles.sectionLabel}>{prettifyId(group)}</h3>
                  <ul className={styles.dossierList}>
                    {items.map((item) => (
                      <li key={`${group}|${item.object.ref}`}>
                        <span>{item.object.title}</span>
                        <span className={styles.muted}>
                          {item.distanceKm != null
                            ? `${Math.round(item.distanceKm).toLocaleString('en-US')} km`
                            : prettifyId(item.relation.type)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </Section>
        )}
      </div>
    </>
  );
}

/** The Overview tab: image and actions, key fields, the storm mini-map and recent updates. */
function Overview({
  api,
  selection,
  dossier,
  kindLabel,
  asOf,
}: {
  api: ForesignalClient | undefined;
  selection: RecordHit;
  dossier: Dossier;
  kindLabel: string | undefined;
  asOf: string | undefined;
}) {
  const { sections, envelope } = dossier;
  const facts = useMemo(() => keyFacts(dossier, kindLabel), [dossier, kindLabel]);
  const image = sections.imagery?.status === 'ok' ? sections.imagery.items?.[0] : undefined;
  return (
    <>
      <div className={styles.overviewGrid}>
        <div>
          {image?.thumbnailUrl ? (
            <img
              className={styles.entityImage}
              src={image.thumbnailUrl}
              alt={image.title ?? 'Latest imagery'}
            />
          ) : (
            <div className={styles.entityNoImage} data-testid="entity-no-image">
              {sectionMessage(
                sections.imagery?.status ?? 'empty',
                'Imagery',
                sections.imagery?.message,
              )}
            </div>
          )}
          <Actions envelope={envelope} />
        </div>
        <dl className={styles.facts} data-testid="entity-facts">
          {facts.key.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {isStormLike(selection.id.kind) && api && (
        <ForecastTrack api={api} selection={selection} asOf={asOf} />
      )}
      <Section
        name="Recent updates"
        status={sections.timeline?.status}
        message={sections.timeline?.message}
        title="Recent Updates"
      >
        <ul className={styles.dossierList}>
          {sections.timeline?.items?.slice(0, 6).map((item) => (
            <li key={`${item.at}|${item.ref ?? item.title}`}>
              <span>{item.title}</span>
              <span className={styles.muted}>{formatPanelTime(item.at)}</span>
            </li>
          ))}
        </ul>
      </Section>
      {facts.more.length > 0 && (
        <details className={styles.moreFields}>
          <summary>More fields ({facts.more.length})</summary>
          <dl className={styles.facts}>
            {facts.more.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </>
  );
}

/**
 * The action buttons, from the envelope's `actions` (what the calling token may do): the first
 * {@link SHOWN_ACTIONS} as buttons, the rest under `…`. An action this client does not carry out
 * yet is shown disabled.
 */
function Actions({ envelope }: { envelope: ObjectEnvelope }) {
  const actions = envelope.actions ?? [];
  const handlers = useActionHandlers(envelope);
  const [open, setOpen] = useState(false);
  const shown = actions.slice(0, SHOWN_ACTIONS);
  const more = actions.slice(SHOWN_ACTIONS);
  const button = (action: ObjectAction) => {
    const handler = handlers[action.id];
    return (
      <Button
        key={action.id}
        data-action={action.id}
        data-scope={action.scope}
        disabled={!handler}
        title={
          handler
            ? `${action.method} ${action.href}`
            : `${actionLabel(action)}: not carried out by this client yet`
        }
        onClick={() => handler?.(action)}
      >
        {actionLabel(action)}
      </Button>
    );
  };
  return (
    <div className={styles.entityActions} data-testid="entity-actions">
      {actions.length === 0 && <span className={styles.muted}>No actions for this object.</span>}
      {shown.map(button)}
      {more.length > 0 && (
        <span className={styles.actionMore}>
          <IconButton
            variant="bordered"
            label="More actions"
            icon={<Ellipsis size={15} />}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          />
          {open && (
            <span className={styles.actionMenu} role="group" aria-label="More actions">
              {more.map(button)}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/** A dossier section, rendered by its status: its content when `ok`, else what it says. */
function Section({
  name,
  title,
  status,
  message,
  children,
}: {
  name: string;
  title?: string;
  status: SectionStatus | undefined;
  message?: string | null;
  children: ReactNode;
}) {
  const said = sectionMessage(status ?? 'not-installed', name, message);
  return (
    <div
      className={styles.dossierSection}
      data-testid={`section-${name.toLowerCase().replace(/\s+/g, '-')}`}
      data-status={status ?? 'missing'}
    >
      {title && <h3 className={styles.sectionLabel}>{title}</h3>}
      {said ? <p className={styles.sectionNote}>{said}</p> : children}
    </div>
  );
}

/** Width and height of the Forecast Track mini-map, in its own units. */
const MAP_WIDTH = 380;
const MAP_HEIGHT = 130;

/**
 * The Forecast Track mini-map for storm-like kinds, as the mock draws it: the storm's track over
 * the last {@link TRAIL_WINDOW_MS} (`getRecordTrack`), fitted to the box, with its current position
 * in red. The forecast points and cone come from a forecast source, which no dossier section
 * carries yet; their legend entries say so.
 */
function ForecastTrack({
  api,
  selection,
  asOf,
}: {
  api: ForesignalClient;
  selection: RecordHit;
  asOf: string | undefined;
}) {
  const [trail, setTrail] = useState<Trail>();
  const { source, externalId } = selection.id;
  useEffect(() => {
    if (!source || !externalId) return;
    const controller = new AbortController();
    const to = asOf !== undefined ? Date.parse(asOf) : Date.now();
    loadTrack(api, source, externalId, { from: to - TRAIL_WINDOW_MS, to }, controller.signal)
      .then((track) => setTrail(trailOf(track)))
      .catch(() => {});
    return () => controller.abort();
  }, [api, source, externalId, asOf]);
  const points = trail?.lines.flat() ?? [];
  const all = [...points, [selection.longitude, selection.latitude] as [number, number]];
  const lons = all.map(([lon]) => lon);
  const lats = all.map(([, lat]) => lat);
  const west = Math.min(...lons) - 1;
  const east = Math.max(...lons) + 1;
  const south = Math.min(...lats) - 1;
  const north = Math.max(...lats) + 1;
  const scale = Math.min(MAP_WIDTH / (east - west), MAP_HEIGHT / (north - south));
  const x = (lon: number) => (MAP_WIDTH - (east - west) * scale) / 2 + (lon - west) * scale;
  const y = (lat: number) => (MAP_HEIGHT - (north - south) * scale) / 2 + (north - lat) * scale;
  return (
    <div data-testid="forecast-track">
      <h3 className={styles.sectionLabel}>Forecast Track</h3>
      <svg
        className={styles.trackMap}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        aria-hidden="true"
      >
        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="#0e1c26" />
        {trail?.lines.map((line, i) => (
          <polyline
            key={i}
            points={line.map(([lon, lat]) => `${x(lon)},${y(lat)}`).join(' ')}
            fill="none"
            stroke="#e8eef5"
            strokeWidth="1.4"
          />
        ))}
        <circle cx={x(selection.longitude)} cy={y(selection.latitude)} r="6" fill="#ff3b3b" />
      </svg>
      <div className={styles.legend}>
        <span>
          <i className={styles.dotCurrent} /> Current
        </span>
        <span title="No forecast source is attached to this object">
          <i className={styles.dotForecast} /> Forecast (none)
        </span>
        <span title="No forecast source is attached to this object">
          <i className={styles.dotCone} /> Cone of Uncertainty (none)
        </span>
      </div>
    </div>
  );
}
