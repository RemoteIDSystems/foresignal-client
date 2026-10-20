import type { ObjectEnvelope } from '../../objects/objectApi';
import type { IntelligenceEvent, Investigation } from '../investigationApi';
import type {
  Situation,
  SituationChanges,
  SituationMember,
  SituationSummary,
  SituationTimelineEntry,
} from '../situationApi';

/** Stand-in data for the situation and investigation views' tests and e2e specs (019). */

export const SITUATION_ID = '01JA8Q0000000000000000000A';
export const INVESTIGATION_ID = '01JA8Q0000000000000000000B';

export const member: SituationMember = {
  id: '01JA8Q0000000000000000000C',
  situationId: SITUATION_ID,
  memberType: 'record',
  ref: 'usgs-earthquakes/nc75095651',
  objectRef: 'record:usgs-earthquakes/nc75095651',
  kind: 'earthquake',
  signalFamily: 'seismic',
  title: 'M 4.6 - 10 km NE of The Geysers',
  severity: 'warning',
  observedAt: '2026-10-18T14:12:00Z',
  role: 'core',
  corroboration: 'corroborated',
  addedAt: '2026-10-18T14:13:00Z',
  addedBy: 'linker',
};

export const eventMember: SituationMember = {
  ...member,
  id: '01JA8Q0000000000000000000D',
  memberType: 'intel_event',
  ref: '01JA8Q0000000000000000000E',
  objectRef: 'intel-event:01JA8Q0000000000000000000E',
  kind: null,
  signalFamily: 'outage',
  title: 'Power outage near Santa Rosa',
  role: 'context',
  corroboration: 'uncorroborated',
  observedAt: '2026-10-18T15:00:00Z',
};

export const situation: Situation = {
  id: SITUATION_ID,
  title: 'Northern California Seismic Swarm',
  theme: 'infrastructure',
  status: 'active',
  severity: 'warning',
  regionCodes: ['US-CA'],
  bbox: [-123.2, 38.4, -122.4, 39.0],
  centroid: { type: 'Point', coordinates: [-122.8, 38.7] },
  startedAt: '2026-10-01T06:00:00Z',
  lastActivityAt: '2026-10-18T15:00:00Z',
  memberCount: 2,
  signalFamilies: ['seismic', 'outage'],
  corroborationShare: 0.72,
  summary: 'A swarm of earthquakes near The Geysers with a nearby power outage.',
  origin: 'auto',
  private: false,
  version: 4,
  updatedAt: '2026-10-18T15:01:00Z',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-123.2, 38.4],
        [-122.4, 38.4],
        [-122.4, 39.0],
        [-123.2, 39.0],
        [-123.2, 38.4],
      ],
    ],
  },
  createdAt: '2026-10-01T06:00:00Z',
  evidence: {
    memberCounts: { byType: { record: 1, intel_event: 1 }, byFamily: { seismic: 1, outage: 1 } },
    families: [
      { family: 'seismic', count: 1, coreCount: 1, members: [member] },
      { family: 'outage', count: 1, coreCount: 0, members: [eventMember] },
    ],
    corroboration: { corroborated: 1, uncorroborated: 1, share: 0.5 },
  },
  inference: {
    summary: 'Two signal families over 17 days; seismic activity drives the status.',
    statusBasis: 'A core member was observed within the last 24 hours.',
    severityBasis: 'The strongest core member is a warning.',
  },
  speculation: { label: 'speculation', brief: null },
};

export const situationSummary: SituationSummary = {
  id: situation.id,
  title: situation.title,
  theme: situation.theme,
  status: situation.status,
  severity: situation.severity,
  regionCodes: situation.regionCodes,
  bbox: situation.bbox,
  startedAt: situation.startedAt,
  lastActivityAt: situation.lastActivityAt,
  memberCount: situation.memberCount,
  signalFamilies: situation.signalFamilies,
  corroborationShare: situation.corroborationShare,
  summary: situation.summary,
  origin: situation.origin,
  private: false,
  version: situation.version,
};

