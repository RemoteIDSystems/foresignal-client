/** One page of a cursor-paged list: the backend's `{ items, nextCursor }` shape. */
export interface CursorPage<T> {
  /** The items on this page. */
  items: T[];
  /** Pass as `cursor` for the next page; null or absent on the last page. */
  nextCursor?: string | null;
}

/**
 * Iterates pages of a cursor-paged list lazily.
 *
 * `fetchPage` is called with `undefined` for the first page and then with each page's
 * `nextCursor`; iteration ends after a page without one. Nothing is fetched until the
 * consumer asks for the next page.
 */
export async function* pages<T>(
  fetchPage: (cursor: string | undefined) => Promise<CursorPage<T>>,
): AsyncGenerator<CursorPage<T>, void, undefined> {
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    yield page;
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
}

/** Iterates the items of a cursor-paged list lazily, page by page. See {@link pages}. */
export async function* items<T>(
  fetchPage: (cursor: string | undefined) => Promise<CursorPage<T>>,
): AsyncGenerator<T, void, undefined> {
  for await (const page of pages(fetchPage)) {
    yield* page.items;
  }
}
