import { HttpResponse } from 'msw';
import { createForesignalClient } from '../api/client';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import type { Session } from '../app/session';
import { createMfaGate, disableMfa, enrollMfa, getMfaRecoveryCodes, verifyMfa } from './mfa';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const session = () =>
  ({ api: createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false }) }) as unknown as Session;

/** Waits for the microtask/macrotask queue so a fire-and-forget onResponse callback can run. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('MFA operations', () => {
  it('enrolls, returning the secret and QR', async () => {
    server.use(
      http.post('/v1/me/mfa/enroll', ({ response }) =>
        response(200).json({ secret: 'ABC123', otpauthUri: 'otpauth://totp/x', qrSvg: '<svg/>' }),
      ),
    );
    expect(await enrollMfa(session())).toMatchObject({ secret: 'ABC123', qrSvg: '<svg/>' });
  });

  it('verifies a code and carries the first recovery codes', async () => {
    server.use(
      http.post('/v1/me/mfa/verify', ({ response }) =>
        response(200).json({
          enabled: true,
          required: false,
          enrolledAt: '2026-10-29T00:00:00Z',
          recoveryCodes: {
            codes: ['aaaaa-bbbbb', 'ccccc-ddddd'],
            generatedAt: '2026-10-29T00:00:00Z',
          },
        }),
      ),
    );
    const status = await verifyMfa(session(), '123456');
    expect(status.enabled).toBe(true);
    expect(status.recoveryCodes?.codes).toHaveLength(2);
  });

  it('disables with a code', async () => {
    let posted: Record<string, unknown> | undefined;
    server.use(
      http.post('/v1/me/mfa/disable', async ({ request, response }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return response(200).json({ enabled: false, required: false });
      }),
    );
    const status = await disableMfa(session(), { code: '123456' });
    expect(status.enabled).toBe(false);
    expect(posted).toEqual({ code: '123456' });
  });

  it('gets a fresh set of recovery codes', async () => {
    server.use(
      http.get('/v1/me/mfa/recovery-codes', ({ response }) =>
        response(200).json({ codes: ['11111-22222'], generatedAt: '2026-10-29T00:00:00Z' }),
      ),
    );
    expect((await getMfaRecoveryCodes(session())).codes).toEqual(['11111-22222']);
  });
});

describe('createMfaGate', () => {
  it('raises, lowers and notifies on change only', () => {
    const gate = createMfaGate();
    const listener = vi.fn();
    gate.subscribe(listener);
    expect(gate.get()).toBe(false);
    gate.set(true);
    gate.set(true);
    gate.set(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('client onForbidden', () => {
  it('reports the problem code on a 403, from a clone (response still readable)', async () => {
    const seen: Array<string | undefined> = [];
    server.use(
      http.untyped.get(`${MOCK_BASE_URL}/v1/me`, () =>
        HttpResponse.json(
          { title: 'No', status: 403, code: 'MFA_ENROLLMENT_REQUIRED' },
          { status: 403 },
        ),
      ),
    );
    const api = createForesignalClient({
      baseUrl: MOCK_BASE_URL,
      retry: false,
      onForbidden: (code) => seen.push(code),
    });
    const { response } = await api.GET('/v1/me');
    expect(response.status).toBe(403);
    await flush();
    expect(seen).toEqual(['MFA_ENROLLMENT_REQUIRED']);
  });
});
