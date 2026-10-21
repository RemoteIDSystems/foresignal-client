import { render, screen } from '@testing-library/react';
import { AnalysisRail } from './AnalysisRail';

describe('AnalysisRail', () => {
  it('marks one entry for the open tab, though Indicators opens Hypotheses too', () => {
    render(<AnalysisRail tab="hypotheses" onTab={() => {}} onHome={() => {}} />);
    expect(screen.getByRole('button', { name: 'Hypotheses' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Indicators' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Situations' })).not.toHaveAttribute('aria-current');
  });

  it('marks Situations on the list', () => {
    render(<AnalysisRail onHome={() => {}} atHome />);
    expect(screen.getByRole('button', { name: 'Situations' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });
});
