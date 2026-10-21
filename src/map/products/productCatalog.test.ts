import { boundProductLayers, MAX_PRODUCT_LAYERS, OVER_LIMIT_MESSAGE } from './productCatalog';

describe('the product layer bound (035)', () => {
  it('draws every layer up to the bound', () => {
    expect(boundProductLayers(['gfs', 'gfs:barbs'])).toEqual({
      drawn: ['gfs', 'gfs:barbs'],
      dropped: [],
    });
  });

  it('draws the top layers past the bound and names the rest', () => {
    const keys = ['mrms', 'gfs', 'gfs:barbs', 'aifs', 'aifs-t2m', 'goes'];
    expect(MAX_PRODUCT_LAYERS).toBe(4);
    expect(boundProductLayers(keys)).toEqual({
      drawn: ['gfs:barbs', 'aifs', 'aifs-t2m', 'goes'],
      dropped: ['mrms', 'gfs'],
    });
    expect(OVER_LIMIT_MESSAGE).toBe('Not drawn: at most 4 overlays are drawn at once.');
  });
});
