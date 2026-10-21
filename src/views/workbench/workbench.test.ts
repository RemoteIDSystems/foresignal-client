import { investigation, INVESTIGATION_ID } from '../../intel/testing/fixtures';
import { ANALYSIS_TABS } from '../analysis/frame';
import {
  commonRefs,
  investigationSeeds,
  WORKBENCH_TABS,
  WORKBENCH_TOOLS,
  workbenchPath,
} from './workbench';

describe('the workbench’s routes and seeds', () => {
  it('opens an investigation or situation on its own path, and anything else by ref', () => {
    expect(workbenchPath(`investigation:${INVESTIGATION_ID}`)).toBe(
      `/analyst/investigations/${INVESTIGATION_ID}`,
    );
    expect(workbenchPath('situation:01J')).toBe('/analyst/situations/01J');
    expect(workbenchPath('record:usgs/nc%2F1')).toBe('/analyst?ref=record%3Ausgs%2Fnc%252F1');
  });

  it('seeds an investigation’s graph with itself and its items’ objects, once each', () => {
    expect(investigationSeeds(investigation)).toEqual([
      `investigation:${INVESTIGATION_ID}`,
      'record:usgs-earthquakes/nc75095651@12',
    ]);
    const many = {
      ...investigation,
      items: Array.from({ length: 60 }, (_, i) => ({
        ...investigation.items![0]!,
        id: `item-${i}`,
        ref: `usgs/${i % 55}`,
        seq: null,
      })),
    };
    expect(investigationSeeds(many)).toHaveLength(50);
  });

  it('looks for common dependencies among the objects, not the situations or investigations', () => {
    expect(commonRefs(['investigation:1', 'situation:2', 'record:a/b', 'facility:3'])).toEqual([
      'record:a/b',
      'facility:3',
    ]);
    expect(commonRefs(Array.from({ length: 30 }, (_, i) => `facility:${i}`))).toHaveLength(20);
  });

  it('lists the mock’s analysis tools, the graph first', () => {
    expect(WORKBENCH_TOOLS.map((tool) => tool.label)).toEqual([
      'Evidence Graph',
      'Timeline',
      'Geospatial Analysis',
      'Entity Explorer',
      'Correlation Finder',
      'Pattern Search',
      'What Changed?',
      'Hypothesis Builder',
      'Forecasts',
      'Reports',
    ]);
    expect(WORKBENCH_TOOLS[0]?.current).toBe(true);
  });

  it('lists the mock’s top tabs, each opening a full-analysis tab that exists', () => {
    expect(WORKBENCH_TABS.map((tab) => tab.label)).toEqual([
      'Evidence Graph',
      'Timeline',
      'Map',
      'Hypotheses',
      'Key Findings',
      'Forecasts',
      'Related',
      'Documents',
      'Analyst Notes',
    ]);
    for (const { tab } of WORKBENCH_TABS) {
      if (tab) expect(ANALYSIS_TABS).toContain(tab);
    }
    expect(WORKBENCH_TABS.filter((tab) => tab.current).map((tab) => tab.label)).toEqual([
      'Evidence Graph',
    ]);
    expect(WORKBENCH_TABS.find((tab) => tab.label === 'Analyst Notes')?.notes).toBe(true);
  });
});
