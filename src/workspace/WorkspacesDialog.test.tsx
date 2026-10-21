import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { json, standInApi, type Answer } from '../intel/testing/standIn';
import { createStore, INITIAL_STATE, type AppState } from '../state/store';
import { quakeDossier, workspace, WORKSPACE_ID } from './testing/workspaceFixtures';
import { WorkspacesDialog } from './WorkspacesDialog';
import { WorkspaceSync } from './WorkspaceSync';

const base = `/v1/workspaces/${WORKSPACE_ID}`;
const other = { ...workspace, id: '01JA8Q00000000000000000W02', name: 'Coastal storm' };

/** The dialog, open, over a stand-in backend. */
function renderDialog(answers: Record<string, Answer> = {}) {
  const stand = standInApi({
    'GET /v1/workspaces': () => json({ items: [workspace, other], nextCursor: null }),
    [`GET ${base}`]: () => json(workspace),
    [`GET /v1/objects/${encodeURIComponent('record:usgs-earthquakes/nc1')}/dossier`]: () =>
      json(quakeDossier),
    ...answers,
  });
  const store = createStore<AppState>({ ...INITIAL_STATE, workspacesOpen: true });
  const sync = new WorkspaceSync(stand.api, store, { debounceMs: 0 });
  render(<WorkspacesDialog sync={sync} store={store} />);
  return { ...stand, store, sync };
}

const dialog = () => screen.getByRole('dialog', { name: 'Workspaces' });

describe('the Workspaces dialog', () => {
  it('lists the caller’s workspaces and opens one', async () => {
    const { store } = renderDialog();
    const list = await screen.findByRole('region', { name: 'Your workspaces' });
    expect(await within(list).findByText('Geysers swarm')).toBeInTheDocument();
    expect(within(list).getByText('Coastal storm')).toBeInTheDocument();
    expect(within(dialog()).getByText(/No workspace is open/)).toBeInTheDocument();

    const row = within(list).getByText('Geysers swarm').closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Open' }));
    expect(await within(dialog()).findByText('Workspace Geysers swarm open.')).toBeInTheDocument();
    expect(store.get('workspace')?.id).toBe(WORKSPACE_ID);
    expect(within(row).getByText('open')).toBeInTheDocument();
    expect(within(dialog()).getByText('context version 3')).toBeInTheDocument();
  });

  it('creates a workspace from this view, and lists it', async () => {
    const { asked, bodies, store } = renderDialog({
      'POST /v1/workspaces': () => json({ ...workspace, name: 'Fires', contextVersion: 1 }, 201),
    });
    await screen.findByText('Geysers swarm');
    await userEvent.type(screen.getByRole('textbox', { name: 'New workspace name' }), 'Fires');
    await userEvent.click(screen.getByRole('button', { name: 'Create from this view' }));
    expect(await screen.findByText('Workspace Fires created and open.')).toBeInTheDocument();
    expect(bodies[asked.indexOf('POST /v1/workspaces')]).toMatchObject({ name: 'Fires' });
    expect(store.get('workspace')?.name).toBe('Fires');
    expect(asked.filter((line) => line.startsWith('GET /v1/workspaces?'))).toHaveLength(2);
  });

  it('copies a deep link to what the app shows, with or without a workspace', async () => {
    const { asked } = renderDialog({
      'POST /v1/context-links': () =>
        json({ version: 1, workspaceId: null, payload: 'e30', fragment: '#fs=e30', bytes: 2 }),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    const link = await screen.findByRole('textbox', { name: 'Link' });
    expect((link as HTMLInputElement).value).toMatch(/#fs=e30$/);
    expect(asked).toContain('POST /v1/context-links');
  });

  it('shares the open workspace read-only, and leaves it', async () => {
    const { store, sync } = renderDialog({
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
          },
          201,
        ),
    });
    await sync.open(WORKSPACE_ID);
    await userEvent.click(await screen.findByRole('button', { name: 'Share read-only' }));
    expect(
      await screen.findByText('Read-only link fss_abcd… made; it expires 2026-10-27 00:00Z.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(store.get('workspace')).toBeUndefined();
    expect(screen.getByText('Left the workspace.')).toBeInTheDocument();
  });

  it('offers the workspace a deep link came from', async () => {
    const stand = standInApi({
      'GET /v1/workspaces': () => json({ items: [], nextCursor: null }),
      [`GET ${base}`]: () => json(workspace),
    });
    const store = createStore<AppState>({ ...INITIAL_STATE, workspacesOpen: true });
    const sync = new WorkspaceSync(stand.api, store);
    sync.linkedWorkspaceId = WORKSPACE_ID;
    render(<WorkspacesDialog sync={sync} store={store} />);
    expect(await screen.findByText('No workspaces yet.')).toBeInTheDocument();
    const linked = screen.getByRole('region', { name: 'Linked workspace' });
    await userEvent.click(within(linked).getByRole('button', { name: 'Open it' }));
    expect(await screen.findByText('Workspace Geysers swarm open.')).toBeInTheDocument();
  });

  it('asks for a token when workspaces cannot be listed', async () => {
    renderDialog({
      'GET /v1/workspaces': () =>
        json({ title: 'Unauthorized', status: 401, detail: 'This operation needs a token.' }, 401),
    });
    expect(await screen.findByText(/Add an access token in Settings\./)).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const { store } = renderDialog();
    await userEvent.keyboard('{Escape}');
    expect(store.get('workspacesOpen')).toBe(false);
  });
});
