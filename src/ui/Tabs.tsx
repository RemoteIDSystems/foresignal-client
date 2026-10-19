import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import styles from './Tabs.module.css';

/** One tab in a {@link Tabs} strip. */
export interface TabItem<K extends string> {
  /** Stable key, passed to `onChange`. */
  key: K;
  /** Visible label. */
  label: ReactNode;
}

/** Props for {@link Tabs}. */
export interface TabsProps<K extends string> {
  /** The tabs, in order. */
  items: ReadonlyArray<TabItem<K>>;
  /** Key of the selected tab. */
  value: K;
  /** Called with the key of the tab the user selects. */
  onChange: (key: K) => void;
  /** Accessible name of the tab list. */
  label: string;
  /** `underline` (default), `boxed` (rail header) or `pill` (segmented toggle). */
  variant?: 'underline' | 'boxed' | 'pill';
  /** Extra class for layout. */
  className?: string;
}

/**
 * An accessible tab strip (`role="tablist"`) with arrow-key navigation. It renders only the
 * tabs; the caller renders the selected content.
 */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  label,
  variant = 'underline',
  className,
}: TabsProps<K>) {
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = items.findIndex((item) => item.key === value);
    const next = items[(index + step + items.length) % items.length];
    if (!next) return;
    onChange(next.key);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-key="${next.key}"]`)?.focus();
  };

  const classes = [styles.tabs, variant !== 'underline' && styles[variant], className]
    .filter(Boolean)
    .join(' ');
  return (
    <div ref={listRef} role="tablist" aria-label={label} className={classes} onKeyDown={onKeyDown}>
      {items.map((item) => (
        <button
          key={item.key}
          id={`${id}-${item.key}`}
          data-key={item.key}
          type="button"
          role="tab"
          aria-selected={item.key === value}
          tabIndex={item.key === value ? 0 : -1}
          className={styles.tab}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
