// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createForesignalClient, DEVICE_ID_OPERATIONS } from './client';
import { http, MOCK_BASE_URL, server } from './testing/mock-server';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const DEVICE = '0b0e1c4a-5d1f-4b8e-9a51-6c2f6b1d2e3f';

describe('Foresignal-Device-Id', () => {
  it('lists exactly the operations whose spec declares the header', () => {
    const spec = JSON.parse(
      readFileSync(new URL('../../openapi/OpenAPI.json', import.meta.url), 'utf8'),
    ) as { paths: Record<string, Record<string, { parameters?: Array<{ name?: string }> }>> };
    const declared = new Set<string>();
    for (const [path, item] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(item)) {
        const params = operation.parameters ?? [];
        if (params.some((p) => p.name?.toLowerCase() === 'foresignal-device-id')) {
          declared.add(`${method.toUpperCase()} ${path}`);
        }
      }
    }
    expect([...DEVICE_ID_OPERATIONS].sort()).toEqual([...declared].sort());
  });

  it('is sent on inbox calls and not on others', async () => {
    const seen: Record<string, string | null> = {};
    server.use(
      http.get('/v1/notifications/badge', ({ request, response }) => {
        seen.badge = request.headers.get('Foresignal-Device-Id');
        return response(200).json({ unread: 0, unreadCritical: 0 });
      }),
      http.get('/v1/system', ({ request, response }) => {
        seen.system = request.headers.get('Foresignal-Device-Id');
        return response(200).json({ version: '1.0.0', startedAt: '2026-10-19T00:00:00Z' });
      }),
    );
    const client = createForesignalClient({ baseUrl: MOCK_BASE_URL, getDeviceId: () => DEVICE });
    await client.GET('/v1/notifications/badge');
    await client.GET('/v1/system');
    expect(seen).toEqual({ badge: DEVICE, system: null });
  });
});
