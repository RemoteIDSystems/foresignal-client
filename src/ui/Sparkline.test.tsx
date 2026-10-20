import { render, screen } from '@testing-library/react';
import { Sparkline } from './Sparkline';
import { sparklinePoints } from './sparklinePoints';

describe('Sparkline', () => {
  it('spreads the values over the width, from zero to the largest', () => {
    expect(sparklinePoints([0, 5, 10], 20, 12)).toEqual([
      [0, 11],
      [10, 6],
      [20, 1],
    ]);
    expect(sparklinePoints([], 20, 12)).toEqual([]);
  });

  it('draws a labeled line with its last value marked', () => {
    render(<Sparkline values={[3, 9, 4]} label="Changes per hour" />);
    const chart = screen.getByRole('img', { name: 'Changes per hour' });
    expect(chart).toHaveAttribute('data-points', '3');
    expect(chart.querySelector('polyline')).not.toBeNull();
    expect(chart.querySelectorAll('circle')).toHaveLength(1);
  });
});
