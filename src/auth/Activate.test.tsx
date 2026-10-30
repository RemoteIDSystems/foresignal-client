import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createForesignalClient } from '../api/client';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import type { Session } from '../app/session';
import { Activate } from './Activate';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const session = () =>
  ({ api: createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false }) }) as unknown as Session;

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/activate" element={<Activate session={session()} />} />
        <Route path="/signin" element={<div>SIGNIN</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Activate', () => {
  it('asks for the link when the token is missing', () => {
    renderAt('/activate');
    expect(screen.getByText('Activation link needed')).toBeInTheDocument();
  });

  it('sets the password and shows a path to sign in on success', async () => {
    let posted: Record<string, unknown> | undefined;
    server.use(
      http.post('/v1/auth/activate', async ({ request, response }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return response(204).empty();
      }),
    );
    const user = userEvent.setup();
    renderAt('/activate?token=abc');
    await user.type(screen.getByLabelText('New password'), 'hunter2hunter2');
    await user.type(screen.getByLabelText('Confirm password'), 'hunter2hunter2');
    await user.click(screen.getByRole('button', { name: 'Activate account' }));
    await waitFor(() => expect(screen.getByTestId('setpassword-done')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/signin');
    expect(posted).toEqual({ token: 'abc', password: 'hunter2hunter2' });
  });

  it('renders a recoverable error for an expired token, not a dead end', async () => {
    server.use(
      http.untyped.post(`${MOCK_BASE_URL}/v1/auth/activate`, () =>
        HttpResponse.json(
          { title: 'Gone', status: 410, code: 'ACTIVATION_TOKEN_GONE' },
          { status: 410 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderAt('/activate?token=stale');
    await user.type(screen.getByLabelText('New password'), 'hunter2hunter2');
    await user.type(screen.getByLabelText('Confirm password'), 'hunter2hunter2');
    await user.click(screen.getByRole('button', { name: 'Activate account' }));
    expect(await screen.findByTestId('setpassword-error')).toHaveTextContent(
      /expired or has already been used/,
    );
  });
});
