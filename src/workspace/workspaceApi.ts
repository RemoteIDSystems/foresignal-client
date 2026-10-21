import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';

/** A shared investigation focus: versioned context plus opaque client layout (`Workspace`). */
export type Workspace = components['schemas']['Workspace'];

/** The shared, versioned context (`WorkspaceContext`, Client-Contract §5). */
export type WorkspaceContext = components['schemas']['WorkspaceContext'];

/** A workspace's context with its version (`WorkspaceContextState`). */
export type WorkspaceContextState = components['schemas']['WorkspaceContextState'];

/** A deep-link payload (`ContextLink`, Client-Contract §6). */
export type ContextLink = components['schemas']['ContextLink'];

/**
 * A share link. The OpenAPI types `shareWorkspace`'s answer as `ShareLink`, which has no key; the
 * key and URL are read when the backend sends them, as `createShareLink`'s `ShareLinkCreated` does.
 */
export type WorkspaceShare = components['schemas']['ShareLink'] & { key?: string; url?: string };

/** The JSON merge patch the context takes: each field set, or null to clear it. */
export type ContextPatch = { [K in keyof WorkspaceContext]?: WorkspaceContext[K] | null };

/** This tab's client id, sent as `Foresignal-Client-Id` so the backend can name its changes. */
export const CLIENT_ID: string =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `client-${Date.now().toString(36)}`;

/** The workspaces the caller owns or is a member of (`listWorkspaces`; a token is needed). */
export async function listWorkspaces(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<Workspace[]> {
  const page = await unwrap(
    api.GET('/v1/workspaces', { params: { query: { limit: 200 } }, signal }),
  );
  return page.items;
}

/** A workspace with its context, context version and layout (`getWorkspace`). */
export function getWorkspace(
  api: ForesignalClient,
  id: string,
  signal?: AbortSignal,
): Promise<Workspace> {
  return unwrap(
    api.GET('/v1/workspaces/{workspaceId}', { params: { path: { workspaceId: id } }, signal }),
  );
}

/** Creates a workspace owned by the caller, with a starting context (`createWorkspace`). */
export function createWorkspace(
  api: ForesignalClient,
  name: string,
  context: WorkspaceContext,
  investigationId?: string,
): Promise<Workspace> {
  return unwrap(
    api.POST('/v1/workspaces', {
      body: { name, context, private: false, ...(investigationId && { investigationId }) },
    }),
  );
}

/**
 * Changes a workspace's context by a JSON merge patch (`patchWorkspaceContext`), if its version is
 * still `version` (`If-Match`). A stale version answers 412 `WORKSPACE_CONTEXT_STALE`.
 */
export function patchWorkspaceContext(
  api: ForesignalClient,
  id: string,
  version: number,
  patch: ContextPatch,
): Promise<WorkspaceContextState> {
  return unwrap(
    api.PATCH('/v1/workspaces/{workspaceId}/context', {
      params: {
        path: { workspaceId: id },
        header: { 'If-Match': String(version), 'Foresignal-Client-Id': CLIENT_ID },
      },
      body: patch as WorkspaceContext,
      headers: { 'Content-Type': 'application/merge-patch+json' },
    }),
  );
}

/** Stores the client's opaque layout JSON on a workspace (`putWorkspaceLayout`, ≤ 64 KB). */
export function putWorkspaceLayout(
  api: ForesignalClient,
  id: string,
  layout: Record<string, unknown>,
): Promise<Workspace> {
  return unwrap(
    api.PUT('/v1/workspaces/{workspaceId}/layout', {
      params: { path: { workspaceId: id } },
      body: layout,
    }),
  );
}

/** Validates a context and encodes it as a deep link (`createContextLink`). */
export function createContextLink(
  api: ForesignalClient,
  context: WorkspaceContext,
  workspaceId?: string,
): Promise<ContextLink> {
  return unwrap(
    api.POST('/v1/context-links', { body: { context, ...(workspaceId && { workspaceId }) } }),
  );
}

/** A workspace's current context as a deep link (`getWorkspaceContextLink`). */
export function getWorkspaceContextLink(api: ForesignalClient, id: string): Promise<ContextLink> {
  return unwrap(
    api.GET('/v1/workspaces/{workspaceId}/context-link', {
      params: { path: { workspaceId: id } },
    }),
  );
}

/**
 * A read-only share link to a workspace's context (`shareWorkspace`; agent scope, and the
 * workspace's TLP must be CLEAR).
 */
export async function shareWorkspace(
  api: ForesignalClient,
  id: string,
  expiresAt?: string,
): Promise<WorkspaceShare> {
  return (await unwrap(
    api.POST('/v1/workspaces/{workspaceId}/share', {
      params: { path: { workspaceId: id } },
      body: expiresAt ? { expiresAt } : {},
    }),
  )) as WorkspaceShare;
}
