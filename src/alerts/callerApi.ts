import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { Me } from '../annotations/annotationApi';

/** The principal and scopes behind the current token (`getMe`), read now rather than cached. */
export function getCallerFresh(api: ForesignalClient, signal?: AbortSignal): Promise<Me> {
  return unwrap(api.GET('/v1/me', { signal }));
}
