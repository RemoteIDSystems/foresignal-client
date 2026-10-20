import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import { toFsError } from '../api/errors';
import type { components } from '../api/generated/schema';
import { SseParser } from '../api/stream/sse';

/** A question to Ask, and the thread it continues, if any (the parts of `AskRequest` sent). */
export interface AskQuestion {
  question: string;
  threadId?: string;
}

/** Ask's verified answer (`AskResponse`), the stream's `done` event. */
export type AskResponse = components['schemas']['AskResponse'];

/** An object an answer cites (`AskCitation`). */
export type AskCitation = components['schemas']['AskCitation'];

/** A page of the caller's Ask threads (`AskThreadPage`). */
export type AskThreadPage = components['schemas']['AskThreadPage'];

/** One thread in {@link AskThreadPage}. */
export type AskThreadSummary = AskThreadPage['items'][number];

/** An Ask thread with its messages (`AskThread`). */
export type AskThread = components['schemas']['AskThread'];

/** One message of a thread (`AskMessage`). */
export type AskMessage = components['schemas']['AskMessage'];

/** What the Ask stream reports as it answers. */
export interface AskStreamHandlers {
  /** A tool the model is calling, or has finished with. */
  onProgress?: (progress: components['schemas']['AskProgressEvent']) => void;
  /** More of the answer's text, not yet verified. */
  onDelta?: (text: string) => void;
  /** An object the answer cites, as soon as it is verified. */
  onCitation?: (citation: AskCitation) => void;
  /** A dropped citation, an uncited claim or a refusal. */
  onWarning?: (message: string) => void;
}

/**
 * Asks a question and streams the answer (`askStream`): tool progress, the answer's text as it is
 * written, citations and warnings go to `handlers`; the promise settles with the verified answer
 * (the `done` event), which is what to show in the end. A refusal before the stream opens (no
 * token, `LLM_NOT_CONFIGURED`, a budget or stream limit) and an `error` event both reject with an
 * {@link FsError}-like error carrying the problem. Actions the answer proposes are not carried out
 * (`allowActions` is false).
 */
export async function askStream(
  api: ForesignalClient,
  request: AskQuestion,
  handlers: AskStreamHandlers,
  signal?: AbortSignal,
): Promise<AskResponse> {
  const { data, error, response } = await api.POST('/v1/ask/stream', {
    // Write actions are never carried out from this panel: the backend only proposes them.
    body: { ...request, allowActions: false },
    headers: { Accept: 'text/event-stream' },
    parseAs: 'stream',
    signal,
  });
  if (!response.ok || !data) throw toFsError(response, error);
  let done: AskResponse | undefined;
  let failure: Error | undefined;
  const parser = new SseParser(({ event, data: text }) => {
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return;
    }
    switch (event) {
      case 'progress':
        handlers.onProgress?.(payload as components['schemas']['AskProgressEvent']);
        break;
      case 'delta':
        handlers.onDelta?.((payload as { text: string }).text);
        break;
      case 'citation':
        handlers.onCitation?.(payload as AskCitation);
        break;
      case 'warning':
        handlers.onWarning?.((payload as { message: string }).message);
        break;
      case 'done':
        done = payload as AskResponse;
        break;
      case 'error':
        failure = toFsError(new Response(null, { status: problemStatus(payload) }), payload);
        break;
      // Heartbeats, proposed actions and events this client does not know are passed over.
    }
  });
  const reader = (data as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done: ended } = await reader.read();
      if (ended) break;
      parser.push(decoder.decode(value, { stream: true }));
      if (done || failure) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  if (failure) throw failure;
  if (!done) throw new Error('The answer stream ended before the answer was complete.');
  return done;
}

/** The HTTP status a stream's `error` event names, or 500 when it names none. */
function problemStatus(payload: unknown): number {
  const status = (payload as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status <= 599 ? status : 500;
}

/** The caller's Ask threads, newest first (`listAskThreads`). */
export function listAskThreads(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<AskThreadPage> {
  return unwrap(api.GET('/v1/ask/threads', { params: { query: { limit: 50 } }, signal }));
}

/** One Ask thread with its messages (`getAskThread`). */
export function getAskThread(
  api: ForesignalClient,
  threadId: string,
  signal?: AbortSignal,
): Promise<AskThread> {
  return unwrap(api.GET('/v1/ask/threads/{threadId}', { params: { path: { threadId } }, signal }));
}

/** Deletes an Ask thread (`deleteAskThread`). */
export async function deleteAskThread(api: ForesignalClient, threadId: string): Promise<void> {
  await unwrap(api.DELETE('/v1/ask/threads/{threadId}', { params: { path: { threadId } } }));
}
