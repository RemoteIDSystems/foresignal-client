import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TokenStoreContext } from '../api/useToken';
import { json, standInApi, type Answer } from '../intel/testing/standIn';
import { AnnotationsPanel } from './AnnotationsPanel';
import {
  ANNOTATE_ACTION,
  me,
  note,
  NOTED_REF,
  NOTES,
  OTHER_ID,
} from './testing/annotationFixtures';

const notesPath = `/v1/objects/${encodeURIComponent(NOTED_REF)}/annotations`;

/** The panel over a stand-in backend, with the caller at a scope and the envelope's actions. */
function renderPanel({
  scope = 'read',
  actions = [ANNOTATE_ACTION],
  answers = {},
}: {
  scope?: 'read' | 'agent' | 'admin';
  actions?: (typeof ANNOTATE_ACTION)[];
  answers?: Record<string, Answer>;
} = {}) {
  const stand = standInApi({
    [`GET ${notesPath}`]: () => json(NOTES),
    'GET /v1/me': () => json(me(scope)),
    [`GET /v1/principals/${OTHER_ID}`]: () =>
      json({ id: OTHER_ID, handle: 'sam', displayName: 'Sam Okafor' }),
    ...answers,
  });
  render(<AnnotationsPanel api={stand.api} objectRef={NOTED_REF} actions={actions} />);
  return stand;
}

const list = () => screen.findByTestId('annotations');
const row = (text: string) => screen.getByText(text).closest('li')!;

