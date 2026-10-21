import type { Workspace } from '../workspaceApi';

/** The stand-in workspace's id. */
export const WORKSPACE_ID = '01JA8Q00000000000000000W01';

/** A workspace at context version 3, focused on a quake over Northern California. */
export const workspace: Workspace = {
  id: WORKSPACE_ID,
  name: 'Geysers swarm',
  owner: 'analyst',
  members: {},
  callerRole: 'owner',
  context: {
    selectedRefs: ['facility:01JA8Q00000000000000000G01'],
    focusRef: 'record:usgs-earthquakes/nc1',
    viewport: { bbox: [-123.2, 38.4, -122.4, 39] },
    layers: ['earthquake', 'product:goes-east'],
    filters: { hiddenSources: ['emsc'] },
    asOf: '2026-10-18T12:00:00Z',
  },
  contextVersion: 3,
  layout: { v: 1, closedPanels: ['insights'] },
  private: false,
  createdAt: '2026-10-18T10:00:00Z',
  updatedAt: '2026-10-19T10:00:00Z',
};

/** The quake's dossier, for the focus a restore selects. */
export const quakeDossier = {
  ref: 'record:usgs-earthquakes/nc1',
  generatedAt: '2026-10-20T12:00:00Z',
  envelope: {
    ref: 'record:usgs-earthquakes/nc1',
    type: 'record',
    title: 'M 2.5 - The Geysers',
    geometry: { type: 'Point', coordinates: [-122.8, 38.8] },
  },
  sections: { overview: { status: 'ok', fields: { kind: 'earthquake' } } },
};
