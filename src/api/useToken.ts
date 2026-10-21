import { useSyncExternalStore } from 'react';
import type { TokenStore } from './auth';

const NO_STORE = () => () => {};
const UNKNOWN = () => undefined;

/**
 * The current bearer token, re-rendering when it changes: `null` with none set, and `undefined`
 * when no store is given (the caller cannot tell, so it reads as though a token might be set).
 */
export function useToken(tokens: TokenStore | undefined): string | null | undefined {
  return useSyncExternalStore<string | null | undefined>(
    tokens?.subscribe ?? NO_STORE,
    tokens?.get ?? UNKNOWN,
  );
}
