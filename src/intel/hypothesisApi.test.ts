import {
  addHypothesis,
  getAchMatrix,
  getHypothesisSet,
  getInformationValue,
  listHypothesisSets,
  listIndicators,
} from './hypothesisApi';
import {
  hypothesisSet,
  indicators,
  informationValue,
  injection,
  matrix,
  SET_ID,
} from './testing/hypothesisFixtures';
import { SITUATION_ID } from './testing/fixtures';
import { json, standInApi } from './testing/standIn';

/** The query of an asked request, as search parameters. */
const query = (asked: string) => new URL(`http://api.test${asked.split(' ')[1]}`).searchParams;

describe('the hypothesis reads and additions', () => {
  it('lists a situation’s sets and a set’s indicators', async () => {
    const { api, asked } = standInApi({
      'GET /v1/hypotheses/sets': () => json({ items: [hypothesisSet], nextCursor: null }),
      'GET /v1/indicators': () => json({ items: indicators, nextCursor: null }),
    });
    expect(await listHypothesisSets(api, { situationId: SITUATION_ID })).toEqual([hypothesisSet]);
    expect(query(asked[0]!).get('situationId')).toBe(SITUATION_ID);
    expect(query(asked[0]!).get('limit')).toBe('500');
    expect(await listIndicators(api, { setId: SET_ID })).toHaveLength(4);
    expect(query(asked[1]!).get('setId')).toBe(SET_ID);
  });

  it('reads a set, its matrix and its information value', async () => {
    const { api, asked } = standInApi({
      [`GET /v1/hypotheses/sets/${SET_ID}`]: () => json(hypothesisSet),
      [`GET /v1/hypotheses/sets/${SET_ID}/matrix`]: () => json(matrix),
      [`GET /v1/hypotheses/sets/${SET_ID}/information-value`]: () => json(informationValue),
    });
    expect((await getHypothesisSet(api, SET_ID)).question).toBe(hypothesisSet.question);
    expect((await getAchMatrix(api, SET_ID)).leastInconsistentHypothesisId).toBe(injection.id);
    expect((await getInformationValue(api, SET_ID)).entropy).toBe(0.8);
    expect(asked).toEqual([
      `GET /v1/hypotheses/sets/${SET_ID}`,
      `GET /v1/hypotheses/sets/${SET_ID}/matrix`,
      `GET /v1/hypotheses/sets/${SET_ID}/information-value`,
    ]);
  });

  it('adds a hypothesis with its prior and basis', async () => {
    const { api, asked, bodies } = standInApi({
      [`POST /v1/hypotheses/sets/${SET_ID}/hypotheses`]: () => json(injection, 201),
    });
    const input = {
      label: 'Fluid migration',
      statement: 'Natural fluids moving at depth.',
      type: 'outcome' as const,
      prior: 0.1,
      priorBasis: { type: 'operator' as const, rationale: null },
    };
    expect(await addHypothesis(api, SET_ID, input)).toEqual(injection);
    expect(asked).toEqual([`POST /v1/hypotheses/sets/${SET_ID}/hypotheses`]);
    expect(bodies[0]).toEqual(input);
  });
});
