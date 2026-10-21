import { json, standInApi } from '../intel/testing/standIn';
import { AlertFeed, MAX_TOASTS } from './AlertFeed';
import { alert, FakeSse } from './testing/alertFixtures';

function feed(open = [alert(1, { state: 'acknowledged' })]) {
  const sse = new FakeSse();
  const { api, asked } = standInApi({
    'GET /v1/alerts': () => json({ items: open, nextCursor: null }),
  });
  const alerts = new AlertFeed({
    api,
    baseUrl: 'http://api.test',
    getToken: () => null,
    transport: sse.transport,
  });
  return { alerts, sse, asked };
}

describe('AlertFeed', () => {
  it('reads the open alerts and connects to the alert stream', async () => {
    const { alerts, sse, asked } = feed();
    alerts.start();
    await vi.waitFor(() => expect(alerts.getSnapshot().open).toHaveLength(1));
    expect(asked[0]).toBe('GET /v1/alerts?state=firing&state=acknowledged&limit=50');
    expect(sse.last.url.pathname).toBe('/v1/alerts/stream');
    expect(alerts.getSnapshot().toasts).toEqual([]);
  });

  it('adds and toasts a fired alert, replaces an update, and drops a resolved one', async () => {
    const { alerts, sse } = feed([]);
    const seen = vi.fn();
    alerts.subscribe(seen);
    alerts.start();
    sse.open();
    sse.send('alert', { type: 'fired', alert: alert(2) }, '2');
    expect(alerts.getSnapshot().open.map((entry) => entry.id)).toEqual([2]);
    expect(alerts.getSnapshot().toasts.map((entry) => entry.id)).toEqual([2]);

    sse.send('alert.updated', {
      type: 'acknowledged',
      alert: alert(2, { state: 'acknowledged', rev: 3 }),
    });
    expect(alerts.getSnapshot().open[0]!.state).toBe('acknowledged');
    // An acknowledged alert no longer toasts.
    expect(alerts.getSnapshot().toasts).toEqual([]);

    sse.send('alert.enriched', alert(2, { state: 'acknowledged', rev: 4, summary: 'Context' }));
    expect(alerts.getSnapshot().open[0]!.summary).toBe('Context');

    sse.send('alert.resolved', {
      type: 'resolved',
      alert: alert(2, { state: 'resolved', rev: 5 }),
    });
    expect(alerts.getSnapshot().open).toEqual([]);
    expect(seen).toHaveBeenCalled();
  });

  it('keeps the newer revision, and at most three toasts', async () => {
    const { alerts, sse } = feed([]);
    alerts.start();
    sse.open();
    for (const id of [3, 4, 5, 6]) sse.send('alert', { type: 'fired', alert: alert(id) });
    expect(alerts.getSnapshot().toasts.map((entry) => entry.id)).toEqual([6, 5, 4]);
    expect(MAX_TOASTS).toBe(3);
    alerts.apply(alert(6, { rev: 1, message: 'older' }));
    expect(alerts.getSnapshot().open.find((entry) => entry.id === 6)!.message).not.toBe('older');
    alerts.dismiss(6);
    expect(alerts.getSnapshot().toasts.map((entry) => entry.id)).toEqual([5, 4]);
  });

  it('does not toast a replayed alert it already holds, nor a suppressed one', async () => {
    const { alerts, sse } = feed([alert(7)]);
    alerts.start();
    await vi.waitFor(() => expect(alerts.getSnapshot().open).toHaveLength(1));
    sse.open();
    sse.send('alert', { type: 'fired', alert: alert(7) });
    sse.send('alert', { type: 'fired', alert: alert(8, { suppressed: true }) });
    expect(alerts.getSnapshot().toasts).toEqual([]);
    expect(alerts.getSnapshot().open.map((entry) => entry.id)).toEqual([7]);
  });

  it('restarts only when started', () => {
    const { alerts, sse } = feed();
    alerts.restart();
    expect(sse.connections).toHaveLength(0);
    alerts.start();
    alerts.restart();
    expect(sse.connections).toHaveLength(2);
    expect(sse.connections[0]!.closed).toBe(true);
  });
});
