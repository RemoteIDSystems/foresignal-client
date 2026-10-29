import { createContext, useContext, useSyncExternalStore } from 'react';
import type { Me, PrincipalStore } from './me';

/** The session's principal store, provided by the app shell; absent in a panel's own tests. */
export const PrincipalStoreContext = createContext<PrincipalStore | undefined>(undefined);

const NO_STORE = () => () => {};
const ANONYMOUS = () => null;

/**
 * The signed-in principal, re-rendering when it changes: `null` when anonymous, and `null` outside
 * the app shell (no provider). Mirrors {@link useToken}.
 */
export function useMe(): Me | null {
  const store = useContext(PrincipalStoreContext);
  return useSyncExternalStore<Me | null>(store?.subscribe ?? NO_STORE, store?.get ?? ANONYMOUS);
}

/**
 * The signed-in principal's effective permission keys, or `[]` when anonymous or when the session
 * carries none (a non-login token). RBAC gating (R2-006) reads this.
 */
export function usePermissions(): string[] {
  return useMe()?.permissions ?? [];
}
