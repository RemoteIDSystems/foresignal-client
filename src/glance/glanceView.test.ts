// @vitest-environment node
import type { Glance, StatsGrid, StatsTop } from './glanceApi';
import { alertsText, heatCells, leader, statusLook } from './glanceView';

describe('the glance in words', () => {
  it('names the backend’s health', () => {
    expect(statusLook('ok')).toEqual({ label: 'Operational', tone: 'ok' });
    expect(statusLook('failing').tone).toBe('alert');
    expect(statusLook(undefined).label).toBe('Connecting');
  });

  it('says the alerts as far as the caller may see them', () => {
    expect(alertsText({ alerts: { open: { critical: 2, warning: 0, info: 1 } } } as Glance)).toBe(
      'Alerts: 2 critical, 1 info',
    );
    expect(alertsText({ alerts: { open: { critical: 0 } } } as Glance)).toBe('No open alerts');
    expect(
      alertsText({
        alerts: {
          latest: [{ id: 1, severity: 'warning', shortTitle: 'M6.1 Chile', firedAt: 'x' }],
        },
      } as Glance),
    ).toBe('Latest alert: M6.1 Chile');
    expect(alertsText({ alerts: { latest: [] } } as unknown as Glance)).toBe('No recent alerts');
  });

  it('names a ranking’s leader', () => {
    const top = {
      items: [{ key: 'usgs-earthquakes', sourceId: 'usgs-earthquakes', count: 492 }],
    } as StatsTop;
    expect(leader(top)).toEqual({ label: 'USGS Earthquakes', count: 492 });
    expect(leader({ items: [] } as unknown as StatsTop)).toBeUndefined();
  });
});

describe('heatCells', () => {
  it('places cells on the equirectangular inset, weighted by the square root of their share', () => {
    const grid = {
      features: [
        {
          id: 'a',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-180, 90],
                [0, 0],
                [180, -90],
              ],
            ],
          },
          properties: { value: 100 },
        },
        {
          id: 'b',
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [170, 10],
                  [180, 10],
                ],
              ],
              [
                [
                  [-180, 10],
                  [-170, 10],
                ],
              ],
            ],
          },
          properties: { value: 25 },
        },
      ],
    } as unknown as StatsGrid;
    expect(heatCells(grid)).toEqual([
      { id: 'a-0', x: 180, y: 90, weight: 1 },
      { id: 'b-0', x: 355, y: 80, weight: 0.5 },
      { id: 'b-1', x: 5, y: 80, weight: 0.5 },
    ]);
    expect(heatCells(undefined)).toEqual([]);
  });
});
