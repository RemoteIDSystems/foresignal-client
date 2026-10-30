import { unwrap, type ForesignalClient } from '../api/client';
import type { components } from '../api/generated/schema';

/**
 * One active sign-in session of the calling user (`listSessions`, `GET /v1/auth/sessions`): when it
 * was created and last seen, when it expires, the originating user agent and IP, and whether it is
 * the session making this request (`current`).
 */
export type Session = components['schemas']['Session'];

/** A page of {@link Session}s. */
export type SessionPage = components['schemas']['SessionPage'];

/** Lists the calling user's active sessions. */
export function listSessions(api: ForesignalClient, signal?: AbortSignal): Promise<SessionPage> {
  return unwrap(api.GET('/v1/auth/sessions', { signal }));
}

/** Revokes one session by id. */
export async function revokeSession(api: ForesignalClient, id: string): Promise<void> {
  await unwrap(api.DELETE('/v1/auth/sessions/{id}', { params: { path: { id } } }));
}

/** Revokes every session of the calling user (signs out everywhere, including this one). */
export async function revokeAllSessions(api: ForesignalClient): Promise<void> {
  await unwrap(api.DELETE('/v1/auth/sessions'));
}
