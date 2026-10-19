import type { Key, ReactNode } from 'react';
import styles from './List.module.css';

/** Props for {@link List}. */
export interface ListProps<T> {
  /** The rows. */
  items: readonly T[];
  /** Stable key per row. */
  getKey: (item: T) => Key;
  /** Renders one row's content. */
  renderItem: (item: T) => ReactNode;
  /** Makes rows hoverable and calls this on click. */
  onSelect?: (item: T) => void;
  /** Tighter rows for timelines. */
  dense?: boolean;
  /** Accessible name of the list. */
  label?: string;
}

/** A divided list of rows in the panel style. */
export function List<T>({ items, getKey, renderItem, onSelect, dense, label }: ListProps<T>) {
  return (
    <ul
      className={[styles.list, dense && styles.dense].filter(Boolean).join(' ')}
      aria-label={label}
    >
      {items.map((item) => (
        <li
          key={getKey(item)}
          className={[styles.item, onSelect && styles.interactive].filter(Boolean).join(' ')}
          onClick={onSelect ? () => onSelect(item) : undefined}
        >
          {renderItem(item)}
        </li>
      ))}
    </ul>
  );
}
