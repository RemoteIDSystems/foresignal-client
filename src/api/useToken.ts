import { createContext, useContext, useSyncExternalStore } from 'react';
import type { TokenStore } from './auth';

/** The session's token store, for the screens that skip token-only reads without a token. */
export const TokenStoreContext = createContext<TokenStore | undefined>(undefined);

const NO_STORE = () => () => {};
const UNKNOWN = () => undefined;

/**
 * The current bearer token, re-rendering when it changes: `null` with none set, and `undefined`
 * outside the app shell (in a panel's own tests), where it cannot tell, so a token-only read is
 * still asked for.
 */
export function useToken(): string | null | undefined {
  const tokens = useContext(TokenStoreContext);
  return useSyncExternalStore<string | null | undefined>(
    tokens?.subscribe ?? NO_STORE,
    tokens?.get ?? UNKNOWN,
  );
}
