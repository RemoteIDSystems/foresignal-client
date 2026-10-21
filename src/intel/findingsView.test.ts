import { itemRef, itemTitle } from './analysisView';
import {
  corroborationTone,
  evidenceGroup,
  findingTone,
  itemEvidence,
  MAX_LINES,
  memberEvidence,
  metricTabs,
  percentText,
  rateFor,
  seriesName,
  statTile,
} from './findingsView';
import {
  impact,
  rate,
  regionSeries,
  series,
  seriesData,
  thinRate,
} from './testing/analyticsFixtures';
import { eventMember, investigation, member } from './testing/fixtures';

describe('the evidence rows', () => {
  it('puts imagery, documents, derived objects and other records in their tabs', () => {
    expect(evidenceGroup('satellite-scene', false)).toBe('imagery');
    expect(evidenceGroup('news-article', false)).toBe('docs');
    expect(evidenceGroup(null, true)).toBe('reports');
    expect(evidenceGroup('earthquake', false)).toBe('signals');
  });

  it('lists a situation’s members newest first, with their confidence and object', () => {
    const rows = memberEvidence([member, eventMember]);
    expect(rows.map((row) => row.title)).toEqual([eventMember.title, member.title]);
    expect(rows[0]).toMatchObject({ group: 'reports', confidence: 'uncorroborated' });
    expect(rows[1]).toMatchObject({
      group: 'signals',
      confidence: 'corroborated',
      ref: 'record:usgs-earthquakes/nc75095651',
      detail: '2026-10-18 14:12Z',
    });
    expect(rows[1]!.tags).toHaveLength(3);
  });

  it('lists an investigation’s items without its notes', () => {
    const rows = itemEvidence(investigation.items ?? [], itemRef, itemTitle);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.group).toBe('signals');
  });
});

describe('the corroboration tag', () => {
  it('keeps the backend’s word and tones it', () => {
    expect(corroborationTone('corroborated')).toBe('success');
    expect(corroborationTone('uncorroborated')).toBe('danger');
    expect(corroborationTone('unknown')).toBe('warning');
  });
});

describe('the findings and impacts', () => {
  it('tones a finding by its severity', () => {
    expect(findingTone('significant')).toBe('danger');
    expect(findingTone('notable')).toBe('warning');
    expect(findingTone('info')).toBe('info');
  });

  it('writes probabilities as whole percents', () => {
    expect(percentText(0.153)).toBe('15%');
    expect(percentText(null)).toBe('—');
  });

  it('finds the historical rate of an impact’s hazard, family and region class', () => {
    expect(rateFor(impact, [thinRate, rate])).toBe(rate);
    expect(rateFor({ ...impact, regionClass: 'admin1:inland' }, [rate])).toBeUndefined();
  });
});

describe('the metrics', () => {
  it('groups the series by family, the situation’s own families first, four lines at most', () => {
    expect(metricTabs(regionSeries, ['seismic', 'outage']).map((tab) => tab.family)).toEqual([
      'seismic',
      'outage',
    ]);
    expect(metricTabs(regionSeries).map((tab) => tab.family)).toEqual(['outage', 'seismic']);
    expect(metricTabs(regionSeries)[1]!.series).toHaveLength(2);
    const many = Array.from({ length: 6 }, (_, i) => series(`series:src/s${i}`, null));
    expect(metricTabs(many)).toEqual([
      expect.objectContaining({ family: 'other', series: many.slice(0, MAX_LINES) }),
    ]);
  });

  it('names a rollup by its kind and another series by its last part', () => {
    expect(seriesName('rollup:day/*/power-outage/US-CA')).toBe('Power Outage');
    expect(seriesName('series:eia-930/demand')).toBe('Demand');
  });

  it('totals the latest 30 days and compares them with the 30 before', () => {
    const ref = 'rollup:day/*/earthquake/US-CA';
    expect(statTile(seriesData(ref, 2, 1), 30)).toEqual({
      name: 'Earthquake',
      value: 60,
      unit: 'events',
      delta: 100,
    });
    expect(statTile(seriesData(ref, 3, 0), 30)).toEqual({
      name: 'Earthquake',
      value: 90,
      unit: 'events',
    });
  });
});
