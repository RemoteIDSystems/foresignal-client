import type { ReactNode } from 'react';
import styles from './Badge.module.css';

/** Color family of a {@link Badge}; each maps to a theme tone pair. */
export type BadgeTone =
  'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'teal' | 'violet' | 'orange';

/** Props for {@link Badge}. */
export interface BadgeProps {
  /** Color family; default `neutral`. */
  tone?: BadgeTone;
  /** `count` renders a rounded numeric pill (layer counts); default is an uppercase tag. */
  kind?: 'tag' | 'count';
  /** Uppercase the label (category tags); `false` keeps its case (Medium, 72%). Default true. */
  uppercase?: boolean;
  /** Badge content. */
  children: ReactNode;
}

/** A small tag (WEATHER, ACTIVE, Medium) or count pill, as used throughout the mockups. */
export function Badge({ tone = 'neutral', kind = 'tag', uppercase = true, children }: BadgeProps) {
  const classes = [
    styles.badge,
    styles[tone],
    kind === 'count' && styles.count,
    !uppercase && styles.keepCase,
  ]
    .filter(Boolean)
    .join(' ');
  return <span className={classes}>{children}</span>;
}
