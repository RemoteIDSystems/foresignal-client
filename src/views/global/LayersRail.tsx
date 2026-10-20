import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  Building,
  Camera,
  ChevronRight,
  CircleAlert,
  CircleDot,
  Cloud,
  Crosshair,
  Hexagon,
  LoaderCircle,
  Network,
  Plane,
  Plus,
  RadioTower,
  Satellite,
  Ship,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import type { CategoryId } from '../../lib/kindCategories';
import { PRODUCT_CATEGORY_LABELS } from '../../lib/productCategories';
import {
  categoryDefaultKeys,
  productFacets,
  rowKeys,
  allKeys,
  type ProductEntry,
} from '../../map/products/productCatalog';
import {
  productLayerKey,
  type ProductFacet,
  type ProductLayerStatus,
} from '../../map/products/productLayers';
import {
  filterSources,
  shownCount,
  type CategoryGroup,
  type KindEntry,
} from '../../map/records/catalog';
import type { RecordLayerStatus } from '../../map/records/recordLayers';
import { KindSwatch } from '../../map/style/legend';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Tabs } from '../../ui/Tabs';
import { useRecordLayers, type RecordLayersValue } from './recordLayersContext';
import styles from './GlobalDashboard.module.css';

type RailTab = 'layers' | 'entities' | 'filters';

/** Each category's icon, after the Global mock's; Events is red there, as here. */
const CATEGORY_ICONS: Record<CategoryId, ReactNode> = {
  events: <Activity size={16} color="#ff6b6b" />,
  aircraft: <Plane size={16} />,
  maritime: <Ship size={16} />,
  satellites: <Satellite size={16} />,
  weather: <Cloud size={16} />,
  imagery: <Camera size={16} />,
  rf: <RadioTower size={16} />,
  infrastructure: <Building size={16} />,
  cyber: <Network size={16} />,
  energy: <Zap size={16} />,
  hazards: <TriangleAlert size={16} />,
  conflicts: <Crosshair size={16} />,
  other: <CircleDot size={16} />,
};

/**
 * The left LAYERS / ENTITIES / FILTERS rail, as in the Global mock. LAYERS lists the record kinds
 * grouped into the mock's categories (`lib/kindCategories`): a category's checkbox turns all its
 * kinds on or off, and it opens to the kinds themselves, each with its icon from the overlay style,
 * its label (the 006 prettifier), its record count and a toggle, then to the backend's raster
 * products and wind fields of that category (009), each a toggle (a wind field also offers its
 * speed raster, barbs and particles separately). A category's checkbox covers its kinds and its
 * curated products. FILTERS restricts which sources' records show within the kinds that are on.
 * ENTITIES is a stub until its prompt.
 */
export function LayersRail() {
  const layers = useRecordLayers();
  const [tab, setTab] = useState<RailTab>('layers');

  return (
    <section className={styles.rail} aria-label="Layers">
      <Tabs
        label="Rail sections"
        variant="boxed"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'layers', label: 'Layers' },
          { key: 'entities', label: 'Entities' },
          { key: 'filters', label: 'Filters' },
        ]}
      />
      {tab === 'entities' ? (
        <p className={styles.empty}>Entity list arrives with live data.</p>
      ) : !layers ? (
        <p className={styles.empty}>Layers need a backend connection.</p>
      ) : layers.catalog.status === 'loading' ? (
        <p className={styles.empty}>Loading layers…</p>
      ) : layers.catalog.status === 'error' ? (
        <p className={styles.empty} role="alert">
          The layer list did not load.
        </p>
      ) : tab === 'layers' ? (
        <LayersTab layers={layers} categories={layers.catalog.catalog.categories} />
      ) : (
        <FiltersTab layers={layers} />
      )}
    </section>
  );
}

