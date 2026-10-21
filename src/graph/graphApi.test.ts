import { json, standInApi } from '../intel/testing/standIn';
import { findCommonDependencies, queryGraph } from './graphApi';
import { commonDependencies, graphResult, REFS } from './testing/graphFixtures';

describe('the graph reads', () => {
  it('asks for the subgraph at depth 1 and the backend’s most edges by default, at most 50 seeds', async () => {
    const { api, asked, bodies } = standInApi({ 'POST /v1/graph': () => json(graphResult) });
    const seeds = Array.from({ length: 60 }, (_, i) => `record:src/${i}`);
    expect(await queryGraph(api, { refs: seeds })).toEqual(graphResult);
    expect(asked).toEqual(['POST /v1/graph']);
    const body = bodies[0] as { refs: string[]; depth: number; limit: number };
    expect(body.refs).toHaveLength(50);
    expect(body).toMatchObject({ depth: 1, limit: 2000 });
  });

  it('passes the depth and relation types through', async () => {
    const { api, bodies } = standInApi({ 'POST /v1/graph': () => json(graphResult) });
    await queryGraph(api, { refs: [REFS.quake], depth: 2, types: ['causes'] });
    expect(bodies[0]).toEqual({ refs: [REFS.quake], depth: 2, limit: 2000, types: ['causes'] });
  });

  it('asks for the common dependencies of at most 20 objects', async () => {
    const { api, asked, bodies } = standInApi({
      'POST /v1/graph/common-dependencies': () => json(commonDependencies),
    });
    const refs = Array.from({ length: 25 }, (_, i) => `record:src/${i}`);
    expect(await findCommonDependencies(api, refs)).toEqual(commonDependencies);
    expect(asked).toEqual(['POST /v1/graph/common-dependencies']);
    expect((bodies[0] as { refs: string[] }).refs).toHaveLength(20);
    expect(bodies[0]).not.toHaveProperty('asOf');
  });
});
