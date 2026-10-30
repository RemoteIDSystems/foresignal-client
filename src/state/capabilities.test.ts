import { HttpResponse } from 'msw';
import { createForesignalClient } from '../api/client';
import { FsError } from '../api/errors';
import { contract, systemInfo } from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { checkVersion, createCapabilitiesStore } from './capabilities';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

function backend(apiVersion: string) {
  server.use(
    http.get('/v1/system', ({ response }) => response(200).json(systemInfo(apiVersion))),
    http.get('/v1/contract', ({ response }) => response(200).json(contract())),
  );
}

describe('checkVersion', () => {
  it('flags a differing or missing apiVersion', () => {
    expect(checkVersion('2.1.0', systemInfo('2.1.0')).mismatch).toBe(false);
    expect(checkVersion('2.1.0', systemInfo('1.1.0'))).toEqual({
      expected: '2.1.0',
      actual: '1.1.0',
      mismatch: true,
    });
    const withoutVersion = { ...systemInfo(), apiVersion: undefined };
    expect(checkVersion('2.1.0', withoutVersion).mismatch).toBe(true);
  });
});

describe('createCapabilitiesStore', () => {
  it('loads getSystem and getContract into a ready snapshot', async () => {
    backend('2.1.0');
    const store = createCapabilitiesStore();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.get().status).toBe('loading');
    await store.load(client(), '2.1.0');
    const snapshot = store.get();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(snapshot.status).toBe('ready');
    if (snapshot.status !== 'ready') return;
    expect(snapshot.system.security?.openReads).toBe(true);
    expect(snapshot.contract.contractVersion).toBe('1.5');
    expect(snapshot.version.mismatch).toBe(false);
  });

  it('surfaces a version mismatch', async () => {
    backend('1.0.0');
    const store = createCapabilitiesStore();
    await store.load(client(), '2.1.0');
    const snapshot = store.get();
    expect(snapshot.status === 'ready' && snapshot.version).toEqual({
      expected: '2.1.0',
      actual: '1.0.0',
      mismatch: true,
    });
  });

  it('publishes the error when the backend fails', async () => {
    server.use(
      http.untyped.get(`${MOCK_BASE_URL}/v1/system`, () =>
        HttpResponse.text('down', { status: 502, statusText: 'Bad Gateway' }),
      ),
      http.get('/v1/contract', ({ response }) => response(200).json(contract())),
    );
    const store = createCapabilitiesStore();
    await store.load(client(), '2.1.0');
    const snapshot = store.get();
    expect(snapshot.status).toBe('error');
    expect(snapshot.status === 'error' && snapshot.error).toBeInstanceOf(FsError);
  });
});