describe('the Analysis Notes panel', () => {
  it('lists the notes the caller can see, with authors’ initials and times, newest first', async () => {
    renderPanel();
    const notes = await list();
    expect(screen.getByRole('heading', { name: 'Analysis Notes' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All Notes (3)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const items = within(notes).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('p')?.textContent)).toEqual([
      'USGS revised the magnitude.',
      'Swarm consistent with geothermal injection.',
      'Check the plant schedule.',
    ]);
    expect(await within(items[0]!).findByText('Sam Okafor')).toBeInTheDocument();
    expect(within(items[0]!).getByText('SO')).toBeInTheDocument();
    expect(within(items[0]!).getByText('2026-10-19 08:30Z')).toBeInTheDocument();
    expect(await within(items[1]!).findByText('Dana Reyes')).toBeInTheDocument();
    expect(within(items[2]!).getByText('private')).toBeInTheDocument();
    expect(screen.queryByText('Withdrawn.')).not.toBeInTheDocument();
  });

  it('filters to My Notes and Shared', async () => {
    renderPanel();
    await list();
    await screen.findAllByText('Dana Reyes');
    await userEvent.click(screen.getByRole('tab', { name: 'My Notes (2)' }));
    expect(screen.queryByText('USGS revised the magnitude.')).not.toBeInTheDocument();
    expect(screen.getByText('Check the plant schedule.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Shared (2)' }));
    expect(screen.getByText('USGS revised the magnitude.')).toBeInTheDocument();
    expect(screen.queryByText('Check the plant schedule.')).not.toBeInTheDocument();
  });

  it('adds a note, which appears at the top', async () => {
    const added = note('01JA8Q00000000000000000N09', {
      body: 'Aftershock expected.',
      createdAt: '2026-10-20T10:00:00Z',
    });
    const { asked, bodies } = renderPanel({
      answers: { [`POST ${notesPath}`]: () => json(added, 201) },
    });
    await list();
    await userEvent.click(screen.getByRole('button', { name: 'Add Note' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'New note' }), 'Aftershock expected.');
    await userEvent.click(screen.getByRole('button', { name: 'Save note' }));
    const first = (await screen.findByText('Aftershock expected.')).closest('li')!;
    expect(within(await list()).getAllByRole('listitem')[0]).toBe(first);
    expect(bodies[asked.indexOf(`POST ${notesPath}`)]).toEqual({
      kind: 'note',
      body: 'Aftershock expected.',
      private: false,
      applyStatus: false,
    });
    expect(screen.queryByRole('textbox', { name: 'New note' })).not.toBeInTheDocument();
  });

  it('edits and deletes the caller’s own notes only', async () => {
    const own = NOTES[0]!;
    const { asked, bodies } = renderPanel({
      answers: {
        [`PATCH /v1/annotations/${own.id}`]: () =>
          json({ ...own, body: 'Swarm ended.', editedAt: '2026-10-20T00:00:00Z' }),
        [`DELETE /v1/annotations/${own.id}`]: () => new Response(null, { status: 204 }),
      },
    });
    await list();
    await screen.findAllByText('Dana Reyes');
    expect(
      within(row('USGS revised the magnitude.')).queryByRole('button', { name: 'Edit note' }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(row('Swarm consistent with geothermal injection.')).getByRole('button', {
        name: 'Edit note',
      }),
    );
    const box = screen.getByRole('textbox', { name: 'Edit note' });
    await userEvent.clear(box);
    await userEvent.type(box, 'Swarm ended.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Swarm ended.')).toBeInTheDocument();
    expect(within(row('Swarm ended.')).getByText('edited')).toBeInTheDocument();
    expect(bodies[asked.indexOf(`PATCH /v1/annotations/${own.id}`)]).toEqual({
      body: 'Swarm ended.',
    });

    await userEvent.click(within(row('Swarm ended.')).getByRole('button', { name: 'Delete note' }));
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Confirm delete' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await vi.waitFor(() => expect(screen.queryByText('Swarm ended.')).not.toBeInTheDocument());
    expect(asked).toContain(`DELETE /v1/annotations/${own.id}`);
  });

  it('offers no writes the envelope does not, and verdicts only with agent scope', async () => {
    renderPanel({ actions: [] });
    await list();
    expect(screen.queryByRole('button', { name: 'Add Note' })).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Verdict' })).not.toBeInTheDocument();
  });

  it('records a verdict with agent scope, in the backend’s word', async () => {
    const verdict = note('01JA8Q00000000000000000N10', {
      kind: 'verdict',
      verdict: 'needs-review',
      body: null,
      createdAt: '2026-10-20T11:00:00Z',
    });
    const { asked, bodies } = renderPanel({
      scope: 'agent',
      answers: { [`POST ${notesPath}`]: () => json(verdict, 201) },
    });
    await list();
    const form = await screen.findByRole('form', { name: 'Verdict' });
    await userEvent.selectOptions(within(form).getByRole('combobox'), 'needs-review');
    await userEvent.click(within(form).getByRole('button', { name: 'Record verdict' }));
    expect(await screen.findByText('needs-review', { selector: 'span' })).toBeInTheDocument();
    expect(bodies[asked.indexOf(`POST ${notesPath}`)]).toMatchObject({
      kind: 'verdict',
      verdict: 'needs-review',
    });
  });

  it('asks for a token when notes cannot be read', async () => {
    renderPanel({
      answers: {
        [`GET ${notesPath}`]: () =>
          json(
            { title: 'Unauthorized', status: 401, detail: 'This operation needs a token.' },
            401,
          ),
      },
    });
    expect(
      await screen.findByText('Notes need an access token. Add one in Settings.'),
    ).toBeInTheDocument();
  });

  it('does not read the notes or the caller without a token, and asks for one', async () => {
    const { api, asked } = standInApi({});
    const tokens = { get: () => null, set() {}, clear() {}, subscribe: () => () => {} };
    render(
      <TokenStoreContext.Provider value={tokens}>
        <AnnotationsPanel api={api} objectRef={NOTED_REF} actions={[ANNOTATE_ACTION]} />
      </TokenStoreContext.Provider>,
    );
    expect(
      await screen.findByText('Notes need an access token. Add one in Settings.'),
    ).toBeInTheDocument();
    expect(asked).toEqual([]);
  });

  it('says why a note was not saved, and keeps the form open', async () => {
    renderPanel({
      answers: {
        [`POST ${notesPath}`]: () =>
          json({ title: 'Forbidden', status: 403, detail: 'Notes are closed here.' }, 403),
      },
    });
    await list();
    await userEvent.click(screen.getByRole('button', { name: 'Add Note' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'New note' }), 'Hello.');
    await userEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Notes are closed here.');
    expect(screen.getByRole('textbox', { name: 'New note' })).toBeInTheDocument();
  });
});
