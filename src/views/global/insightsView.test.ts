// @vitest-environment node
import { Bell, CircleDot, Plane } from 'lucide-react';
import type { ActivityItem, InsightItem } from '../../state/contextSummary';
import {
  ALL_SOURCES,
  activityLook,
  activityTime,
  familiesOf,
  familyLabel,
  filterActivity,
  insightBasis,
  insightsFor,
  percent,
  termTag,
} from './insightsView';

const item = (
  signalFamily: string | null,
  type: ActivityItem['type'] = 'record',
): ActivityItem => ({
  at: '2026-10-20T14:31:09Z',
  ref: `record:x/${signalFamily}`,
  type,
  title: 't',
  signalFamily,
});

describe('the activity rows', () => {
  it('look by family, sharing a look across one family’s kinds, or by type without one', () => {
    expect(activityLook(item('aviation-military')).icon).toBe(Plane);
    expect(activityLook(item('aviation-ops')).icon).toBe(Plane);
    expect(activityLook(item('something-new')).icon).toBe(CircleDot);
    expect(activityLook(item(null, 'alert')).icon).toBe(Bell);
  });

  it('name the family in words, and filter by it', () => {
    expect(familyLabel(item('weather-severe'))).toBe('Weather Severe');
    expect(familyLabel(item(null, 'situation-change'))).toBe('Situation Change');
    const feed = [item('seismic'), item('fire'), item('seismic')];
    expect(familiesOf(feed)).toEqual(['Seismic', 'Fire']);
    expect(filterActivity(feed, 'Fire')).toHaveLength(1);
    expect(filterActivity(feed, ALL_SOURCES)).toHaveLength(3);
  });

  it('show hours and minutes in UTC', () => {
    expect(activityTime('2026-10-20T14:31:09+02:00')).toBe('12:31');
    expect(activityTime('not a time')).toBe('—');
  });
});

describe('the insight rows', () => {
  const insight: InsightItem = {
    ref: 'question:7',
    kind: 'forecast',
    title: 'Port closures within 48 hours',
    probability: 0.684,
    estimativeTerm: 'likely',
    issuer: 'foresignal-ensemble',
    baseRate: 0.78,
    knowledgeCutoff: '2026-10-19',
    textOrigin: 'llm',
  };

  it('list one kind per tab', () => {
    const all = [insight, { ...insight, ref: 'finding:1', kind: 'finding' as const }];
    expect(insightsFor(all, 'forecasts').map((one) => one.ref)).toEqual(['question:7']);
    expect(insightsFor(all, 'detections').map((one) => one.ref)).toEqual(['finding:1']);
    expect(insightsFor(all, 'hypotheses')).toEqual([]);
  });

  it('say what they rest on, as far as the backend gives it', () => {
    expect(insightBasis(insight)).toBe(
      'Issued by ForeSignal ensemble · base rate 78% · knowledge to 2026-10-19 · text written by a language model',
    );
    expect(insightBasis({ ref: 'f:1', kind: 'finding', title: 't' })).toBe('');
  });

  it('show the probability as a percent and the ICD term as a toned tag', () => {
    expect(percent(0.684)).toBe('68%');
    expect(termTag('likely')).toEqual({ label: 'Likely', tone: 'teal' });
    expect(termTag('roughly even chance')?.tone).toBe('warning');
    expect(termTag('very unlikely')?.tone).toBe('info');
    expect(termTag(null)).toBeUndefined();
  });
});
