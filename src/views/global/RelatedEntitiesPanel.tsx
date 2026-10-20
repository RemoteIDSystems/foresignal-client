import { createElement, useState } from 'react';
import { ChevronRight, CircleCheck, Diamond, TriangleAlert } from 'lucide-react';
import { prettifyId } from '../../lib/labels';
import { sectionMessage } from '../../objects/dossierView';
import { useRelatedObjects } from '../../objects/relatedApi';
import { Badge } from '../../ui/Badge';
import { List } from '../../ui/List';
import { Panel } from '../../ui/Panel';
import { Tabs } from '../../ui/Tabs';
import { useRecordLayers } from './recordLayersContext';
import {
  RELATED_GROUPS,
  groupRelated,
  relationText,
  statusLook,
  typeIcon,
  type RelatedGroup,
  type RelatedObject,
} from './relatedView';
import { useSelectedDossier } from './useSelectedDossier';
import styles from './GlobalDashboard.module.css';

/**
 * Related entities panel (016): what is related to the selected object, in the mock's four tabs,
 * Nearby, Operational, Infrastructure and Historical. The lists come from the selected object's
 * dossier (its related section, the same request as the Selected Entity panel); when the dossier
 * cut them short, the full list is read (`listRelatedObjects`) and sorted into the four classes. A
 * row selects its object, and the map brings it into view (014).
 */
export function RelatedEntitiesPanel() {
  const layers = useRecordLayers();
  const { ref, asOf, state } = useSelectedDossier();
  const [tab, setTab] = useState<RelatedGroup>('nearby');
  const section = state.status === 'ready' ? state.dossier.sections.related : undefined;
  const full = useRelatedObjects(layers?.api, ref, asOf, section?.truncated === true);
  const groups =
    full.status === 'ready'
      ? groupRelated(full.related.items)
      : {
          nearby: section?.nearby ?? [],
          operational: section?.operational ?? [],
          infrastructure: section?.infrastructure ?? [],
          historical: section?.historical ?? [],
        };
  const rows = groups[tab];
  const note = !ref
    ? 'Select an object to see what is related to it.'
    : state.status === 'error'
      ? `The related objects did not load: ${state.message}`
      : state.status !== 'ready'
        ? 'Loading the related objects…'
        : section && section.status !== 'ok'
          ? sectionMessage(section.status, 'Related objects', section.message)
          : !section
            ? 'This object lists no related objects.'
            : rows.length === 0
              ? `Nothing ${prettifyId(tab).toLowerCase()} for this object.`
              : undefined;

  return (
    <Panel title="Related Entities">
      <Tabs
        label="Relation types"
        value={tab}
        onChange={setTab}
        items={RELATED_GROUPS.map((group) => ({ key: group, label: prettifyId(group) }))}
      />
      <div
        data-testid="related-entities"
        data-ref={ref}
        data-tab={tab}
        data-counts={RELATED_GROUPS.map((group) => groups[group].length).join(' ')}
        data-source={full.status === 'ready' ? 'list' : 'dossier'}
      >
        {note && (
          <p className={styles.summaryNote} role={state.status === 'error' ? 'alert' : undefined}>
            {note}
          </p>
        )}
        {full.status === 'error' && (
          <p className={styles.summaryNote} role="alert">
            Only the first related objects are shown; the full list did not load: {full.message}
          </p>
        )}
        <List
          label="Related entities"
          items={note ? [] : rows}
          getKey={(item) => `${item.relation.type}|${item.direction}|${item.object.ref}`}
          renderItem={(item) => (
            <RelatedRow item={item} onSelect={() => void layers?.selectRef?.(item.object.ref)} />
          )}
        />
      </div>
    </Panel>
  );
}

/** One related object: its type's icon, name, type tag, distance or relation, status and chevron. */
function RelatedRow({ item, onSelect }: { item: RelatedObject; onSelect: () => void }) {
  const { object } = item;
  const look = statusLook(object.status, object.severity);
  return (
    <button type="button" className={styles.rowButton} onClick={onSelect} title={object.title}>
      <span className={styles.relatedThumb} aria-hidden="true">
        {createElement(typeIcon(object.type), { size: 18 })}
      </span>
      <span className={styles.relatedMain}>
        <span className={styles.relatedName}>{object.title}</span>
        <Badge>{prettifyId(object.type)}</Badge>
      </span>
      <span className={styles.relatedMeta}>
        <span>{relationText(item)}</span>
        {object.status && (
          <span className={styles[`status_${look}`]}>
            {look === 'ok' && <CircleCheck size={12} aria-hidden="true" />}
            {look === 'alert' && <TriangleAlert size={12} aria-hidden="true" />}
            {look === 'warn' && <Diamond size={12} aria-hidden="true" />}{' '}
            {prettifyId(object.status)}
          </span>
        )}
      </span>
      <ChevronRight size={15} className={styles.muted} aria-hidden="true" />
    </button>
  );
}
