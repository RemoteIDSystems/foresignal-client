import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { FsError } from '../api/errors';
import { AccessNotice } from './AccessNotice';

const renderNotice = (error: unknown) =>
  render(
    <MemoryRouter>
      <AccessNotice error={error} />
    </MemoryRouter>,
  );

describe('AccessNotice', () => {
  it('offers sign-in on a 401', () => {
    renderNotice(new FsError({ status: 401, title: 'Unauthorized' }));
    expect(screen.getByTestId('access-notice')).toHaveTextContent('Sign in to do that.');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin');
  });

  it('names the required scope on INSUFFICIENT_SCOPE', () => {
    renderNotice(
      new FsError({
        status: 403,
        code: 'INSUFFICIENT_SCOPE',
        title: 'Forbidden',
        problem: {
          title: 'Forbidden',
          status: 403,
          code: 'INSUFFICIENT_SCOPE',
          requiredScope: 'agent',
        },
      }),
    );
    expect(screen.getByTestId('access-notice')).toHaveTextContent('“agent” scope');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the backend detail on PERMISSION_DENIED', () => {
    renderNotice(
      new FsError({
        status: 403,
        code: 'PERMISSION_DENIED',
        title: 'Denied',
        detail: 'You cannot manage sources.',
      }),
    );
    expect(screen.getByTestId('access-notice')).toHaveTextContent('You cannot manage sources.');
  });

  it('renders nothing for a non-access error', () => {
    const { container } = renderNotice(new FsError({ status: 500, title: 'boom' }));
    expect(container).toBeEmptyDOMElement();
  });
});
