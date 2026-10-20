import { createForesignalClient, type ForesignalClient } from '../../api/client';

/** How a stand-in backend answers one request. */
export type Answer = (request: Request) => Response | Promise<Response>;

/** A JSON response; a problem document for an error status. */
export const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status < 400 ? 'application/json' : 'application/problem+json' },
  });

/**
 * An API client over a stand-in backend: `answers` is keyed by `METHOD /path` (no query), and an
 * unknown request answers 404. `asked` lists every request as `METHOD /path?query`, and `bodies`
 * the parsed JSON bodies in the same order (undefined for none).
 */
export function standInApi(answers: Record<string, Answer>): {
  api: ForesignalClient;
  asked: string[];
  bodies: unknown[];
} {
  const asked: string[] = [];
  const bodies: unknown[] = [];
  const api = createForesignalClient({
    baseUrl: 'http://api.test',
    retry: false,
    fetch: async (request) => {
      const url = new URL(request.url);
      asked.push(`${request.method} ${url.pathname}${url.search}`);
      const text = request.body ? await request.clone().text() : '';
      bodies.push(text ? (JSON.parse(text) as unknown) : undefined);
      const answer = answers[`${request.method} ${url.pathname}`];
      return answer ? answer(request) : json({ title: 'Not Found', status: 404 }, 404);
    },
  });
  return { api, asked, bodies };
}
