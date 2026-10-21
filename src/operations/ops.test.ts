import { json, standInApi } from '../intel/testing/standIn';
import { listRecentRuns, listSinkRows, type SourceHealth } from './opsApi';
import { filterHealth, healthCounts, lagText, progressText, sinkState } from './opsView';

/** A source's health with the given status. */
const health = (sourceId: string, status: SourceHealth['status']): SourceHealth => ({
  sourceId,
  status,
  consecutiveFailures: 0,
});

describe('the Operations console', () => {
  it('counts the sources by health and lists them worst first', () => {
    const all = [
      health('usgs-earthquakes', 'healthy'),
      health('abusech-feodo', 'disabled'),
      health('nws-alerts', 'failing'),
      health('adsb', 'degraded'),
      health('aprs-is', 'healthy'),
    ];
    expect(healthCounts(all)).toEqual({
      failing: 1,
      degraded: 1,
      idle: 0,
      healthy: 2,
      disabled: 1,
    });
    expect(filterHealth(all, 'enabled').map((entry) => entry.sourceId)).toEqual([
      'nws-alerts',
      'adsb',
      'aprs-is',
      'usgs-earthquakes',
    ]);
    expect(filterHealth(all, 'all')).toHaveLength(5);
    expect(filterHealth(all, 'disabled').map((entry) => entry.sourceId)).toEqual(['abusech-feodo']);
  });

  it('shows job progress, sink state and lag as the backend gives them', () => {
    expect(progressText({ progress: 42 } as never)).toBe('42%');
    expect(progressText({ progress: 140 } as never)).toBe('100%');
    expect(sinkState({ state: 'STOPPED' } as never, undefined)).toBe('STOPPED');
    expect(sinkState({ state: 'STOPPED' } as never, { state: 'RUNNING' } as never)).toBe('RUNNING');
    expect(lagText({ lagSeq: 12_500 } as never)).toBe('12,500 seq');
    expect(lagText(undefined)).toBe('—');
  });

  it('merges every briefing’s runs, newest first', async () => {
    const { api, asked } = standInApi({
      'GET /v1/briefings': () =>
        json([
          { id: 'b1', name: 'Morning', enabled: true, schedule: '0 6 * * *', timezone: 'UTC' },
          { id: 'b2', name: 'Evening', enabled: true, schedule: '0 18 * * *', timezone: 'UTC' },
        ]),
      'GET /v1/briefings/b1/runs': () =>
        json({
          items: [{ id: 'r1', status: 'succeeded', startedAt: '2026-10-20T06:00:00Z' }],
          nextCursor: null,
        }),
      'GET /v1/briefings/b2/runs': () =>
        json({
          items: [{ id: 'r2', status: 'failed', startedAt: '2026-10-20T18:00:00Z' }],
          nextCursor: null,
        }),
    });
    const runs = await listRecentRuns(api, 5);
    expect(runs.map((run) => [run.id, run.briefingName])).toEqual([
      ['r2', 'Evening'],
      ['r1', 'Morning'],
    ]);
    expect(asked).toContain('GET /v1/briefings/b1/runs?limit=5');
  });

  it('lists each sink with its status, and keeps a sink whose status failed', async () => {
    const { api } = standInApi({
      'GET /v1/sinks': () =>
        json({
          items: [
            { id: 'mqtt', name: 'MQTT', type: 'mqtt-state', enabled: true },
            { id: 'cot', name: 'CoT', type: 'cot', enabled: true },
          ],
          nextCursor: null,
        }),
      'GET /v1/sinks/mqtt/status': () =>
        json({
          sinkId: 'mqtt',
          state: 'RUNNING',
          lagSeq: 3,
          delivered: 10,
          dropped: 0,
          denied: { total: 0 },
        }),
      'GET /v1/sinks/cot/status': () =>
        json({ title: 'Internal Server Error', status: 500, detail: 'Status unavailable.' }, 500),
    });
    const rows = await listSinkRows(api);
    expect(rows[0]).toMatchObject({ sink: { id: 'mqtt' }, status: { state: 'RUNNING' } });
    expect(rows[1]).toMatchObject({ sink: { id: 'cot' } });
    expect(rows[1]!.error).toContain('Status unavailable.');
  });
});
