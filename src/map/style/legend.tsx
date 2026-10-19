import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { ForesignalClient } from '../../api/client';
import { IconButton } from '../../ui/Button';
import { buildLegend, type LegendEntry, type LegendVariant } from './legendModel';
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
}

/**
 * The map legend: every record kind the overlay style draws, with its icon or symbol in the style's
 * own color (SDF sprite icons rendered as the map renders them), the sources that draw it, the
 * severity colors a kind uses, and the zoom below which a layer shows hexagon counts. Built only
 * from `getMapStyle` and its sprite; product legends join it in 009.
 */
export function MapLegend({ state, api, onClose }: MapLegendProps) {
  const [filter, setFilter] = useState('');
  const overlay = state.status === 'ready' ? state.overlay : undefined;
  const entries = useMemo(
    () => (overlay ? buildLegend(overlay.model, filter) : []),
    [overlay, filter],
  );

  return (
    <section className={styles.legend} aria-label="Map legend" data-testid="map-legend">
      <header className={styles.header}>
        <h2 className={styles.title}>Legend</h2>
        <IconButton label="Close legend" icon={<X size={14} />} onClick={onClose} />
      </header>
      {state.status === 'loading' || state.status === 'idle' ? (
        <p className={styles.note}>Loading the map style…</p>
      ) : state.status === 'error' ? (
        <p className={styles.note} role="alert">
          The map style did not load.
        </p>
      ) : (
        <>
          <p className={styles.summary} data-testid="legend-summary">
            {overlay!.model.kinds.length} kinds from {overlay!.model.layers.length} layers
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
          {entries.length === 0 && <p className={styles.note}>No kinds match “{filter}”.</p>}
        </>
      )}
    </section>
  );
}

/** One kind: its looks with their sources, its color cases and its aggregation zoom. */
function LegendRow({
  entry,
  overlay,
  api,
}: {
  entry: LegendEntry;
  overlay: OverlayStyle;
  api?: ForesignalClient;
}) {
  const [first, ...others] = entry.variants;
  if (!first) return null;
  return (
    <li className={styles.entry} data-kind={entry.kind}>
      <div className={styles.row}>
        <Swatch style={first.style} sprite={overlay.sprite} api={api} />
        <span className={styles.label}>{entry.label}</span>
      </div>
      <VariantSources variant={first} />
      {others.map((variant) => (
        <div key={variant.layerIds[0]} className={styles.variant}>
          <Swatch style={variant.style} sprite={overlay.sprite} api={api} />
          <VariantSources variant={variant} inline />
        </div>
      ))}
      {entry.colorCases && (
        <div className={styles.cases} aria-label={`Color by ${entry.colorCases.field}`}>
          {entry.colorCases.cases.map((item) => (
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
            <i style={{ background: entry.colorCases.fallback }} />
            other
          </span>
        </div>
      )}
      {(entry.aggBelowZoom !== undefined || entry.minzoom !== undefined) && (
        <div className={styles.zoom}>
          {entry.aggBelowZoom !== undefined && (
            <span>
              Hexagon counts below zoom {entry.aggBelowZoom}
              {entry.aggRamp && (
                <span className={styles.ramp} aria-hidden="true">
                  {entry.aggRamp.map(([count, color]) => (
                    <i key={count} style={{ background: color }} title={`${count}+`} />
                  ))}
                </span>
              )}
            </span>
          )}
          {entry.minzoom !== undefined && entry.aggBelowZoom === undefined && (
            <span>From zoom {entry.minzoom}</span>
          )}
        </div>
      )}
    </li>
  );
}

/** The sources that draw a look, as one truncated line with the full list in its tooltip. */
function VariantSources({ variant, inline = false }: { variant: LegendVariant; inline?: boolean }) {
  const text = variant.sources.join(' · ');
  return (
    <span className={inline ? styles.sourcesInline : styles.sources} title={text}>
      {text}
    </span>
  );
}

/**
 * A kind's symbol: its SDF icon tinted in the style's color with its halo, a circle, or for kinds
 * with no point style a line or fill chip. Icons the sprite lacks come from `getMapIcon`.
 */
function Swatch({
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
    if (url) {
      return (
        <img className={styles.swatch} src={url} alt="" data-icon={point.icon} data-color={color} />
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
  return url ? (
    <img className={styles.swatch} src={url} alt="" data-icon={name} data-fallback="" />
  ) : (
    <span className={styles.swatch} aria-hidden="true" />
  );
}
