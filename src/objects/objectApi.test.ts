// @vitest-environment node
import { createForesignalClient } from '../api/client';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { DossierSource, getObject, resolveObjects, type Dossier } from './objectApi';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const api = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });
const REF = 'record:usgs-earthquakes/nc%2F1';

const envelope = { ref: REF, type: 'record', title: 'M 2.5 - Somewhere' };
const dossier: Dossier = {
  ref: REF,
  envelope,
  generatedAt: '2026-10-20T12:00:00Z',
  sections: { overview: { status: 'ok', fields: { mag: 2.5 } } },
};

describe('the object requests', () => {
  it('asks for an object by its ref as one path segment', async () => {
    let path = '';
    server.use(
      http.get('/v1/objects/{ref}', ({ request, response }) => {
        path = new URL(request.url).pathname;
        return response(200).json(envelope);
      }),
    );
    expect((await getObject(api(), REF)).title).toBe('M 2.5 - Somewhere');
    // The ref's own percent-encoding is kept: the slash in the id is %252F on the wire.
    expect(path).toBe('/v1/objects/record%3Ausgs-earthquakes%2Fnc%252F1');
  });

  it('resolves many refs, listing the missing ones', async () => {
    server.use(
      http.post('/v1/objects/resolve', async ({ request, response }) => {
        const body = (await request.json()) as { refs: string[] };
        return response(200).json({ items: [envelope], missing: body.refs.slice(1) });
      }),
    );
    const result = await resolveObjects(api(), [REF, 'record:x/gone']);
    expect(result.items).toHaveLength(1);
    expect(result.missing).toEqual(['record:x/gone']);
  });

  it('revalidates a dossier with its ETag, and reuses it on 304', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get('/v1/objects/{ref}/dossier', ({ request, response }) => {
        const tag = request.headers.get('If-None-Match');
        seen.push(tag);
        if (tag === '"d-1"') return response.untyped(new Response(null, { status: 304 }));
        return response.untyped(
          new Response(JSON.stringify(dossier), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ETag: '"d-1"' },
          }),
        );
      }),
    );
    const source = new DossierSource(api());
    const first = await source.load(REF);
    const again = await source.load(REF);
    expect(again).toBe(first);
    expect(seen).toEqual([null, '"d-1"']);
    // As of an instant is another dossier, read without the live one's tag.
    await source.load(REF, '2026-10-20T10:00:00Z');
    expect(seen[2]).toBeNull();
  });

  it('raises the backend’s problem for a dossier that cannot be read', async () => {
    server.use(
      http.get('/v1/objects/{ref}/dossier', ({ response }) =>
        response(404).json({
          type: 'about:blank',
          title: 'Not found',
          status: 404,
          detail: 'No such object',
        }),
      ),
    );
    await expect(new DossierSource(api()).load(REF)).rejects.toMatchObject({ status: 404 });
  });
});
