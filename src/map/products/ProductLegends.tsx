import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, LoaderCircle, Pause, Play } from 'lucide-react';
import type { ForesignalClient } from '../../api/client';
import { BARB_SIZE, drawBarb } from './barbGlyph';
import { loadLegend, type Product, type ProductLegend } from './productApi';
import { formatTime, legendBar, legendMeanings } from './productLegendModel';
import { parseProductLayerKey, type ProductFacet, type ProductLayerStatus } from './productLayers';
import styles from './productLegend.module.css';

/** Props for {@link ProductLegends}. */
export interface ProductLegendsProps {
  api?: ForesignalClient;
  /** The product catalog. */
  products: readonly Product[];
  /** The product layers on the map, by key. */
  layers: readonly string[];
  /** What each layer shows now. */
  statuses: Readonly<Record<string, ProductLayerStatus>>;
  /** Raster keys whose loop is playing. */
  looping: ReadonlySet<string>;
  /** Plays or stops a raster's loop. */
  onToggleLoop: (key: string) => void;
}

/** Legends already fetched, by product id, shared by every legend on the page. */
const legends = new Map<string, Promise<ProductLegend>>();

/** A product's legend, fetched once per page. */
function useProductLegend(api: ForesignalClient | undefined, productId: string) {
  const [legend, setLegend] = useState<{ id: string; legend?: ProductLegend; failed?: boolean }>();
  useEffect(() => {
    if (!api) return;
    let active = true;
    let request = legends.get(productId);
    if (!request) {
      request = loadLegend(api, productId);
      legends.set(productId, request);
      request.catch(() => legends.delete(productId));
    }
    request.then(
      (loaded) => active && setLegend({ id: productId, legend: loaded }),
      () => active && setLegend({ id: productId, failed: true }),
    );
    return () => {
      active = false;
    };
  }, [api, productId]);
  return legend?.id === productId ? legend : undefined;
}

/**
 * The product part of the map legend, above the record kinds: one block per product on the map,
 * with its title, the time of the frame drawn, its color bar from the backend's JSON legend
 * (`getProductLegend`: gradient, bands or categories, in its units, the plain-language meanings in
 * the bar's tooltip) and a play/pause control for its loop. A wind field also shows its barb
 * glyphs and says how the particles show speed.
 */
export function ProductLegends({
  api,
  products,
  layers,
  statuses,
  looping,
  onToggleLoop,
}: ProductLegendsProps) {
  const groups = useMemo(() => {
    const byId = new Map(products.map((product) => [product.id, product]));
    const out = new Map<string, { product: Product; facets: Map<ProductFacet, string> }>();
    for (const key of layers) {
      const { productId, facet } = parseProductLayerKey(key);
      const product = byId.get(productId);
      if (!product) continue;
      const group = out.get(productId) ?? { product, facets: new Map() };
      group.facets.set(facet, key);
      out.set(productId, group);
    }
    return [...out.values()];
  }, [products, layers]);
  if (groups.length === 0) return null;
  return (
    <div className={styles.products} data-testid="product-legends">
      {groups.map(({ product, facets }) => (
        <ProductBlock
          key={product.id}
          api={api}
          product={product}
          facets={facets}
          statuses={statuses}
          looping={looping}
          onToggleLoop={onToggleLoop}
        />
      ))}
    </div>
  );
}

