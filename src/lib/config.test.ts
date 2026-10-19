import { DEFAULT_BASE_URL, resolveBaseUrl } from './config';

describe('resolveBaseUrl', () => {
  it('defaults to same-origin when unset', () => {
    expect(DEFAULT_BASE_URL).toBe('/');
    expect(resolveBaseUrl(undefined)).toBe('/');
  });

  it('defaults to same-origin when blank', () => {
    expect(resolveBaseUrl('   ')).toBe('/');
  });

  it('uses a configured URL, trimmed', () => {
    expect(resolveBaseUrl(' http://localhost:8080 ')).toBe('http://localhost:8080');
  });
});
