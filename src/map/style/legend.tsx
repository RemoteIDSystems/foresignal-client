import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, X } from 'lucide-react';
import type { ForesignalClient } from '../../api/client';
import { IconButton } from '../../ui/Button';
import {
  buildLegend,
  legendTooltip,
  zoomNotes,
  type LegendEntry,
  type LegendScope,
  type LegendVariant,
} from './legendModel';
import { loadMapIcon, type OverlayStyle } from './loadOverlayStyle';
import { representativeColor, type KindStyle } from './model';
import type { SpriteSheet } from './sprite';
import type { OverlayStyleState } from './useOverlayStyle';
import styles from './legend.module.css';

/** Props for {@link MapLegend}. */
export interface MapLegendProps {
  /** The overlay style, as {@link useOverlayStyle} reports it. */
  state: OverlayStyleState;
  /** API client, for icons the sprite lacks (`getMapIcon`). */
  api?: ForesignalClient;
  /** Closes the panel. */
  onClose: () => void;
  /**
   * The kinds on the map, from the enabled layers; the legend shows only these. Undefined shows
   * every kind the style knows.
   */
  scope?: LegendScope;
  /** What a scoped legend says when nothing is on the map. */
  emptyNote?: string;
  /** The product legends (009), shown above the record kinds. */
  products?: ReactNode;
}

/**
 * The map legend: the record kinds on the map (or, unscoped, every kind the overlay style draws),
 * one compact row each as in the Conflict mockup: its icon in the style's own color (SDF sprite icons rendered as the map renders
 * them, oversized ones scaled to match), its label, and the severity colors it uses. The sources
 * that draw it and the zoom it switches to hexagon counts are in the row's tooltip and in its
 * expanded detail. Built only from `getMapStyle` and its sprite. The product legends (009) sit
 * above the kinds, in the same panel.
 */
