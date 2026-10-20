import { evidenceScope } from './useEvidence';
import { FINDING_ID } from './testing/analyticsFixtures';
import { investigation, situation, SITUATION_ID } from './testing/fixtures';

describe('the evidence scope', () => {
  it('reads a situation’s findings, and its regions since it started', () => {
    expect(evidenceScope({ kind: 'situation', situation, members: [], timeline: [] })).toEqual({
      situationId: SITUATION_ID,
      regions: ['US-CA'],
      since: situation.startedAt,
      findingIds: [],
    });
  });

  it('reads the findings an investigation pins, and no regions', () => {
    const pinned = {
      ...investigation.items![0]!,
      id: 'item-3',
      itemType: 'object' as const,
      ref: `finding:${FINDING_ID}`,
      objectRef: `finding:${FINDING_ID}`,
    };
    expect(
      evidenceScope({
        kind: 'investigation',
        investigation: { ...investigation, items: [...investigation.items!, pinned, pinned] },
      }),
    ).toEqual({ regions: [], findingIds: [FINDING_ID] });
  });
});
