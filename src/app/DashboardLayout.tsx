import { useState, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';
import styles from './DashboardLayout.module.css';

/** Where a dock panel sits around the map. */
export type DockSlot = 'left' | 'right' | 'bottom';

/** A panel placed in a dock slot. */
export interface DockPanel {
  /** Stable id, used to remember that it was closed. */
  id: string;
  /** Name shown on the restore control after it is closed. */
  title: string;
  /** The slot it docks into. */
  slot: DockSlot;
  /** Relative width within the bottom row (default 1). */
  grow?: number;
  /** Renders the panel; `close` removes it from its slot. */
  render: (close: () => void) => ReactNode;
}

/** Props for {@link DashboardLayout}. */
export interface DashboardLayoutProps {
  /** The central map region; HUD overlays render inside it. */
  map: ReactNode;
  /** Panels for the left, right and bottom slots, in order. */
  panels: readonly DockPanel[];
  /** The closed panels' ids, when the caller keeps them (a workspace's layout, 025). */
  closed?: readonly string[];
  /** Called with the closed panels' ids, sorted, when one is closed or restored. */
  onClosedChange?: (closed: string[]) => void;
}

/**
 * The dashboard composition: a central map region with left, right and bottom dock slots.
 * Each panel can be closed; a slot with no open panels collapses so the map takes the space,
 * and closed panels are listed on a restore bar. The closed set is the layout's own unless the
 * caller keeps it (`closed`, `onClosedChange`). Every panel has its own error boundary.
 */
export function DashboardLayout({
  map,
  panels,
  closed: kept,
  onClosedChange,
}: DashboardLayoutProps) {
  const [own, setOwn] = useState<ReadonlySet<string>>(new Set());
  const closed: ReadonlySet<string> = kept ? new Set(kept) : own;
  const change = (next: Set<string>) => {
    if (kept) onClosedChange?.([...next].sort());
    else setOwn(next);
  };
  const open = (slot: DockSlot) => panels.filter((p) => p.slot === slot && !closed.has(p.id));
  const close = (id: string) => change(new Set(closed).add(id));
  const restore = (id: string) => {
    const next = new Set(closed);
    next.delete(id);
    change(next);
  };

  const left = open('left');
  const right = open('right');
  const bottom = open('bottom');
  const closedPanels = panels.filter((p) => closed.has(p.id));

  const renderPanel = (panel: DockPanel) => (
    <ErrorBoundary key={panel.id} label={panel.title}>
      {panel.render(() => close(panel.id))}
    </ErrorBoundary>
  );

  const classes = [
    styles.layout,
    left.length === 0 && styles.noLeft,
    right.length === 0 && styles.noRight,
    bottom.length === 0 && styles.noBottom,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      {left.length > 0 && (
        <div className={styles.left} data-slot="left">
          {left.map(renderPanel)}
        </div>
      )}
      <div className={styles.map} data-slot="map">
        <ErrorBoundary label="Map">{map}</ErrorBoundary>
        {closedPanels.length > 0 && (
          <div className={styles.restore} aria-label="Closed panels">
            {closedPanels.map((panel) => (
              <button key={panel.id} type="button" onClick={() => restore(panel.id)}>
                <RotateCcw size={12} aria-hidden="true" /> {panel.title}
              </button>
            ))}
          </div>
        )}
      </div>
      {right.length > 0 && (
        <div className={styles.right} data-slot="right">
          {right.map(renderPanel)}
        </div>
      )}
      {bottom.length > 0 && (
        <div className={styles.bottom} data-slot="bottom">
          {bottom.map((panel) => (
            <div key={panel.id} className={styles.bottomCell} style={{ flexGrow: panel.grow ?? 1 }}>
              {renderPanel(panel)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