export function MapLegend({ state, api, onClose, scope, emptyNote, products }: MapLegendProps) {
  const [filter, setFilter] = useState('');
  const overlay = state.status === 'ready' ? state.overlay : undefined;
  const entries = useMemo(
    () => (overlay ? buildLegend(overlay.model, filter, scope) : []),
    [overlay, filter, scope],
  );

  return (
    <section className={styles.legend} aria-label="Map legend" data-testid="map-legend">
      <header className={styles.header}>
        <h2 className={styles.title}>Legend</h2>
        <IconButton label="Close legend" icon={<X size={14} />} onClick={onClose} />
      </header>
      {products}
      {state.status === 'loading' || state.status === 'idle' ? (
        <p className={styles.note}>Loading the map style…</p>
      ) : state.status === 'error' ? (
        <p className={styles.note} role="alert">
          The map style did not load.
        </p>
      ) : (
        <>
          <p className={styles.summary} data-testid="legend-summary">
            {scope
              ? scope.size === 0
                ? (emptyNote ?? 'No layers on. Turn one on in the Layers rail.')
                : kindsOnMap(buildLegend(overlay!.model, '', scope).length)
              : `${overlay!.model.kinds.length} kinds from ${overlay!.model.layers.length} layers`}
          </p>
          <input
            className={styles.filter}
            type="search"
            placeholder="Filter kinds or sources"
            aria-label="Filter the legend"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <ul className={styles.list}>
            {entries.map((entry) => (
              <LegendRow key={entry.kind} entry={entry} overlay={overlay!} api={api} />
            ))}
          </ul>
          {entries.length === 0 && filter && (
            <p className={styles.note}>No kinds match “{filter}”.</p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * One kind: a compact row (icon, label, severity colors) that expands to the looks with their
 * sources, the named severity cases and the zoom notes.
 */
function LegendRow({
  entry,
  overlay,
  api,
}: {
  entry: LegendEntry;
  overlay: OverlayStyle;
  api?: ForesignalClient;
}) {
  const [first] = entry.variants;
  if (!first) return null;
  const cases = entry.colorCases;
  return (
    <li className={styles.entry} data-kind={entry.kind}>
      <details>
        <summary className={styles.row} title={legendTooltip(entry)}>
          <KindSwatch style={first.style} sprite={overlay.sprite} api={api} />
          <span className={styles.label}>{entry.label}</span>
          {cases && (
            <span className={styles.dots} aria-label={`Color by ${cases.field}`}>
              {cases.cases.map((item) => (
                <i
                  key={item.color + item.values[0]}
                  style={{ background: item.color }}
                  title={item.values.join(', ')}
                />
              ))}
            </span>
          )}
          <ChevronRight className={styles.chevron} size={12} aria-hidden="true" />
        </summary>
        <div className={styles.detail} data-testid="legend-detail">
          {entry.variants.map((variant) => (
            <VariantLine key={variant.layerIds[0]} variant={variant} overlay={overlay} api={api} />
          ))}
          {cases && (
            <div className={styles.cases}>
              {cases.cases.map((item) => (
                <span
                  key={item.color + item.values[0]}
                  className={styles.case}
                  title={item.values.join(', ')}
                >
                  <i style={{ background: item.color }} />
                  {item.values[0]}
                </span>
              ))}
              <span className={styles.case} title="Any other value">
                <i style={{ background: cases.fallback }} />
                other
              </span>
            </div>
          )}
          {zoomNotes(entry).map((note) => (
            <div key={note} className={styles.zoom}>
              {note}
              {entry.aggBelowZoom !== undefined && entry.aggRamp && (
                <span className={styles.ramp} aria-hidden="true">
                  {entry.aggRamp.map(([count, color]) => (
                    <i key={count} style={{ background: color }} title={`${count}+`} />
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>
      </details>
    </li>
  );
}

/** One look in a row's detail: its symbol and the sources that draw it. */
function VariantLine({
  variant,
  overlay,
  api,
}: {
  variant: LegendVariant;
  overlay: OverlayStyle;
  api?: ForesignalClient;
}) {
  const text = variant.sources.join(' · ');
  return (
    <div className={styles.variant}>
      <KindSwatch style={variant.style} sprite={overlay.sprite} api={api} />
      <span className={styles.sources} title={text}>
        {text}
      </span>
    </div>
  );
}

/**
 * A kind's symbol, as the legend and the layer rail show it: its SDF icon tinted in the style's
 * color with its halo, at the sprite's normalized display size; a circle; or for kinds with no
 * point style a line or fill chip. Icons the sprite lacks come from `getMapIcon`.
 */
export function KindSwatch({
  style,
  sprite,
  api,
}: {
  style: KindStyle;
  sprite?: SpriteSheet;
  api?: ForesignalClient;
}) {
  const point = style.point;
  if (point?.type === 'icon') {
    const color = representativeColor(point.color) ?? '#ffffff';
    const url = sprite?.iconUrl(point.icon, {
      color,
      haloColor: point.haloColor,
      haloWidth: point.haloWidth,
    });
    const size = sprite?.displaySize(point.icon);
    if (url && size) {
      return (
        <span className={styles.swatch} aria-hidden="true">
          <img
            src={url}
            alt=""
            width={size.width}
            height={size.height}
            data-icon={point.icon}
            data-color={color}
          />
        </span>
      );
    }
    return <FallbackIcon name={point.icon} api={api} />;
  }
  if (point?.type === 'circle') {
    return (
      <span className={styles.swatch} aria-hidden="true">
        <span
          className={styles.circle}
          style={{
            background: representativeColor(point.color),
            opacity: point.opacity,
            borderColor: point.strokeColor,
            borderWidth: point.strokeWidth,
          }}
          data-color={representativeColor(point.color)}
        />
      </span>
    );
  }
  const color = representativeColor(
    (style.fill ?? style.line)?.color ?? { type: 'constant', color: '' },
  );
  return (
    <span className={styles.swatch} aria-hidden="true">
      <span className={styles.chip} style={{ background: color }} />
    </span>
  );
}

/** Object URLs of icons fetched with `getMapIcon`, shared by every legend on the page. */
const fallbackIcons = new Map<string, Promise<string>>();

/** An icon the sprite lacks, from the single-icon endpoint; drawn as served (not tinted). */
function FallbackIcon({ name, api }: { name: string; api?: ForesignalClient }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!api) return;
    let active = true;
    let request = fallbackIcons.get(name);
    if (!request) {
      request = loadMapIcon(api, name);
      fallbackIcons.set(name, request);
      request.catch(() => fallbackIcons.delete(name));
    }
    request.then(
      (loaded) => active && setUrl(loaded),
      () => {},
    );
    return () => {
      active = false;
    };
  }, [api, name]);
  return (
    <span className={styles.swatch} aria-hidden="true">
      {url && (
        <img className={styles.fallback} src={url} alt="" data-icon={name} data-fallback="" />
      )}
    </span>
  );
}

/** The scoped legend's summary: how many kinds the enabled layers put on the map. */
function kindsOnMap(count: number): string {
  return `${count} ${count === 1 ? 'kind' : 'kinds'} on the map`;
}
