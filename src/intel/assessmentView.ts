import type { Assessment, AssessmentSection, CycleRun, KeyJudgment } from './assessmentApi';

/** A tab of the AI Analysis panel and the assessment sections it shows. */
export interface AiTab {
  key: string;
  label: string;
  sections: readonly AssessmentSection['key'][];
}

/**
 * The AI Analysis tabs, as the Conflict mock names them, with the sections each shows; More holds
 * the sections the mock has no tab for. Analyst Notes shows the analysts' annotations, not a section.
 */
export const AI_TABS: readonly AiTab[] = [
  { key: 'summary', label: 'Executive Summary', sections: ['bluf'] },
  { key: 'insights', label: 'Key Insights', sections: ['key-insights'] },
  { key: 'changed', label: 'What Changed', sections: ['what-changed'] },
  { key: 'outlook', label: 'Outlook', sections: ['outlook'] },
  { key: 'risks', label: 'Risks', sections: ['risks'] },
  { key: 'notes', label: 'Analyst Notes', sections: [] },
  {
    key: 'more',
    label: 'More',
    sections: [
      'situations',
      'hypotheses',
      'indicators',
      'forecasts',
      'speculation',
      'sources',
      'collection-gaps',
      'social',
    ],
  },
];

/** The sections of an assessment a tab shows, in the assessment's order. */
export function tabSections(assessment: Assessment, tab: AiTab): AssessmentSection[] {
  return assessment.sections.filter((section) => tab.sections.includes(section.key));
}

/**
 * Who wrote an assessment, from its sections' and judgments' text origins, as the backend words
 * them: `llm` when all of it is model-written, `deterministic` when none is, `mixed` otherwise.
 */
export function assessmentOrigin(assessment: Assessment): 'llm' | 'deterministic' | 'mixed' {
  const origins = new Set<string>([
    ...assessment.sections.map((section) => section.textOrigin),
    ...assessment.bluf.map((judgment) => judgment.textOrigin),
  ]);
  if (origins.size === 0) return 'deterministic';
  if (origins.size === 1 && origins.has('llm')) return 'llm';
  if (origins.size === 1 && origins.has('deterministic')) return 'deterministic';
  return 'mixed';
}

/** Whether a run is over (it was accepted and has since finished, well or badly). */
export function runFinished(run: CycleRun): boolean {
  return run.status !== 'queued' && run.status !== 'running';
}

/** A key judgment's likelihood: its percent and ICD-203 term as the backend gives them. */
export function likelihoodText(judgment: KeyJudgment): string | undefined {
  const parts = [
    typeof judgment.probability === 'number'
      ? `${Math.round(judgment.probability * 100)}%`
      : undefined,
    judgment.estimativeTerm ?? undefined,
  ].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
