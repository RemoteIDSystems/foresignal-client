import { FakeSse } from '../alerts/testing/alertFixtures';
import { SavedViewStream } from './viewStream';

describe('a saved view’s stream', () => {
  it('opens while listened to, and hands changes on as the view layer’s areas', () => {
    const sse = new FakeSse();
    const stream = new SavedViewStream('01HV', {
      baseUrl: 'http://api.test',
      getToken: () => null,
      transport: sse.transport,
    });
    const areas = vi.fn();
    const reload = vi.fn();
    expect(sse.connections).toHaveLength(0);
    const stop = stream.listen({ areas, reload });
    expect(sse.last.url.pathname).toBe('/v1/views/01HV/stream');
    sse.open();
    sse.send(
      'change',
      {
        seq: 9,
        kind: 'earthquake',
        source: 'usgs-earthquakes',
        externalId: 'us1',
        op: 'upsert',
        bbox: [1, 2, 1, 2],
      },
      '9',
    );
    expect(areas).toHaveBeenCalledWith([
      { kind: 'view:01HV', source: 'usgs-earthquakes', boxes: [[1, 2, 1, 2]] },
    ]);
    sse.send('resync', { reason: 'gap' });
    sse.send('reset', { reason: 'view-changed' });
    expect(reload).toHaveBeenCalledTimes(2);
    sse.send('heartbeat', {});
    sse.send('change', 'not an object');
    expect(areas).toHaveBeenCalledTimes(1);
    stop();
    expect(sse.last.closed).toBe(true);
  });
});
