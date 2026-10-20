import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createForesignalClient } from '../../api/client';
import { AskPanel } from './AskPanel';
import { RecordLayersContext, type RecordLayersValue } from './recordLayersContext';

const THREAD = '6f1c4a73-0000-4000-8000-000000000001';
const citation = {
  id: 'usgs-earthquakes:nc1',
  seq: 3,
  title: 'M 2.5 - The Geysers',
  type: 'record',
};

/** What the stand-in backend was asked (method and path), and how it answers each. */
let asked: string[] = [];
let answers: Record<string, () => Response>;

const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status < 400 ? 'application/json' : 'application/problem+json' },
  });

const sse = (...events: [string, unknown][]) =>
  new Response(
    events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(''),
    {
      headers: { 'Content-Type': 'text/event-stream' },
    },
  );

beforeEach(() => {
  asked = [];
  answers = {
    'POST /v1/ask/stream': () =>
      sse(
        ['progress', { tool: 'search_records', status: 'calling', summary: 'Searching records…' }],
        ['delta', { text: 'One quake ' }],
        [
          'done',
          {
            threadId: THREAD,
            answer: 'One quake [usgs-earthquakes:nc1@3] shook the Geysers.',
            citations: [citation, { id: 'alert:7', title: 'Shaking alert', type: 'alert' }],
            proposedActions: [],
            warnings: ['One claim is uncited.'],
          },
        ],
      ),
    'GET /v1/ask/threads': () =>
      json({
        items: [
          {
            id: THREAD,
            title: 'What shook today?',
            updatedAt: '2026-10-20T12:00:00Z',
            messageCount: 2,
          },
        ],
      }),
    [`GET /v1/ask/threads/${THREAD}`]: () =>
      json({
        id: THREAD,
        title: 'What shook today?',
        createdAt: '2026-10-20T12:00:00Z',
        messages: [
          { role: 'user', content: 'What shook today?', createdAt: '2026-10-20T12:00:00Z' },
          {
            role: 'assistant',
            content: 'One quake [usgs-earthquakes:nc1].',
            citations: [citation],
            createdAt: '2026-10-20T12:00:05Z',
          },
        ],
      }),
    [`DELETE /v1/ask/threads/${THREAD}`]: () => new Response(null, { status: 204 }),
  };
});

/** Renders the panel with a stand-in backend; returns the refs its citations selected. */
function renderPanel() {
  const selected: string[] = [];
  const api = createForesignalClient({
    baseUrl: 'http://api.test',
    retry: false,
    fetch: async (request) => {
      const key = `${request.method} ${new URL(request.url).pathname}`;
      asked.push(key);
      const answer = answers[key];
      return answer ? answer() : json({ title: 'Not Found', status: 404 }, 404);
    },
  });
  const value = {
    catalog: { status: 'loading' },
    api,
    selectRef: async (ref: string) => {
      selected.push(ref);
    },
  } as unknown as RecordLayersValue;
  render(
    <RecordLayersContext.Provider value={value}>
      <AskPanel onClose={() => {}} />
    </RecordLayersContext.Provider>,
  );
  return selected;
}

describe('AskPanel', () => {
  it('answers a question with its citations as chips that select their objects', async () => {
    const selected = renderPanel();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Question' }),
      'What shook today?{Enter}',
    );
    const answer = await screen.findByTestId('ask-answer');
    await waitFor(() => expect(answer).toHaveAttribute('data-state', 'done'));
    expect(answer).toHaveTextContent('One quake M 2.5 - The Geysers shook the Geysers.');
    expect(answer).toHaveTextContent('Sources:Shaking alert');
    expect(answer).toHaveTextContent('One claim is uncited.');
    await userEvent.click(within(answer).getByRole('button', { name: 'M 2.5 - The Geysers' }));
    await userEvent.click(within(answer).getByRole('button', { name: 'Shaking alert' }));
    expect(selected).toEqual(['record:usgs-earthquakes/nc1', 'alert:7']);
    // A follow-up continues the thread.
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Question' }),
      'Where exactly?{Enter}',
    );
    await waitFor(() => expect(screen.getAllByTestId('ask-answer')).toHaveLength(2));
    expect(asked.filter((key) => key === 'POST /v1/ask/stream')).toHaveLength(2);
  });

  it('says plainly when no language model is assigned, and keeps the question', async () => {
    answers['POST /v1/ask/stream'] = () =>
      json({ title: 'Conflict', status: 409, code: 'LLM_NOT_CONFIGURED' }, 409);
    renderPanel();
    const box = screen.getByRole('textbox', { name: 'Question' });
    await userEvent.type(box, 'What shook today?{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No language model is assigned on this server, so Ask cannot answer.',
    );
    expect(box).toHaveValue('What shook today?');
    expect(screen.queryByTestId('ask-answer')).toBeNull();
  });

  it('lists earlier threads, opens one, and deletes one after a confirm', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Earlier questions' }));
    const threads = await screen.findByRole('list', { name: 'Earlier questions' });
    expect(await within(threads).findByText('What shook today?')).toBeInTheDocument();
    expect(threads).toHaveTextContent('2026-10-20 12:00Z · 2 messages');
    await userEvent.click(within(threads).getByRole('button', { name: /^What shook today\?2026/ }));
    expect(await screen.findByTestId('ask-answer')).toHaveTextContent(
      'One quake M 2.5 - The Geysers.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Earlier questions' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete “What shook today?”' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await waitFor(() => expect(asked).toContain(`DELETE /v1/ask/threads/${THREAD}`));
    expect(await screen.findByText('No earlier questions.')).toBeInTheDocument();
  });
});
