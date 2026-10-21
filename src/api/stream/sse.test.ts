import { fetchSseTransport, openStreams, SseParser, type SseEvent, type SseFailure } from './sse';

function parse(chunks: string[]): SseEvent[] {
  const events: SseEvent[] = [];
  const parser = new SseParser((event) => events.push(event));
  for (const chunk of chunks) parser.push(chunk);
  return events;
}

describe('SseParser', () => {
  it('reads events as the backend writes them (no space after the colon)', () => {
    const events = parse([
      ':open\n\nevent:hello\ndata:{"streamId":"x"}\n\nid:c=1001\nevent:change\ndata:{"seq":1001}\n\n',
    ]);
    expect(events).toEqual([
      { event: 'hello', data: '{"streamId":"x"}', id: undefined },
      { event: 'change', data: '{"seq":1001}', id: 'c=1001' },
    ]);
  });

  it('joins data lines, strips one leading space, and names an unnamed event message', () => {
    expect(parse(['data: a\ndata:  b\n\n'])).toEqual([
      { event: 'message', data: 'a\n b', id: undefined },
    ]);
  });

  it('reads lines split across chunks, with CR, LF or CRLF endings', () => {
    expect(
      parse(['event:hea', 'rtbeat\r', '\ndata:{}\r', '\r', 'event:x\rdata:1\r\n\r\n']),
    ).toEqual([
      { event: 'heartbeat', data: '{}', id: undefined },
      { event: 'x', data: '1', id: undefined },
    ]);
  });

  it('ignores comments, unknown fields and events without data', () => {
    expect(parse([': ping\nretry:5\nevent:empty\n\nfoo:bar\ndata:ok\n\n'])).toEqual([
      { event: 'message', data: 'ok', id: undefined },
    ]);
  });
});

/** A response whose body is written by the test, one chunk at a time. */
function streamingResponse(headers: Record<string, string> = {}) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const encoder = new TextEncoder();
  return {
    response: new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', ...headers },
    }),
    write: (text: string) => controller.enqueue(encoder.encode(text)),
    end: () => controller.close(),
  };
}

/** Lets pending promise callbacks and stream reads run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('fetchSseTransport', () => {
  it('sends Accept and the given headers, and reads events until the server closes', async () => {
    const stream = streamingResponse();
    let init: RequestInit | undefined;
    const transport = fetchSseTransport((_, given) => {
      init = given;
      return Promise.resolve(stream.response);
    });
    const seen: string[] = [];
    let closed: SseFailure | undefined;
    transport(
      { url: '/v1/events/stream', headers: { 'Last-Event-ID': 'c=5' } },
      {
        onOpen: () => seen.push('open'),
        onActivity: () => seen.push('activity'),
        onEvent: (event) => seen.push(`${event.event}:${event.data}`),
        onClose: (failure) => {
          closed = failure;
        },
      },
    );
    await settle();
    stream.write('event:hello\ndata:{}\n\n');
    await settle();
    stream.write(':\n');
    await settle();
    stream.end();
    await settle();
    expect(new Headers(init?.headers).get('Accept')).toBe('text/event-stream');
    expect(new Headers(init?.headers).get('Last-Event-ID')).toBe('c=5');
    expect(seen).toEqual(['open', 'activity', 'hello:{}', 'activity']);
    expect(closed).toEqual({ status: 200 });
  });

  it('reports a refused stream with its status, problem body and Retry-After', async () => {
    const transport = fetchSseTransport(() =>
      Promise.resolve(
        Response.json(
          { code: 'STREAM_LIMIT', status: 429, title: 'Too Many Requests' },
          { status: 429, headers: { 'Retry-After': '3' } },
        ),
      ),
    );
    const failure = await new Promise<SseFailure>((resolve) =>
      transport(
        { url: '/v1/events/stream', headers: {} },
        { onOpen() {}, onActivity() {}, onEvent() {}, onClose: resolve },
      ),
    );
    expect(failure).toMatchObject({
      status: 429,
      retryAfterMs: 3_000,
      body: { code: 'STREAM_LIMIT' },
    });
  });

  it('says nothing more once the caller has closed it', async () => {
    const stream = streamingResponse();
    const onClose = vi.fn();
    const onEvent = vi.fn();
    const close = fetchSseTransport(() => Promise.resolve(stream.response))(
      { url: '/x', headers: {} },
      { onOpen() {}, onActivity() {}, onEvent, onClose },
    );
    await settle();
    close();
    await settle();
    expect(onClose).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('reports a network failure', async () => {
    const failure = await new Promise<SseFailure>((resolve) =>
      fetchSseTransport(() => Promise.reject(new TypeError('offline')))(
        { url: '/x', headers: {} },
        { onOpen() {}, onActivity() {}, onEvent() {}, onClose: resolve },
      ),
    );
    expect(failure.cause).toBeInstanceOf(TypeError);
  });
});

describe('the open stream tally (035)', () => {
  it('counts each connection by path while it is open, and once closed, not again', async () => {
    const first = streamingResponse();
    const second = streamingResponse();
    const answers = [first.response, second.response];
    const transport = fetchSseTransport(() => Promise.resolve(answers.shift()!));
    const handlers = { onOpen() {}, onActivity() {}, onEvent() {}, onClose() {} };
    const before = openStreams()['/v1/events/stream'] ?? 0;
    const closeFirst = transport(
      { url: 'http://api.test/v1/events/stream?x=1', headers: {} },
      handlers,
    );
    transport({ url: '/v1/alerts/stream', headers: {} }, handlers);
    await settle();
    expect(openStreams()['/v1/events/stream']).toBe(before + 1);
    expect(openStreams()['/v1/alerts/stream']).toBe(1);
    closeFirst();
    closeFirst();
    expect(openStreams()['/v1/events/stream'] ?? 0).toBe(before);
    second.end();
    await settle();
    expect(openStreams()['/v1/alerts/stream']).toBeUndefined();
  });
});
