import {
  createSituationAssessment,
  getAssessment,
  getAssessmentBundle,
  getCycleRun,
  getPromptTemplate,
  listSituationAssessments,
} from './assessmentApi';
import {
  assessment,
  ASSESSMENT_ID,
  bundle,
  run,
  RUN_ID,
  template,
} from './testing/assessmentFixtures';
import { SITUATION_ID } from './testing/fixtures';
import { json, standInApi } from './testing/standIn';

describe('the assessment reads and the re-run', () => {
  it('lists a situation’s assessments and reads one and its bundle as JSON', async () => {
    const { api, asked } = standInApi({
      [`GET /v1/situations/${SITUATION_ID}/assessments`]: () =>
        json({ items: [assessment], nextCursor: null }),
      [`GET /v1/assessments/${ASSESSMENT_ID}`]: () => json(assessment),
      [`GET /v1/assessments/${ASSESSMENT_ID}/bundle`]: () => json(bundle),
    });
    expect(await listSituationAssessments(api, SITUATION_ID)).toEqual([assessment]);
    expect((await getAssessment(api, ASSESSMENT_ID)).bluf).toHaveLength(2);
    expect((await getAssessmentBundle(api, ASSESSMENT_ID)).objects).toHaveLength(2);
    expect(asked).toEqual([
      `GET /v1/situations/${SITUATION_ID}/assessments?limit=20`,
      `GET /v1/assessments/${ASSESSMENT_ID}?format=json`,
      `GET /v1/assessments/${ASSESSMENT_ID}/bundle?format=json`,
    ]);
  });

  it('starts an on-demand assessment and reads its run', async () => {
    const { api, asked, bodies } = standInApi({
      [`POST /v1/situations/${SITUATION_ID}/assessment`]: () => json(run('queued'), 202),
      [`GET /v1/analysis/runs/${RUN_ID}`]: () => json(run('running')),
    });
    expect((await createSituationAssessment(api, SITUATION_ID)).status).toBe('queued');
    expect(bodies[0]).toEqual({});
    expect((await getCycleRun(api, RUN_ID)).status).toBe('running');
    expect(asked[1]).toBe(`GET /v1/analysis/runs/${RUN_ID}`);
  });

  it('reads a prompt template at its version, as JSON', async () => {
    let accept: string | null = null;
    const { api, asked } = standInApi({
      'GET /v1/prompt-templates/situation-analyst': (request) => {
        accept = request.headers.get('accept');
        return json(template);
      },
    });
    expect((await getPromptTemplate(api, 'situation-analyst', '3')).text).toContain('analyst');
    expect(asked).toEqual(['GET /v1/prompt-templates/situation-analyst?version=3']);
    expect(accept).toBe('application/json');
  });
});
