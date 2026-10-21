import { useRef, useState, type PointerEvent } from 'react';
import { ArrowLeftRight, ArrowRight } from 'lucide-react';
import type { ForesignalClient } from '../api/client';
import type { Product } from '../map/products/productApi';
import { Button } from '../ui/Button';
import {
  CHANGE_METRICS,
  defaultPair,
  durationMs,
  frameLabel,
  NO_CHANGE_DETECTION,
  type Bbox,
  type ComparisonFrame,
} from './imageryView';
import { Picture } from './Picture';
import { useComparableProducts, useComparisonFrames } from './useRecentImagery';
import analysis from '../views/analysis/Analysis.module.css';
import styles from './Imagery.module.css';

/** Props for {@link ImageryComparison}. */
export interface ImageryComparisonProps {
  api: ForesignalClient | undefined;
  /** The view, in whole degrees: the frames are of it, or of its middle. */
  area: Bbox;
  /** A heading level-2 title; none when the panel around it has one. */
  title?: string;
}

/** The product the comparison opens with: a daily true-color one if there is, else the first. */
function firstProduct(products: readonly Product[]): Product | undefined {
  return (
    products.find(
      (product) =>
        durationMs(product.external?.timeDimension?.period) === 86_400_000 &&
        /true ?color/i.test(product.title),
    ) ?? products[0]
  );
}

/**
 * The Imagery Comparison panel, as the mock draws it: one product's frames at two dates either
 * side of a swipe, the change metrics, and Run Change Detection. The backend exposes no
 * change-detection operation and supplies no change metrics, so each metric reads `—` and the run
 * action is disabled with why; the swipe compare works between any two of the product's frames.
 */
