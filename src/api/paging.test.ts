import { items, pages, type CursorPage } from './paging';

/** Three pages keyed by the cursor that requests them. */
const book: Record<string, CursorPage<number>> = {
  first: { items: [1, 2], nextCursor: 'c2' },
  c2: { items: [3], nextCursor: 'c3' },
  c3: { items: [4, 5], nextCursor: null },
};

describe('paging', () => {
  it('walks nextCursor until it is null', async () => {
    const cursors: Array<string | undefined> = [];
    const fetchPage = (cursor: string | undefined) => {
      cursors.push(cursor);
      return Promise.resolve(book[cursor ?? 'first']!);
    };
    const all: number[] = [];
    for await (const item of items(fetchPage)) all.push(item);
    expect(all).toEqual([1, 2, 3, 4, 5]);
    expect(cursors).toEqual([undefined, 'c2', 'c3']);
  });

  it('fetches lazily: stopping early fetches no further pages', async () => {
    let fetched = 0;
    const fetchPage = (cursor: string | undefined) => {
      fetched++;
      return Promise.resolve(book[cursor ?? 'first']!);
    };
    for await (const page of pages(fetchPage)) {
      expect(page.items).toEqual([1, 2]);
      break;
    }
    expect(fetched).toBe(1);
  });

  it('treats an absent nextCursor as the last page', async () => {
    const result: CursorPage<string>[] = [];
    for await (const page of pages(() => Promise.resolve({ items: ['only'] }))) result.push(page);
    expect(result).toHaveLength(1);
  });
});
