import { renderHook, waitFor } from '@testing-library/react';
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

  it('keeps the last value while a new version of the same key is read, not a new key', async () => {
    const api = {} as ForesignalClient;
    let calls = 0;
    const read = (_api: ForesignalClient, key: string) =>
      calls++ === 0 ? Promise.resolve(`${key}-1`) : new Promise<string>(() => {});
    const { result, rerender } = renderHook(
      ({ key, version }) => useRead(api, key, read, version),
      { initialProps: { key: 'a', version: 0 } },
    );
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', value: 'a-1' }));
    rerender({ key: 'a', version: 1 });
    expect(result.current).toEqual({ status: 'ready', value: 'a-1' });
    rerender({ key: 'b', version: 1 });
    expect(result.current).toEqual({ status: 'loading' });
  });
});
