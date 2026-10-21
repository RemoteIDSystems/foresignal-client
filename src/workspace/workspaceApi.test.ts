import { json, standInApi } from '../intel/testing/standIn';
import {
  CLIENT_ID,
  createContextLink,
  createWorkspace,
  getWorkspace,
  getWorkspaceContextLink,
  listWorkspaces,
  patchWorkspaceContext,
  putWorkspaceLayout,
  shareWorkspace,
} from './workspaceApi';
import { workspace, WORKSPACE_ID } from './testing/workspaceFixtures';

const base = `/v1/workspaces/${WORKSPACE_ID}`;
const link = { version: 1, workspaceId: null, payload: 'e30', fragment: '#fs=e30', bytes: 2 };

describe('the workspace reads and writes', () => {
  it('lists, reads and creates workspaces', async () => {
    const { api, asked, bodies } = standInApi({
      'GET /v1/workspaces': () => json({ items: [workspace], nextCursor: null }),
      [`GET ${base}`]: () => json(workspace),
      'POST /v1/workspaces': () => json(workspace, 201),
    });
    expect(await listWorkspaces(api)).toEqual([workspace]);
    expect(await getWorkspace(api, WORKSPACE_ID)).toEqual(workspace);
    await createWorkspace(api, 'Geysers swarm', { layers: ['earthquake'] }, '01JINV');
    expect(asked).toEqual(['GET /v1/workspaces?limit=200', `GET ${base}`, 'POST /v1/workspaces']);
    expect(bodies[2]).toEqual({
      name: 'Geysers swarm',
      context: { layers: ['earthquake'] },
      private: false,
      investigationId: '01JINV',
    });
  });

  it('patches the context as a merge patch, on the version it last saw, naming this client', async () => {
    const seen: Record<string, string | null> = {};
    const { api, bodies } = standInApi({
      [`PATCH ${base}/context`]: (request) => {
        seen.ifMatch = request.headers.get('If-Match');
        seen.client = request.headers.get('Foresignal-Client-Id');
        seen.type = request.headers.get('Content-Type');
        return json({ workspaceId: WORKSPACE_ID, contextVersion: 4, context: {} });
      },
    });
    const state = await patchWorkspaceContext(api, WORKSPACE_ID, 3, { focusRef: null });
    expect(state.contextVersion).toBe(4);
    expect(bodies[0]).toEqual({ focusRef: null });
    expect(seen).toEqual({
      ifMatch: '3',
      client: CLIENT_ID,
      type: expect.stringContaining('application/merge-patch+json'),
    });
  });

  it('stores the layout, encodes links, and shares', async () => {
    const { api, asked, bodies } = standInApi({
      [`PUT ${base}/layout`]: () => json(workspace),
      'POST /v1/context-links': () => json(link),
      [`GET ${base}/context-link`]: () => json(link),
      [`POST ${base}/share`]: () =>
        json(
          {
            id: '01JSHARE',
            keyPrefix: 'fss_abcd',
            targetType: 'workspace',
            targetRef: `workspace:${WORKSPACE_ID}`,
            expiresAt: '2026-10-27T00:00:00Z',
            uses: 0,
            status: 'active',
            createdAt: '2026-10-20T00:00:00Z',
            key: 'fss_secret',
            url: 'https://fs.test/v1/k/fss_secret',
          },
          201,
        ),
    });
    await putWorkspaceLayout(api, WORKSPACE_ID, { v: 1, closedPanels: [] });
    expect(await createContextLink(api, { layers: [] }, WORKSPACE_ID)).toEqual(link);
    expect(await getWorkspaceContextLink(api, WORKSPACE_ID)).toEqual(link);
    const share = await shareWorkspace(api, WORKSPACE_ID);
    expect(share.url).toBe('https://fs.test/v1/k/fss_secret');
    expect(asked).toEqual([
      `PUT ${base}/layout`,
      'POST /v1/context-links',
      `GET ${base}/context-link`,
      `POST ${base}/share`,
    ]);
    expect(bodies[0]).toEqual({ v: 1, closedPanels: [] });
    expect(bodies[1]).toEqual({ context: { layers: [] }, workspaceId: WORKSPACE_ID });
    expect(bodies[3]).toEqual({});
  });
});
