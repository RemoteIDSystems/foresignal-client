import type { ObjectEnvelope } from '../../objects/objectApi';
import type { Assessment, AssessmentBundle, CycleRun, PromptTemplate } from '../assessmentApi';
import { FINDING_ID } from './analyticsFixtures';
import { SITUATION_ID, situation } from './fixtures';

/** The assessment the 023 tests read. */
export const ASSESSMENT_ID = '01JA8Q00000000000000000030';

/** The run a re-run starts. */
export const RUN_ID = '01JA8Q00000000000000000031';

const AT = '2026-10-18T16:00:00Z';

/**
 * The situation's latest on-demand assessment: a mixed BLUF (one model-written judgment, one
 * deterministic), sections for the summary, what changed, risks and hypotheses, and no outlook.
 */
export const assessment: Assessment = {
  id: ASSESSMENT_ID,
  ref: `assessment:${ASSESSMENT_ID}`,
  situationId: SITUATION_ID,
  cadence: 'on-demand',
  periodStart: '2026-10-11T16:00:00Z',
  periodEnd: AT,
  status: 'ok',
  headline: 'The swarm is most likely induced by injection.',
  bluf: [
    {
      id: 'kj-1',
      text: 'The swarm is most likely induced by geothermal injection.',
      probability: 0.72,
      estimativeTerm: 'likely',
      confidence: 'moderate',
      confidenceStatement: 'Injection logs are incomplete for September.',
      citations: [`finding:${FINDING_ID}`],
      textOrigin: 'llm',
      change: { previousProbability: 0.66, explanation: 'Injection volumes rose.' },
    },
    {
      id: 'kj-2',
      text: 'Eleven earthquakes above M 3 were recorded this week.',
      citations: ['record:usgs-earthquakes/nc75095651'],
      textOrigin: 'deterministic',
    },
  ],
  sections: [
    {
      key: 'bluf',
      title: 'Bottom line',
      markdown:
        'The swarm continues **at a raised rate**. See [the finding](finding:' + FINDING_ID + ').',
      textOrigin: 'llm',
    },
    {
      key: 'what-changed',
      title: 'What changed',
      markdown: '- Daily counts rose from 2 to 9\n- A power outage near Santa Rosa',
      textOrigin: 'deterministic',
    },
    {
      key: 'risks',
      title: 'Risks',
      markdown: 'A larger earthquake cannot be ruled out.',
      textOrigin: 'llm',
    },
    {
      key: 'hypotheses',
      title: 'Hypotheses',
      markdown: '| Hypothesis | Probability |\n| --- | --- |\n| Injection | 72% |',
      textOrigin: 'deterministic',
    },
  ],
  model: 'claude-opus-5-5',
  effort: 'medium',
  promptTemplates: [{ id: 'situation-analyst', version: '3' }],
  citations: [`finding:${FINDING_ID}`, 'record:usgs-earthquakes/nc75095651'],
  lintWarnings: [],
  footer: 'Automated analysis; verify before acting.',
  private: false,
  createdAt: AT,
};

/** A newer assessment, as a re-run produces. */
export const newerAssessment: Assessment = {
  ...assessment,
  id: '01JA8Q00000000000000000032',
  createdAt: '2026-10-18T17:00:00Z',
  headline: 'Unchanged.',
};

/** The assessment's bundle: its two cited objects with their envelopes. */
export const bundle: AssessmentBundle = {
  assessment,
  generatedAt: AT,
  objects: [
    {
      ref: `finding:${FINDING_ID}`,
      envelope: {
        ref: `finding:${FINDING_ID}`,
        type: 'finding',
        title: 'Earthquake count rose in Northern California',
        actions: [],
      },
    },
    {
      ref: 'record:usgs-earthquakes/nc75095651',
      envelope: {
        ref: 'record:usgs-earthquakes/nc75095651',
        type: 'record',
        title: 'M 4.6 - 10 km NE of The Geysers',
        actions: [],
      },
    },
  ],
};

/** The situation's envelope, offering an on-demand assessment. */
export const situationEnvelope: ObjectEnvelope = {
  ref: `situation:${SITUATION_ID}`,
  type: 'situation',
  title: situation.title,
  actions: [
    {
      id: 'assess',
      method: 'POST',
      href: `/v1/situations/${SITUATION_ID}/assessment`,
      scope: 'agent',
    },
  ],
};

/** The re-run at a status. */
export const run = (status: CycleRun['status']): CycleRun => ({
  id: RUN_ID,
  situationId: SITUATION_ID,
  cadence: 'on-demand',
  trigger: 'situation',
  status,
  periodStart: '2026-10-11T17:00:00Z',
  periodEnd: '2026-10-18T17:00:00Z',
  ...(status === 'ok' && { assessmentId: newerAssessment.id }),
});

/** The analyst role's prompt template. */
export const template: PromptTemplate = {
  id: 'situation-analyst',
  version: '3',
  role: 'analyst',
  sha256: '0'.repeat(64),
  text: 'You are an intelligence analyst. Cite every judgment.',
};
