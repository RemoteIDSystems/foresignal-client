import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as mswHttp, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createSessionStore } from '../api/auth';
import { createForesignalClient } from '../api/client';
import { sessionToken } from '../api/testing/fixtures';
import { MOCK_BASE_URL, server } from '../api/testing/mock-server';
import type { Session } from '../app/session';
import { SignIn } from './SignIn';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

function fakeSession() {
  const sessions = createSessionStore();
  const api = createForesignalClient({
    baseUrl: MOCK_BASE_URL,
    getToken: () => sessions.get()?.token ?? null,
    retry: false,
  });
  return { api, sessions } as unknown as Session & {
    sessions: ReturnType<typeof createSessionStore>;
  };
}

/** A raw `login` handler reading the posted JSON body, which drives the response here. */
function loginHandler(handler: (body: Record<string, unknown>) => Response) {
  return mswHttp.post(`${MOCK_BASE_URL}/v1/auth/login`, async ({ request }) =>
    handler((await request.json()) as Record<string, unknown>),
  );
}

function renderSignIn(session: Session) {
  return render(
    <MemoryRouter initialEntries={['/signin']}>
      <Routes>
        <Route path="/signin" element={<SignIn session={session} />} />
        <Route path="/global" element={<div>GLOBAL</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SignIn', () => {
  it('reveals the MFA field when required and signs in once the code is entered', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      loginHandler((body) => {
        bodies.push(body);
        return body.mfaCode
          ? HttpResponse.json(sessionToken({ token: 'fss_ok' }), { status: 200 })
          : HttpResponse.json(sessionToken({ token: '', mfaRequired: true, expiresAt: null }), {
              status: 200,
            });
      }),
    );
    const session = fakeSession();
    const user = userEvent.setup();
    renderSignIn(session);

    await user.type(screen.getByLabelText('Email'), 'a@b.test');
    await user.type(screen.getByLabelText('Password'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const code = await screen.findByLabelText('Authentication code');
    await user.type(code, '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and sign in' }));

    await waitFor(() => expect(screen.getByText('GLOBAL')).toBeInTheDocument());
    expect(session.sessions.get()?.token).toBe('fss_ok');
    expect(bodies.at(-1)).toMatchObject({ email: 'a@b.test', password: 'pw', mfaCode: '123456' });
  });

  it('shows a mapped error for bad credentials and stays on the form', async () => {
    server.use(
      loginHandler(() =>
        HttpResponse.json(
          { title: 'No', status: 401, code: 'INVALID_CREDENTIALS' },
          { status: 401 },
        ),
      ),
    );
    const session = fakeSession();
    const user = userEvent.setup();
    renderSignIn(session);

    await user.type(screen.getByLabelText('Email'), 'a@b.test');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByTestId('signin-error')).toHaveTextContent(
      'Incorrect email or password.',
    );
    expect(session.sessions.get()).toBeNull();
    expect(screen.queryByText('GLOBAL')).not.toBeInTheDocument();
  });
});