/** The LAYERS tab: categories, each opening to its kinds. */
function LayersTab({
  layers,
  categories,
}: {
  layers: RecordLayersValue;
  categories: CategoryGroup[];
}) {
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<ReadonlySet<CategoryId>>(() => new Set());
  const needle = filter.trim().toLowerCase();
  const products = layers.products.entries;
  const shown = useMemo(
    () =>
      categories
        .map((group) => {
          const matches = (label: string, id: string) =>
            !needle ||
            label.toLowerCase().includes(needle) ||
            id.includes(needle) ||
            group.label.toLowerCase().includes(needle);
          return {
            ...group,
            kinds: group.kinds.filter((entry) => matches(entry.label, entry.id)),
            products: products.filter(
              (entry) => entry.category === group.id && matches(entry.label, entry.id),
            ),
          };
        })
        .filter((group) => group.kinds.length > 0 || group.products.length > 0),
    [categories, products, needle],
  );
  const productsOn = products.filter((entry) =>
    allKeys(entry).some((key) => layers.products.enabled.has(key)),
  ).length;
  const on = layers.enabled.size + productsOn;
  const toggleOpen = (id: CategoryId) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <>
      <div className={styles.railTools}>
        <input
          className={styles.railFilter}
          type="search"
          placeholder="Filter layers"
          aria-label="Filter layers"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <div className={styles.railSummary} data-testid="layers-on">
          <span>{on === 0 ? 'No layers on' : `${on} on`}</span>
          {on > 0 && (
            <button type="button" className={styles.linkButton} onClick={layers.clear}>
              Turn all off
            </button>
          )}
        </div>
      </div>
      <ul className={styles.layerList}>
        {shown.map((group) => (
          <CategoryRow
            key={group.id}
            group={group}
            products={group.products}
            layers={layers}
            // A filter opens every category it matches.
            open={needle !== '' || open.has(group.id)}
            onToggleOpen={() => toggleOpen(group.id)}
          />
        ))}
        {shown.length === 0 && <li className={styles.empty}>No layers match “{filter}”.</li>}
      </ul>
      <div className={styles.railFooter}>
        <Button icon={<Plus size={14} />}>Add Layer</Button>
      </div>
    </>
  );
}

/** One category: a checkbox for all its kinds, its icon, label and count, and its kinds when open. */
function CategoryRow({
  group,
  products,
  layers,
  open,
  onToggleOpen,
}: {
  group: CategoryGroup;
  products: readonly ProductEntry[];
  layers: RecordLayersValue;
  open: boolean;
  onToggleOpen: () => void;
}) {
  const ids = group.kinds.map((entry) => entry.id);
  // The checkbox covers the kinds and the curated products that can be drawn.
  const productKeys = categoryDefaultKeys(layers.products.entries, group.id);
  const onCount =
    ids.filter((id) => layers.enabled.has(id)).length +
    productKeys.filter((key) => layers.products.enabled.has(key)).length;
  const total = ids.length + productKeys.length;
  const all = total > 0 && onCount === total;
  const some = onCount > 0 && !all;
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (box.current) box.current.indeterminate = some;
  }, [some]);
  const statuses: (RecordLayerStatus | ProductLayerStatus)[] = [
    ...group.kinds
      .filter((entry) => layers.enabled.has(entry.id))
      .map((entry) => layers.statuses[entry.id]),
    ...products
      .flatMap((entry) => allKeys(entry))
      .filter((key) => layers.products.enabled.has(key))
      .map((key) => layers.products.statuses[key]),
  ].filter((status) => status !== undefined);
  const listId = `rail-category-${group.id}`;

  return (
    <li data-category={group.id} data-category-state={all ? 'on' : some ? 'some' : 'off'}>
      <div
        className={
          shownCount(group) === 0 ? `${styles.layerRow} ${styles.layerEmpty}` : styles.layerRow
        }
      >
        <label className={styles.categoryLabel}>
          <input
            ref={box}
            type="checkbox"
            className={styles.checkbox}
            checked={all}
            onChange={() => {
              layers.setKinds(ids, !all);
              if (productKeys.length) layers.products.setKeys(productKeys, !all);
            }}
          />
          <span className={styles.categoryIcon} aria-hidden="true">
            {CATEGORY_ICONS[group.id]}
          </span>
          <span className={styles.layerName}>{group.label}</span>
        </label>
        <CategoryMark statuses={statuses} />
        <CountBadge counted={group} />
        <button
          type="button"
          className={open ? `${styles.expandButton} ${styles.expanded}` : styles.expandButton}
          aria-expanded={open}
          aria-controls={listId}
          aria-label={`${open ? 'Hide' : 'Show'} the kinds in ${group.label}`}
          onClick={onToggleOpen}
        >
          <ChevronRight size={14} />
        </button>
      </div>
      {open && (
        <ul className={styles.kindList} id={listId}>
          {group.kinds.map((entry) => (
            <KindRow
              key={entry.id}
              entry={entry}
              layers={layers}
              status={layers.enabled.has(entry.id) ? layers.statuses[entry.id] : undefined}
            />
          ))}
          {products.length > 0 && <ProductList entries={products} layers={layers} />}
        </ul>
      )}
    </li>
  );
}

/** A category's mark: loading or failed when any of its drawn kinds or products is. */
function CategoryMark({ statuses }: { statuses: (RecordLayerStatus | ProductLayerStatus)[] }) {
  if (statuses.some((status) => status.state === 'error')) {
    return <CircleAlert size={13} color="#ff6b6b" aria-label="A layer did not load" />;
  }
  if (statuses.some((status) => status.state === 'loading')) {
    return <LoaderCircle className={styles.spin} size={13} aria-label="Loading" />;
  }
  return null;
}

