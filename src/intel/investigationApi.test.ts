// @vitest-environment node
import { FsError } from '../api/errors';
import { json, standInApi } from './testing/standIn';
import { investigation, INVESTIGATION_ID } from './testing/fixtures';
import {
  addInvestigationItem,
  exportInvestigation,
  getInvestigation,
  removeInvestigationItem,
  updateInvestigation,
} from './investigationApi';
import { openInvestigation } from './openInvestigation';

const path = `/v1/investigations/${INVESTIGATION_ID}`;

describe('the investigation requests', () => {
  it('reads, changes, adds to and removes from an investigation', async () => {
    const { api, asked, bodies } = standInApi({
      [`GET ${path}`]: () => json(investigation),
      [`PATCH ${path}`]: () => json({ ...investigation, status: 'closed' }),
      [`POST ${path}/items`]: () => json(investigation.items![0], 201),
      [`DELETE ${path}/items/item-1`]: () => new Response(null, { status: 204 }),
    });
    expect((await getInvestigation(api, INVESTIGATION_ID)).displayId).toBe('INV-2026-0001');
    expect((await updateInvestigation(api, INVESTIGATION_ID, { status: 'closed' })).status).toBe(
      'closed',
    );
    await addInvestigationItem(api, INVESTIGATION_ID, {
      itemType: 'record',
      ref: 'usgs-earthquakes/nc75095651',
      note: 'Strongest',
    });
    await removeInvestigationItem(api, INVESTIGATION_ID, 'item-1');
    expect(asked).toEqual([
      `GET ${path}`,
      `PATCH ${path}`,
      `POST ${path}/items`,
      `DELETE ${path}/items/item-1`,
    ]);
    expect(bodies[1]).toEqual({ status: 'closed' });
    expect(bodies[2]).toEqual({
      itemType: 'record',
      ref: 'usgs-earthquakes/nc75095651',
      note: 'Strongest',
    });
  });

  it('exports in the format asked, as text with its media type, and raises a refusal', async () => {
    const { api, asked } = standInApi({
      [`GET ${path}/export`]: () =>
        new Response('# Tropical Storm Florence\n', {
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        }),
    });
    const file = await exportInvestigation(api, INVESTIGATION_ID, 'md');
    expect(file).toEqual({
      text: '# Tropical Storm Florence\n',
      type: 'text/markdown; charset=utf-8',
    });
    expect(asked).toEqual([`GET ${path}/export?format=md`]);
    const refused = standInApi({
      [`GET ${path}/export`]: () => json({ title: 'Unauthorized', status: 401 }, 401),
    });
    await expect(exportInvestigation(refused.api, INVESTIGATION_ID, 'json')).rejects.toBeInstanceOf(
      FsError,
    );
  });

  it('opens an investigation from an object, with the object pinned', async () => {
    const { api, asked, bodies } = standInApi({
      'POST /v1/investigations': () => json(investigation, 201),
      [`POST ${path}/items`]: () => json(investigation.items![0], 201),
    });
    const opened = await openInvestigation(api, {
      ref: 'record:usgs-earthquakes/nc75095651',
      title: 'M 4.6 - 10 km NE of The Geysers',
    });
    expect(opened.id).toBe(INVESTIGATION_ID);
    expect(asked).toEqual(['POST /v1/investigations', `POST ${path}/items`]);
    expect(bodies[0]).toEqual({ title: 'M 4.6 - 10 km NE of The Geysers', status: 'open' });
    expect(bodies[1]).toEqual({ itemType: 'object', ref: 'record:usgs-earthquakes/nc75095651' });
  });
});
