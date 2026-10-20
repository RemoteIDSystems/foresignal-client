// @vitest-environment node
import { createForesignalClient } from '../api/client';
import { askStream } from './askApi';

/** A client whose backend answers every request with `answer`, recording what it was sent. */
function clientAnswering(answer: () => Response) {
  const sent: Request[] = [];
  const api = createForesignalClient({
    baseUrl: 'http://api.test',
    retry: false,
    getToken: () => 'fsr_test',
    fetch: async (request) => {
      sent.push(request);
      return answer();
    },
  });
  return { api, sent };
}

/** An event stream delivered in the given chunks. */
const stream = (...chunks: string[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );

const citation = { id: 'usgs-earthquakes:nc1', seq: 3, title: 'M 2.5', type: 'record' };
const done = {
  threadId: '6f1c4a73-0000-4000-8000-000000000001',
  answer: 'One quake [usgs-earthquakes:nc1@3].',
  citations: [citation],
  proposedActions: [],
};

describe('askStream', () => {
  it('streams progress, text, citations and warnings, and settles with the verified answer', async () => {
    const { api, sent } = clientAnswering(() =>
      stream(
        'event: progress\ndata: {"tool":"search_records","status":"calling"}\n\n',
        ': heartbeat\n\nevent: delta\ndata: {"text":"One "}\n\nevent: del',
        'ta\ndata: {"text":"quake"}\n\n',
        `event: citation\ndata: ${JSON.stringify(citation)}\n\n`,
        'event: warning\ndata: {"message":"One claim is uncited."}\n\n',
        `event: done\ndata: ${JSON.stringify(done)}\n\n`,
      ),
    );
    const seen: string[] = [];
    const answer = await askStream(
      api,
      { question: 'What shook today?' },
      {
        onProgress: (progress) => seen.push(`progress ${progress.tool}`),
        onDelta: (text) => seen.push(`delta ${text}`),
        onCitation: (cited) => seen.push(`citation ${cited.id}`),
        onWarning: (message) => seen.push(`warning ${message}`),
      },
    );
    expect(seen).toEqual([
      'progress search_records',
      'delta One ',
      'delta quake',
      'citation usgs-earthquakes:nc1',
      'warning One claim is uncited.',
    ]);
    expect(answer).toEqual(done);
    expect(new URL(sent[0]!.url).pathname).toBe('/v1/ask/stream');
    expect(sent[0]!.headers.get('Accept')).toBe('text/event-stream');
    expect(sent[0]!.headers.get('Authorization')).toBe('Bearer fsr_test');
    expect(await sent[0]!.json()).toEqual({ question: 'What shook today?', allowActions: false });
  });

  it('rejects with the problem when no language model is assigned', async () => {
    const { api } = clientAnswering(
      () =>
        new Response(
          JSON.stringify({
            type: 'https://foresignal.ai/problems/llm-not-configured',
            title: 'Conflict',
            status: 409,
            code: 'LLM_NOT_CONFIGURED',
            detail: 'No chat provider is assigned.',
          }),
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        ),
    );
    await expect(askStream(api, { question: 'q' }, {})).rejects.toMatchObject({
      status: 409,
      code: 'LLM_NOT_CONFIGURED',
    });
  });

  it('rejects with an error event’s problem, and when the stream ends without an answer', async () => {
    const { api } = clientAnswering(() =>
      stream(
        'event: error\ndata: {"title":"Too Many Requests","status":429,"code":"LLM_BUDGET_EXCEEDED"}\n\n',
      ),
    );
    await expect(askStream(api, { question: 'q' }, {})).rejects.toMatchObject({
      status: 429,
      code: 'LLM_BUDGET_EXCEEDED',
    });
    const cut = clientAnswering(() => stream('event: delta\ndata: {"text":"half"}\n\n'));
    await expect(askStream(cut.api, { question: 'q' }, {})).rejects.toThrow(
      'The answer stream ended before the answer was complete.',
    );
  });
});