/** One product's legend block. */
function ProductBlock({
  api,
  product,
  facets,
  statuses,
  looping,
  onToggleLoop,
}: {
  api?: ForesignalClient;
  product: Product;
  facets: Map<ProductFacet, string>;
  statuses: Readonly<Record<string, ProductLayerStatus>>;
  looping: ReadonlySet<string>;
  onToggleLoop: (key: string) => void;
}) {
  const loaded = useProductLegend(api, product.id);
  const rasterKey = facets.get('raster');
  const raster = rasterKey ? statuses[rasterKey] : undefined;
  const keys = [...facets.values()];
  const failed = keys.map((key) => statuses[key]).find((status) => status?.state === 'error');
  const loading = keys.some((key) => (statuses[key]?.state ?? 'loading') === 'loading');
  const loop = raster?.loop;
  const time = loop?.state === 'playing' ? loop.time : (raster?.time ?? firstTime(keys, statuses));
  const playing = rasterKey !== undefined && looping.has(rasterKey);
  return (
    <section
      className={styles.block}
      data-product={product.id}
      data-loop-state={playing ? (loop?.state ?? 'loading') : 'off'}
      data-loop-index={loop?.index}
      aria-label={`${product.title} legend`}
    >
      <header className={styles.head}>
        <span className={styles.name} title={product.legend?.summary ?? product.title}>
          {product.title}
        </span>
        {failed ? (
          <CircleAlert size={13} color="#ff6b6b" aria-label={`Did not load: ${failed.message}`}>
            <title>{failed.message}</title>
          </CircleAlert>
        ) : loading ? (
          <LoaderCircle className={styles.spin} size={13} aria-label="Loading" />
        ) : null}
        {rasterKey && (
          <button
            type="button"
            className={styles.play}
            aria-pressed={playing}
            aria-label={
              playing ? `Stop the ${product.title} loop` : `Play the ${product.title} loop`
            }
            title={playing ? 'Stop the loop' : 'Play the recent frames over this view'}
            onClick={() => onToggleLoop(rasterKey)}
          >
            {playing ? <Pause size={12} /> : <Play size={12} />}
          </button>
        )}
      </header>
      <div className={styles.meta}>
        {time && <time dateTime={time}>{formatTime(time)}</time>}
        {playing && loop?.state === 'playing' && (
          <span data-testid="loop-frame">
            Frame {loop.index + 1} of {loop.frames}
          </span>
        )}
        {playing && loop?.state === 'loading' && <span>Loading the loop…</span>}
        {playing && loop?.state === 'error' && <span role="alert">{loop.message}</span>}
      </div>
      {rasterKey && loaded?.legend && <Bar legend={loaded.legend} />}
      {loaded?.failed && <p className={styles.note}>The legend did not load.</p>}
      {facets.has('particles') && (
        <p className={styles.note}>
          Particles move with the wind; faster wind, longer trails
          {statuses[facets.get('particles')!]?.count
            ? ` (${statuses[facets.get('particles')!]!.count!.toLocaleString('en-US')})`
            : ''}
          .
        </p>
      )}
      {facets.has('barbs') && <BarbKey />}
    </section>
  );
}

/** A legend's color bar with its units. */
function Bar({ legend }: { legend: ProductLegend }) {
  const bar = legendBar(legend);
  if (!bar) return null;
  const units = legend.unitsLabel ?? legend.units ?? '';
  const meanings = legendMeanings(legend);
  if (bar.type === 'categories') {
    return (
      <ul className={styles.categories} title={meanings || undefined}>
        {bar.items.map((item) => (
          <li key={item.label}>
            <i style={{ background: item.color }} />
            {item.label}
          </li>
        ))}
      </ul>
    );
  }
  if (bar.type === 'bands') {
    // Every band is drawn; a few are labeled, so the labels never run together.
    const every = Math.ceil(bar.bands.length / 6);
    return (
      <div className={styles.barWrap} title={meanings || undefined}>
        <div className={styles.bands} data-testid="legend-bar" data-bar="bands">
          {bar.bands.map((band, i) => (
            <i key={`${band.color}${i}`} style={{ background: band.color }} title={band.label} />
          ))}
        </div>
        <div className={styles.bandLabels}>
          {bar.bands.map((band, i) => (
            <span key={`${band.label}${i}`}>{i % every === 0 ? band.label : ''}</span>
          ))}
          <span className={styles.units}>{units}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.barWrap} title={meanings || undefined}>
      <div
        className={styles.gradient}
        style={{ background: bar.background }}
        data-testid="legend-bar"
        data-bar="gradient"
      />
      <div className={styles.ticks}>
        {bar.ticks.map((tick) => (
          <span key={tick.at} style={{ left: `${tick.at}%` }}>
            {tick.label}
          </span>
        ))}
      </div>
      {units && <div className={styles.units}>{units}</div>}
    </div>
  );
}

/** Speeds the barb key shows, in knots. */
const KEY_KNOTS = [5, 10, 25, 50, 65];

/** The barb glyphs for a few speeds. */
function BarbKey() {
  const glyphs = useMemo(
    () => KEY_KNOTS.map((knots) => ({ knots, url: drawBarb(knots, 2).toDataURL() })),
    [],
  );
  return (
    <div className={styles.barbs} aria-label="Wind barbs in knots">
      {glyphs.map(({ knots, url }) => (
        <span key={knots}>
          <img src={url} alt="" width={BARB_SIZE.width} height={BARB_SIZE.height} />
          {knots}
        </span>
      ))}
      <span className={styles.units}>kt</span>
    </div>
  );
}

/** The time of the first facet that has one. */
function firstTime(
  keys: readonly string[],
  statuses: Readonly<Record<string, ProductLayerStatus>>,
): string | undefined {
  return keys.map((key) => statuses[key]?.time).find(Boolean);
}
