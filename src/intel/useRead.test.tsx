import { renderHook } from '@testing-library/react';
import type { ForesignalClient } from '../api/client';
import { useRead } from './useHypotheses';

describe('useRead', () => {
  it('returns the same loading value on every render, so effects that list it settle', () => {
    const read = () => new Promise<string>(() => {});
    const { result, rerender } = renderHook(({ key }) => useRead(undefined, key, read), {
      initialProps: { key: undefined as string | undefined },
    });
    const first = result.current;
    rerender({ key: undefined });
    expect(result.current).toEqual({ status: 'loading' });
    expect(result.current).toBe(first);
  });

  it('keeps the loading value while a keyed read is under way', () => {
    const api = {} as ForesignalClient;
    const read = () => new Promise<string>(() => {});
    const { result, rerender } = renderHook(({ key }) => useRead(api, key, read), {
      initialProps: { key: 'a' },
    });
    const first = result.current;
    rerender({ key: 'a' });
    expect(result.current).toBe(first);
  });
});
