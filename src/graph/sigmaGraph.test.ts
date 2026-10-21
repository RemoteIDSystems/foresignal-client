// @vitest-environment node
import { darkTokens } from '../app/theme/tokens';
import { familyColors, groupColors, NO_FILTERS, toViewGraph } from './graphView';
import { buildDrawnGraph, layoutGraph } from './sigmaGraph';
import { graphResult, REFS } from './testing/graphFixtures';

const colors = { groups: groupColors(darkTokens), families: familyColors(darkTokens) };
const view = () =>
  toViewGraph(graphResult, [REFS.investigation, REFS.quake], NO_FILTERS, Date.now());

describe('the drawn graph', () => {
  it('carries each node’s title, type, group color and size, and each edge’s style', () => {
    const graph = buildDrawnGraph(view(), colors);
    expect(graph.order).toBe(6);
    expect(graph.size).toBe(5);
    expect(graph.getNodeAttributes(REFS.plant)).toMatchObject({
      label: 'Geysers Geothermal Plant',
      kind: 'facility',
      color: darkTokens.tone.orangeFg,
      seed: false,
    });
    expect(graph.getNodeAttribute(REFS.quake, 'seed')).toBe(true);
    expect(graph.getNodeAttribute(REFS.quake, 'size')).toBeGreaterThan(
      graph.getNodeAttribute(REFS.town, 'size'),
    );
    expect(graph.getEdgeAttributes('rel-2')).toMatchObject({
      type: 'arrow',
      relation: 'causes',
      color: darkTokens.color.textSecondary,
    });
    expect(graph.getEdgeAttributes('rel-5')).toMatchObject({
      type: 'line',
      color: darkTokens.tone.warningFg,
    });
    expect(graph.source('rel-5')).toBe(REFS.report);
  });

  it('lays the graph out to finite, distinct positions', () => {
    const graph = buildDrawnGraph(view(), colors);
    layoutGraph(graph);
    const points = graph.mapNodes((_, { x, y }) => `${x.toFixed(3)},${y.toFixed(3)}`);
    graph.forEachNode((_, { x, y }) => {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    });
    expect(new Set(points).size).toBe(6);
  });
});
