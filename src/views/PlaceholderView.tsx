import type { LucideIcon } from 'lucide-react';
import styles from './PlaceholderView.module.css';

/** Props for {@link PlaceholderView}. */
export interface PlaceholderViewProps {
  /** Screen title. */
  title: string;
  /** What the screen will show. */
  description: string;
  /** Which prompts build it, e.g. "024". */
  builtIn: string;
  /** Screen icon. */
  icon: LucideIcon;
}

/** A routed screen that is not built yet: says what it will be and which prompt builds it. */
export function PlaceholderView({ title, description, builtIn, icon: Icon }: PlaceholderViewProps) {
  return (
    <div className={styles.view}>
      <div className={styles.card}>
        <Icon size={28} strokeWidth={1.5} aria-hidden="true" />
        <h1>{title}</h1>
        <p>{description}</p>
        <p className={styles.note}>Built in prompt {builtIn}.</p>
      </div>
    </div>
  );
}
