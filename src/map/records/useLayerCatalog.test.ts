// @vitest-environment node
import { FsError } from '../../api/errors';
import { CATALOG_LOAD_RETRIES, catalogRetryDelay } from './useLayerCatalog';

const refusal = (status: number, retryAfter?: number) =>
  new FsError({ status, title: 'Too Many Requests', retryAfter });

describe('catalogRetryDelay', () => {
  it('waits out a rate limit or a busy backend, longer each time, then gives up', () => {
    expect(catalogRetryDelay(refusal(429, 1), 0)).toBe(1000);
    expect(catalogRetryDelay(refusal(429), 2)).toBe(3000);
    expect(catalogRetryDelay(refusal(503, 5), 1)).toBe(6000);
    expect(catalogRetryDelay(refusal(429, 1), CATALOG_LOAD_RETRIES)).toBeUndefined();
  });

  it('does not retry other failures', () => {
    expect(catalogRetryDelay(refusal(500), 0)).toBeUndefined();
    expect(catalogRetryDelay(refusal(404), 0)).toBeUndefined();
    expect(catalogRetryDelay(new TypeError('Failed to fetch'), 0)).toBeUndefined();
  });
});
