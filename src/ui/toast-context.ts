import { createContext, useContext } from 'react';

/** Severity of a toast; drives its color. */
export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

/** A toast to show. */
export interface ToastInput {
  /** Bold first line. */
  title: string;
  /** Optional detail line. */
  detail?: string;
  /** Color; default `info`. */
  tone?: ToastTone;
  /** Milliseconds before it dismisses itself; `0` keeps it until closed. Default 6000. */
  durationMs?: number;
}

/** Shows toasts in the global host. */
export interface ToastApi {
  /** Shows a toast and returns its id. */
  show(toast: ToastInput): number;
  /** Removes a toast by id. */
  dismiss(id: number): void;
}

/** The toast host's API; a no-op outside a `ToastHost`. */
export const ToastContext = createContext<ToastApi>({ show: () => -1, dismiss: () => {} });

/** Returns the global toast API. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}
