import {
  AI_TABS,
  assessmentOrigin,
  likelihoodText,
  runFinished,
  tabSections,
} from './assessmentView';
import { assessment, run } from './testing/assessmentFixtures';

describe('the AI Analysis view logic', () => {
  it('has the mock’s tabs, then More', () => {
    expect(AI_TABS.map((tab) => tab.label)).toEqual([
      'Executive Summary',
      'Key Insights',
      'What Changed',
      'Outlook',
      'Risks',
      'Analyst Notes',
      'More',
    ]);
  });

  it('gives each tab its sections', () => {
    const of = (key: string) =>
      tabSections(
        assessment,
        AI_TABS.find((tab) => tab.key === key)!,
      ).map((s) => s.key);
    expect(of('summary')).toEqual(['bluf']);
    expect(of('changed')).toEqual(['what-changed']);
    expect(of('outlook')).toEqual([]);
    expect(of('more')).toEqual(['hypotheses']);
  });

  it('names who wrote it, in the backend’s words', () => {
    expect(assessmentOrigin(assessment)).toBe('mixed');
    const only = (origin: 'llm' | 'deterministic') => ({
      ...assessment,
      bluf: [],
      sections: assessment.sections.map((s) => ({ ...s, textOrigin: origin })),
    });
    expect(assessmentOrigin(only('llm'))).toBe('llm');
    expect(assessmentOrigin(only('deterministic'))).toBe('deterministic');
    expect(assessmentOrigin({ ...assessment, bluf: [], sections: [] })).toBe('deterministic');
  });

  it('knows when a run is over', () => {
    expect(runFinished(run('queued'))).toBe(false);
    expect(runFinished(run('running'))).toBe(false);
    expect(runFinished(run('ok'))).toBe(true);
    expect(runFinished(run('failed'))).toBe(true);
  });

  it('writes a judgment’s likelihood as given', () => {
    expect(likelihoodText(assessment.bluf[0]!)).toBe('72% · likely');
    expect(likelihoodText(assessment.bluf[1]!)).toBeUndefined();
  });
});
