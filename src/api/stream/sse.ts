import { parseRetryAfter } from '../errors';

/** One server-sent event: its `event:` name (`message` when none), joined `data:` and `id:`. */
export interface SseEvent {
  event: string;
  data: string;
  /** The `id:` line, when the event had one. */
  id?: string;
}

/**
 * Reads the `text/event-stream` format (the WHATWG HTML "event stream interpretation") from text
 * chunks as they arrive. Lines end in LF, CR or CRLF, even split across chunks; `:` lines are
 * comments; a blank line dispatches the event gathered so far. An event with no `data:` is not
 * dispatched, as a browser's `EventSource` would not.
 */
export class SseParser {
  private buffer = '';
  private event = '';
  private data: string[] = [];
  private id?: string;
  /** Whether the last chunk ended in CR, so an LF starting the next one ends no second line. */
  private afterCr = false;

  /** @param onEvent Called with each complete event, in order. */
  constructor(private readonly onEvent: (event: SseEvent) => void) {}

  /** Reads a chunk of the stream; complete lines are interpreted now, the rest is kept. */
  push(chunk: string): void {
    let text = chunk;
    if (this.afterCr && text.startsWith('\n')) text = text.slice(1);
    this.afterCr = false;
    this.buffer += text;
    let start = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const character = this.buffer[i];
      if (character !== '\n' && character !== '\r') continue;
      this.line(this.buffer.slice(start, i));
      if (character === '\r') {
        if (i + 1 === this.buffer.length) this.afterCr = true;
        else if (this.buffer[i + 1] === '\n') i++;
      }
      start = i + 1;
    }
    this.buffer = this.buffer.slice(start);
  }

  private line(line: string): void {
    if (line === '') {
      this.dispatch();
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') this.event = value;
    else if (field === 'data') this.data.push(value);
    else if (field === 'id' && !value.includes('\0')) this.id = value;
  }

  private dispatch(): void {
    const event = { event: this.event || 'message', data: this.data.join('\n'), id: this.id };
    const hasData = this.data.length > 0;
    this.event = '';
    this.data = [];
    this.id = undefined;
    if (hasData) this.onEvent(event);
  }
}

/** How a stream connection ended, or why it could not open. */
export interface SseFailure {
  /** The HTTP status, when the server answered with a non-stream response. */
  status?: number;
  /** The response body (a problem document), when there was one. */
  body?: unknown;
  /** The `Retry-After` value in milliseconds, when the server sent one. */
  retryAfterMs?: number;
  /** Any error raised by the network or the reader. */
  cause?: unknown;
}

/** What a transport reports about one connection. */
export interface SseHandlers {
  /** The server accepted the stream (2xx, `text/event-stream`). */
  onOpen(): void;
  /** One event, in order. */
  onEvent(event: SseEvent): void;
  /** The server sent bytes (an event or a comment): the connection is alive. */
  onActivity(): void;
  /**
   * The connection is over: refused (with the status and body), failed, or closed by the server.
   * Called once, and never after the caller closed it.
   */
  onClose(failure: SseFailure): void;
}

/**
 * Opens server-sent event streams. The client's own is {@link fetchSseTransport}; tests pass a
 * fake. Returns a function that closes the connection.
 */
export type SseTransport = (
  request: { url: string; headers: Record<string, string> },
  handlers: SseHandlers,
) => () => void;

/**
 * Reads server-sent events over `fetch`, not the browser's `EventSource`, so a reconnect can send
 * `Last-Event-ID` itself (an `EventSource` sends only the last id it saw on its own connection)
 * and a refused stream's status and problem body (401, 410 RESYNC_REQUIRED, 429 with Retry-After)
 * can be read, where an `EventSource` reports only "error".
 */
export function fetchSseTransport(
  fetchImpl: (input: string, init: RequestInit) => Promise<Response> = (input, init) =>
    globalThis.fetch(input, init),
): SseTransport {
  return ({ url, headers }, handlers) => {
    const controller = new AbortController();
    let closed = false;
    const finish = (failure: SseFailure) => {
      if (closed || controller.signal.aborted) return;
      closed = true;
      handlers.onClose(failure);
    };
    void (async () => {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          headers: { Accept: 'text/event-stream', ...headers },
          cache: 'no-store',
          signal: controller.signal,
        });
      } catch (cause) {
        finish({ cause });
        return;
      }
      const type = response.headers.get('Content-Type') ?? '';
      if (!response.ok || !type.startsWith('text/event-stream') || !response.body) {
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          body = undefined;
        }
        finish({
          status: response.status,
          body,
          retryAfterMs: secondsToMs(parseRetryAfter(response.headers.get('Retry-After'))),
        });
        return;
      }
      handlers.onOpen();
      const parser = new SseParser((event) => {
        if (!controller.signal.aborted) handlers.onEvent(event);
      });
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (controller.signal.aborted) return;
          handlers.onActivity();
          parser.push(value);
        }
        finish({ status: response.status });
      } catch (cause) {
        finish({ cause });
      }
    })();
    return () => {
      closed = true;
      controller.abort();
    };
  };
}

/** Whole seconds as milliseconds; undefined stays undefined. */
function secondsToMs(seconds: number | undefined): number | undefined {
  return seconds === undefined ? undefined : seconds * 1000;
}
