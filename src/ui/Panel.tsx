import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { IconButton } from './Button';
import styles from './Panel.module.css';

/** Props for {@link Panel}. */
export interface PanelProps {
  /** Heading text; also the panel's accessible name. */
  title: string;
  /** `chip` (default) shows the title in a filled chip; `plain` is muted uppercase text. */
  titleStyle?: 'chip' | 'plain';
  /** Content placed in the header after the title (tabs, a filter). */
  header?: ReactNode;
  /** Extra header buttons, before the close button. */
  actions?: ReactNode;
  /** When given, a close button calls it; the dock decides what closing means. */
  onClose?: () => void;
  /** Shows a collapse toggle that hides the body. */
  collapsible?: boolean;
  /** Extra class for layout. */
  className?: string;
  /** Panel body. */
  children: ReactNode;
}

/**
 * The dashboard's panel chrome: a header with a title chip, optional header content, actions,
 * collapse and close, over a scrolling body. Panels are placed in layout dock slots; `onClose`
 * hands closing back to the dock.
 */
export function Panel({
  title,
  titleStyle = 'chip',
  header,
  actions,
  onClose,
  collapsible,
  className,
  children,
}: PanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const classes = [styles.panel, collapsed && styles.collapsed, className]
    .filter(Boolean)
    .join(' ');
  return (
    <section className={classes} aria-label={title}>
      <header className={styles.header}>
        {collapsible && (
          <IconButton
            label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
            icon={collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            onClick={() => setCollapsed((value) => !value)}
          />
        )}
        <h2 className={titleStyle === 'chip' ? styles.title : styles.plainTitle}>{title}</h2>
        {header && <div className={styles.headerContent}>{header}</div>}
        <div className={styles.actions}>
          {actions}
          {onClose && (
            <IconButton label={`Close ${title}`} icon={<X size={14} />} onClick={onClose} />
          )}
        </div>
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
