import { describe, expect, it } from 'vitest';
import { RELATION_TYPES } from './graphApi';
import { edgeFamily } from './graphView';

describe('ownership relation edges (R2-011)', () => {
  it('surfaces the five ownership edges in the relation filter list', () => {
    for (const type of ['owns', 'controls', 'officer-of', 'beneficial-owner', 'affiliated-with']) {
      expect(RELATION_TYPES).toContain(type);
    }
  });

  it('maps the ownership edges to the ownership family', () => {
    expect(edgeFamily('owns')).toBe('ownership');
    expect(edgeFamily('controls')).toBe('ownership');
    expect(edgeFamily('officer-of')).toBe('ownership');
    expect(edgeFamily('beneficial-owner')).toBe('ownership');
    expect(edgeFamily('affiliated-with')).toBe('ownership');
  });

  it('renders an unlisted (x-extensible-enum) wire type as a generic related edge', () => {
    expect(edgeFamily('some-future-edge' as never)).toBe('related');
    expect(edgeFamily(undefined)).toBe('related');
  });
});