/** One kind: toggle, icon, label, count and what the map shows of it. */
function KindRow({
  entry,
  layers,
  status,
}: {
  entry: KindEntry;
  layers: RecordLayersValue;
  status: RecordLayerStatus | undefined;
}) {
  return (
    <li data-layer={entry.id} data-layer-state={status?.state}>
      <label
        className={
          shownCount(entry) === 0 ? `${styles.kindRow} ${styles.layerEmpty}` : styles.kindRow
        }
      >
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={layers.enabled.has(entry.id)}
          onChange={() => layers.toggle(entry.id)}
        />
        {entry.swatch ? (
          <KindSwatch style={entry.swatch} sprite={layers.sprite} api={layers.api} />
        ) : (
          <span className={styles.noSwatch} aria-hidden="true" />
        )}
        <span className={styles.layerName}>{entry.label}</span>
        <StatusMark status={status} entry={entry} />
        <CountBadge counted={entry} />
      </label>
    </li>
  );
}

/**
 * A kind's or category's record count: in the map's view once the viewport summary is in (008),
 * else anywhere now. Its tooltip says which.
 */
function CountBadge({ counted }: { counted: { count: number; viewCount?: number } }) {
  const inView = counted.viewCount !== undefined;
  return (
    <span
      title={inView ? 'Records in view' : 'Records now'}
      data-count-scope={inView ? 'view' : 'all'}
    >
      <Badge kind="count">{shownCount(counted).toLocaleString('en-US')}</Badge>
    </span>
  );
}

/** A small mark for a kind that is loading, failed, or shown as hexagon counts at this zoom. */
function StatusMark({ status, entry }: { status?: RecordLayerStatus; entry: KindEntry }) {
  if (!status) return null;
  if (status.state === 'loading') {
    return <LoaderCircle className={styles.spin} size={13} aria-label="Loading" />;
  }
  if (status.state === 'error') {
    return (
      <CircleAlert
        size={13}
        color="#ff6b6b"
        aria-label={`Did not load: ${status.message ?? 'error'}`}
      >
        <title>{status.message}</title>
      </CircleAlert>
    );
  }
  if (status.state === 'aggregated') {
    const label = `Hexagon counts below zoom ${entry.aggBelowZoom}; zoom in to see records`;
    return (
      <Hexagon size={13} color="#9fb4c8" aria-label={label}>
        <title>{label}</title>
      </Hexagon>
    );
  }
  return null;
}

/**
 * The FILTERS tab: the sources that draw the kinds that are on, each with a checkbox. Unchecking a
 * source hides its records on the map without turning its kinds off, so a record is still drawn
 * once, by its kind. The sources supplying records now are listed first.
 */
