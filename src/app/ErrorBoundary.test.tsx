import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary', () => {
  it('shows a fallback with the error and recovers on retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail = true;
    const Flaky = () => {
      if (fail) throw new Error('render failed');
      return <p>recovered</p>;
    };
    render(
      <ErrorBoundary label="Global view">
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Global view hit an error');
    expect(screen.getByRole('alert')).toHaveTextContent('render failed');
    fail = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByText('recovered')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