export function ImageryComparison({ api, area, title }: ImageryComparisonProps) {
  const products = useComparableProducts(api);
  const list = products.status === 'ready' ? products.value : [];
  const [productId, setProductId] = useState<string>();
  const product = list.find((entry) => entry.id === productId) ?? firstProduct(list);
  const frames = useComparisonFrames(api, product, area);
  const offered = frames.status === 'ready' ? frames.value : [];
  const daily = durationMs(product?.external?.timeDimension?.period) === 86_400_000;
  // The chosen dates belong to one product; another product opens with its own pair.
  const [chosen, setChosen] = useState<{ product: string; before?: string; after?: string }>();
  const pair = defaultPair(offered, product);
  const mine = chosen?.product === product?.id ? chosen : undefined;
  const beforeTime = mine?.before ?? pair?.before;
  const afterTime = mine?.after ?? pair?.after;
  const before = offered.find((frame) => frame.time === beforeTime);
  const after = offered.find((frame) => frame.time === afterTime);
  const choose = (side: 'before' | 'after', time: string) =>
    product && setChosen({ ...mine, product: product.id, [side]: time });

  return (
    <div className={styles.compare} data-testid="imagery-comparison">
      {title && <h2 className={analysis.cardTitle}>{title}</h2>}
      {products.status === 'loading' ? (
        <p className={analysis.muted}>Loading imagery products…</p>
      ) : products.status === 'error' ? (
        <p className={analysis.muted}>{products.message}</p>
      ) : !product ? (
        <p className={analysis.muted}>
          No imagery product to compare: the backend has no enabled satellite or imagery product.
        </p>
      ) : (
        <>
          <div className={styles.compareControls}>
            <label>
              Product
              <select
                className={analysis.select}
                value={product.id}
                onChange={(event) => setProductId(event.target.value)}
              >
                {list.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.title}
                  </option>
                ))}
              </select>
            </label>
            <FramePicker
              label="Before"
              frames={offered}
              value={beforeTime}
              daily={daily}
              onChange={(time) => choose('before', time)}
            />
            <FramePicker
              label="After"
              frames={offered}
              value={afterTime}
              daily={daily}
              onChange={(time) => choose('after', time)}
            />
          </div>
          {frames.status === 'loading' ? (
            <p className={analysis.muted}>Loading frames…</p>
          ) : frames.status === 'error' ? (
            <p className={analysis.muted}>{frames.message}</p>
          ) : before && after ? (
            <SwipeCompare
              api={api}
              before={before}
              after={after}
              beforeLabel={frameLabel(before.time, daily)}
              afterLabel={frameLabel(after.time, daily)}
              alt={product.title}
            />
          ) : (
            <p className={analysis.muted}>
              This product has fewer than two frames over the view to compare.
            </p>
          )}
          {product.attribution?.requiredDisplay && (
            <p className={styles.attribution}>{product.attribution.text}</p>
          )}
        </>
      )}
      <dl className={styles.metrics} data-testid="change-metrics">
        {CHANGE_METRICS.map((metric) => (
          <div key={metric.label} className={styles.metric}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.compareFoot}>
        <span className={analysis.muted}>Change metrics: not supplied by the backend.</span>
        <Button variant="primary" disabled title={NO_CHANGE_DETECTION}>
          Run Change Detection <ArrowRight size={14} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/** A select of the offered frames, by date or minute. */
function FramePicker({
  label,
  frames,
  value,
  daily,
  onChange,
}: {
  label: string;
  frames: readonly ComparisonFrame[];
  value: string | undefined;
  daily: boolean;
  onChange: (time: string) => void;
}) {
  return (
    <label>
      {label}
      <select
        className={analysis.select}
        value={value ?? ''}
        disabled={frames.length < 2}
        onChange={(event) => onChange(event.target.value)}
      >
        {frames.map((frame) => (
          <option key={frame.time} value={frame.time}>
            {frameLabel(frame.time, daily)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Props for {@link SwipeCompare}. */
export interface SwipeCompareProps {
  api: ForesignalClient | undefined;
  before: ComparisonFrame;
  after: ComparisonFrame;
  beforeLabel: string;
  afterLabel: string;
  alt: string;
}

/**
 * A before/after swipe: the after frame below, the before frame over it clipped at the swipe
 * position, a handle there, and the dates in the corners. Dragging on the frames moves it; so do
 * the slider under them and its arrow keys.
 */
export function SwipeCompare({
  api,
  before,
  after,
  beforeLabel,
  afterLabel,
  alt,
}: SwipeCompareProps) {
  const [position, setPosition] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const moveTo = (event: PointerEvent<HTMLDivElement>) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const share = ((event.clientX - rect.left) / rect.width) * 100;
    setPosition(Math.round(Math.max(0, Math.min(100, share))));
  };
  return (
    <>
      <div
        ref={box}
        className={styles.swipe}
        data-testid="swipe-compare"
        data-position={position}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          moveTo(event);
        }}
        onPointerMove={(event) => dragging.current && moveTo(event)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <div className={styles.swipeLayer} data-testid="swipe-after">
          <Picture api={api} spec={after.spec} size="full" alt={`${alt}, ${afterLabel}`} />
        </div>
        <div
          className={styles.swipeLayer}
          data-testid="swipe-before"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <Picture api={api} spec={before.spec} size="full" alt={`${alt}, ${beforeLabel}`} />
        </div>
        <div className={styles.swipeHandle} style={{ left: `${position}%` }} aria-hidden="true">
          <span className={styles.swipeKnob}>
            <ArrowLeftRight size={14} />
          </span>
        </div>
        <span className={styles.swipeLabel} style={{ left: 8 }}>
          {beforeLabel}
        </span>
        <span className={styles.swipeLabel} style={{ right: 8 }}>
          {afterLabel}
        </span>
      </div>
      <input
        className={styles.swipeRange}
        type="range"
        min={0}
        max={100}
        value={position}
        aria-label="Swipe position"
        aria-valuetext={`${position}% ${beforeLabel}`}
        onChange={(event) => setPosition(Number(event.target.value))}
      />
    </>
  );
}