function FiltersTab({ layers }: { layers: RecordLayersValue }) {
  const [filter, setFilter] = useState('');
  const catalog = layers.catalog.status === 'ready' ? layers.catalog.catalog : undefined;
  const sources = useMemo(
    () => (catalog ? filterSources(catalog, layers.enabled) : []),
    [catalog, layers.enabled],
  );
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? sources.filter(
        (source) => source.label.toLowerCase().includes(needle) || source.id.includes(needle),
      )
    : sources;
  const hidden = sources.filter((source) => layers.hiddenSources.has(source.id)).length;

  if (layers.enabled.size === 0) {
    return <p className={styles.empty}>Turn a layer on to choose its sources.</p>;
  }
  return (
    <>
      <div className={styles.railTools}>
        <p className={styles.sectionLabel}>Sources</p>
        <input
          className={styles.railFilter}
          type="search"
          placeholder="Filter sources"
          aria-label="Filter sources"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <div className={styles.railSummary} data-testid="sources-shown">
          <span>
            {hidden === 0
              ? `All ${sources.length} shown`
              : `${sources.length - hidden} of ${sources.length} shown`}
          </span>
          {hidden > 0 && (
            <button type="button" className={styles.linkButton} onClick={layers.showAllSources}>
              Show all
            </button>
          )}
        </div>
      </div>
      <ul className={styles.layerList}>
        {shown.map((source) => (
          <li key={source.id} data-source={source.id}>
            <label
              className={source.live ? styles.kindRow : `${styles.kindRow} ${styles.layerEmpty}`}
              title={source.id}
            >
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={!layers.hiddenSources.has(source.id)}
                onChange={() => layers.toggleSource(source.id)}
              />
              <span className={styles.layerName}>{source.label}</span>
              {source.count !== undefined && (
                <Badge kind="count">{source.count.toLocaleString('en-US')}</Badge>
              )}
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className={styles.empty}>No sources match “{filter}”.</li>}
      </ul>
    </>
  );
}

/** Facet toggles' labels: a wind field's speed raster, barbs and particles. */
const FACET_LABELS: Record<ProductFacet, string> = {
  raster: 'Speed',
  barbs: 'Barbs',
  particles: 'Particles',
};

/**
 * A category's products, under a "Products" heading, grouped by their own category (radar,
 * satellite, models…). Those that cannot be drawn now (disabled) are folded away under a count,
 * each with its reason.
 */
function ProductList({
  entries,
  layers,
}: {
  entries: readonly ProductEntry[];
  layers: RecordLayersValue;
}) {
  const available = entries.filter((entry) => entry.available);
  const unavailable = entries.filter((entry) => !entry.available);
  const groups = new Map<string, ProductEntry[]>();
  for (const entry of available) {
    const label = PRODUCT_CATEGORY_LABELS[entry.productCategory] ?? entry.productCategory;
    groups.set(label, [...(groups.get(label) ?? []), entry]);
  }
  return (
    <li className={styles.productSection} data-testid="rail-products">
      <p className={styles.sectionLabel}>Products</p>
      {[...groups].map(([label, list]) => (
        <div key={label} className={styles.productGroup}>
          <p className={styles.productGroupLabel}>{label}</p>
          <ul className={styles.kindList}>
            {list.map((entry) => (
              <ProductRow key={entry.id} entry={entry} layers={layers} />
            ))}
          </ul>
        </div>
      ))}
      {available.length === 0 && (
        <p className={styles.empty}>No products can be drawn right now.</p>
      )}
      {unavailable.length > 0 && (
        <details className={styles.unavailable}>
          <summary>{unavailable.length.toLocaleString('en-US')} unavailable</summary>
          <ul className={styles.kindList}>
            {unavailable.map((entry) => (
              <li key={entry.id} data-product={entry.id} data-product-state="unavailable">
                <span
                  className={`${styles.kindRow} ${styles.layerEmpty}`}
                  title={`${entry.label}: ${entry.reason}`}
                >
                  <input type="checkbox" className={styles.checkbox} disabled checked={false} />
                  <span className={styles.layerName}>{entry.label}</span>
                  <span className={styles.productReason}>{entry.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

/** One product: a toggle with its title and status; a wind field adds its facet toggles when on. */
function ProductRow({ entry, layers }: { entry: ProductEntry; layers: RecordLayersValue }) {
  const { enabled, setKeys, statuses } = layers.products;
  const keys = allKeys(entry);
  const onKeys = keys.filter((key) => enabled.has(key));
  const on = onKeys.length > 0;
  const status = onKeys
    .map((key) => statuses[key])
    .find((item) => item?.state === 'error' || item?.state === 'loading');
  const facets = productFacets(entry);
  return (
    <li data-product={entry.id} data-product-state={on ? (status?.state ?? 'ready') : 'off'}>
      <label className={styles.kindRow} title={entry.summary ?? entry.label}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={on}
          onChange={() => (on ? setKeys(keys, false) : setKeys(rowKeys(entry), true))}
        />
        <span className={styles.layerName}>{entry.label}</span>
        <ProductMark status={status} />
        {entry.coverage && entry.coverage !== 'global' && (
          <span className={styles.coverage}>{entry.coverage}</span>
        )}
      </label>
      {on && facets.length > 1 && (
        <div className={styles.facets} role="group" aria-label={`${entry.label} shown as`}>
          {facets.map((facet) => {
            const key = productLayerKey(entry.id, facet);
            const pressed = enabled.has(key);
            return (
              <button
                key={facet}
                type="button"
                className={styles.facet}
                aria-pressed={pressed}
                data-facet={facet}
                data-facet-state={pressed ? (statuses[key]?.state ?? 'loading') : 'off'}
                title={pressed ? statuses[key]?.message : undefined}
                onClick={() => setKeys([key], !pressed)}
              >
                {FACET_LABELS[facet]}
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}

/** A product's mark: loading, or failed with why. */
function ProductMark({ status }: { status?: ProductLayerStatus }) {
  if (status?.state === 'loading') {
    return <LoaderCircle className={styles.spin} size={13} aria-label="Loading" />;
  }
  if (status?.state === 'error') {
    return (
      <CircleAlert
        size={13}
        color="#ff6b6b"
        aria-label={`Did not load: ${status.message ?? 'error'}`}
      >
        <title>{status.message}</title>
      </CircleAlert>
    );
  }
  return null;
}
