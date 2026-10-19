import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import styles from './Modal.module.css';

/** Props for {@link Modal}. */
export interface ModalProps {
  /** Whether the modal is shown. */
  open: boolean;
  /** Dialog title; also its accessible name. */
  title: string;
  /** Called on Escape, the close button, or a click on the backdrop. */
  onClose: () => void;
  /** Dialog content. */
  children: ReactNode;
}

/**
 * A modal dialog rendered into `document.body`. Focus moves into the dialog on open and returns
 * to the previously focused element on close.
 */
export function Modal({ open, title, onClose, children }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.dialog}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <IconButton
            className={styles.close}
            label="Close"
            icon={<X size={16} />}
            onClick={onClose}
          />
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
