import { json, standInApi } from '../intel/testing/standIn';
import { InboxFeed, mergeItems } from './InboxFeed';
import { badge, FakeSse, item } from './testing/alertFixtures';

const DEVICE = '9b8f7e6d-0000-4000-8000-00000000d001';

function inbox(token: string | null = 'token') {
  const sse = new FakeSse();
  const stand = standInApi({
    'GET /v1/notifications/badge': () => json(badge(2, 12)),
    'GET /v1/notifications': () =>
      json({ items: [item(12), item(11, { read: true })], nextCursor: null }),
    'POST /v1/notifications/read': () => json(badge(0, 12)),
  });
  const feed = new InboxFeed({
    api: stand.api,
    baseUrl: 'http://api.test',
    getToken: () => token,
    getDeviceId: () => DEVICE,
    transport: sse.transport,
  });
  return { feed, sse, ...stand };
}

describe('InboxFeed', () => {
  it('holds nothing and connects nowhere without a token', () => {
    const { feed, sse, asked } = inbox(null);
    feed.start();
    feed.load();
    expect(asked).toEqual([]);
    expect(sse.connections).toHaveLength(0);
    expect(feed.getSnapshot().badge).toBeUndefined();
  });

  it('reads the badge and follows the inbox stream with this device’s id', async () => {
    const { feed, sse } = inbox();
    feed.start();
    await vi.waitFor(() => expect(feed.getSnapshot().badge).toEqual(badge(2, 12)));
    await vi.waitFor(() => expect(sse.connections).toHaveLength(1));
    expect(sse.last.url.pathname).toBe('/v1/notifications/stream');
    expect(sse.last.headers['Foresignal-Device-Id']).toBe(DEVICE);
    sse.open();
    sse.send('notification', item(13), '13');
    sse.send('badge', badge(3, 13, 1));
    expect(feed.getSnapshot().items.map((entry) => entry.id)).toEqual([13]);
    expect(feed.getSnapshot().badge).toEqual(badge(3, 13, 1));
  });

  it('lists the newest page once, and marks one or all read on this device', async () => {
    const { feed, asked, bodies } = inbox();
    feed.load();
    feed.load();
    await vi.waitFor(() => expect(feed.getSnapshot().list).toBe('ready'));
    expect(asked.filter((line) => line.startsWith('GET /v1/notifications?'))).toEqual([
      'GET /v1/notifications?limit=50',
    ]);
    await feed.markRead(12);
    expect(bodies.at(-1)).toEqual({ ids: [12] });
    expect(feed.getSnapshot().items[0]!.read).toBe(true);
    await feed.markAllRead();
    expect(bodies.at(-1)).toEqual({ upToId: 12 });
    expect(feed.getSnapshot().badge?.unread).toBe(0);
  });

  it('merges items by id, the newer copy winning, newest first', () => {
    expect(
      mergeItems([item(2, { read: true })], [item(1), item(2)]).map((entry) => [
        entry.id,
        entry.read,
      ]),
    ).toEqual([
      [2, true],
      [1, false],
    ]);
  });
});