export const timeline: SituationTimelineEntry[] = [
  {
    at: '2026-10-01T06:00:00Z',
    entryType: 'log',
    action: 'created',
    after: { status: 'emerging' },
  },
  { at: member.observedAt!, entryType: 'member', member },
  { at: eventMember.observedAt!, entryType: 'member', member: eventMember },
];

export const changes: SituationChanges = {
  situationId: SITUATION_ID,
  since: '2026-09-20T00:00:00Z',
  baselineDay: '2026-09-20',
  now: '2026-10-20T12:00:00Z',
  status: { before: 'emerging', after: 'active', changed: true },
  severity: { before: 'warning', after: 'warning', changed: false },
  newMembers: { total: 2, byFamily: { seismic: 1, outage: 1 } },
  area: { beforeKm2: 1200, afterKm2: 1512, deltaKm2: 312 },
  regionsAdded: ['US-CA'],
  regionsRemoved: [],
};

export const investigation: Investigation = {
  id: INVESTIGATION_ID,
  displayId: 'INV-2026-0001',
  title: 'Tropical Storm Florence',
  status: 'active',
  summary: 'Track landfall and coastal impacts.',
  tags: ['weather'],
  itemCount: 2,
  items: [
    {
      id: 'item-1',
      itemType: 'record',
      ref: 'usgs-earthquakes/nc75095651',
      seq: 12,
      snapshot: {
        title: 'M 4.6 - 10 km NE of The Geysers',
        kind: 'earthquake',
        geometry: { type: 'Point', coordinates: [-122.8, 38.8] },
      },
      note: 'Strongest of the swarm',
      addedAt: '2026-10-18T14:20:00Z',
      addedBy: 'analyst',
    },
    {
      id: 'item-2',
      itemType: 'note',
      ref: 'note-1',
      note: 'Check the grid operator’s statement',
      addedAt: '2026-10-18T16:00:00Z',
      addedBy: 'analyst',
    },
  ],
  createdBy: 'analyst',
  createdAt: '2026-10-18T14:00:00Z',
  updatedAt: '2026-10-18T16:00:00Z',
  tlp: 'AMBER',
};

/** The investigation's envelope, offering to add and remove items. */
export const investigationEnvelope: ObjectEnvelope = {
  ref: `investigation:${INVESTIGATION_ID}`,
  type: 'investigation',
  title: investigation.title,
  actions: [
    {
      id: 'add-item',
      method: 'POST',
      href: `/v1/investigations/${INVESTIGATION_ID}/items`,
      scope: 'agent',
    },
    {
      id: 'remove-item',
      method: 'DELETE',
      href: `/v1/investigations/${INVESTIGATION_ID}/items/{itemId}`,
      scope: 'agent',
    },
  ],
};

/** The intelligence event the context member refers to. */
export const intelEvent: IntelligenceEvent = {
  id: eventMember.ref,
  type: 'infrastructure-disruption',
  title: 'Power outage near Santa Rosa',
  status: 'active',
  severity: 'warning',
  origin: 'recipe',
  detector: { name: 'outage-recipe', version: '1' },
  version: 1,
  createdAt: '2026-10-18T15:00:00Z',
  updatedAt: '2026-10-18T15:05:00Z',
  evidence: {
    memberCount: 1,
    members: [
      {
        id: 'm-1',
        role: 'supporting',
        memberType: 'record',
        sourceId: 'usgs-earthquakes',
        externalId: 'nc75095651',
        kind: 'earthquake',
        addedAt: '2026-10-18T15:00:00Z',
        addedBy: 'recipe',
      },
    ],
  },
  inference: {
    confidence: 0.64,
    confidenceLabel: 'moderate',
    confidenceMethod: 'recipe',
    calibrated: false,
    evidenceQuality: 'moderate',
    startTime: '2026-10-18T15:00:00Z',
    explanation: 'Outage reports cluster within 20 km of the strongest earthquake.',
  },
  speculation: { label: 'speculation', alternatives: [] },
};
