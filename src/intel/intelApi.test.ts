import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createForesignalClient } from '../api/client';
import {
  forecastNumericCalibration,
  intelCalibration,
  intelCorroboration,
} from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import { isNumericCalibration } from './forecastApi';
import { getIntelCalibration, getIntelCalibrationScope, getIntelCorroboration } from './intelApi';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

const client = () => createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false });

describe('isNumericCalibration', () => {
  it('discriminates the numeric variant from the probability one', () => {
    expect(isNumericCalibration(forecastNumericCalibration())).toBe(true);
    expect(
      isNumericCalibration({
        n: 10,
        label: 'ok',
        method: 'corp',
        curve: [],
        bins: [],
      } as never),
    ).toBe(false);
  });
});

describe('intel calibration and corroboration API', () => {
  it('reads the calibration overview as a scopes array', async () => {
    server.use(
      http.get('/v1/intel/calibration', ({ response }) =>
        response(200).json({
          scopes: [intelCalibration(), intelCalibration({ scope: 'precursor-active' })],
        }),
      ),
    );
    const scopes = await getIntelCalibration(client());
    expect(scopes.map((scope) => scope.scope)).toEqual(['intel-event', 'precursor-active']);
  });

  it('reads one scope', async () => {
    let path: string | undefined;
    server.use(
      http.get('/v1/intel/calibration/{scope}', ({ params, response }) => {
        path = String(params.scope);
        return response(200).json(intelCalibration({ scope: 'precursor-active' }));
      }),
    );
    const result = await getIntelCalibrationScope(client(), 'precursor-active');
    expect(path).toBe('precursor-active');
    expect(result.scope).toBe('precursor-active');
  });

  it('reads the corroboration policy', async () => {
    server.use(
      http.get('/v1/intel/corroboration', ({ response }) =>
        response(200).json(intelCorroboration()),
      ),
    );
    const policy = await getIntelCorroboration(client());
    expect(policy.eventQuality?.strongFamilies).toBe(3);
  });
});
