import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import { ToastContext, type ToastApi, type ToastInput } from './toast-context';
import styles from './Toast.module.css';

interface ShownToast extends ToastInput {
  id: number;
}

/**
 * The global toast host: provides `useToast()` to the tree and renders toasts in a fixed,
 * polite live region at the bottom right.
 */
export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ShownToast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...toast, id }]);
      const duration = toast.durationMs ?? 6000;
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.region} role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`${styles.toast} ${styles[toast.tone ?? 'info']}`}>
            <div className={styles.text}>
              <div className={styles.title}>{toast.title}</div>
              {toast.detail && <div className={styles.detail}>{toast.detail}</div>}
            </div>
            <IconButton label="Dismiss" icon={<X size={14} />} onClick={() => dismiss(toast.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
