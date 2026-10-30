import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createForesignalClient } from '../api/client';
import type { Me, PrincipalStore } from '../api/me';
import { PrincipalStoreContext } from '../api/useMe';
import { me as meFixture } from '../api/testing/fixtures';
import { http, MOCK_BASE_URL, server } from '../api/testing/mock-server';
import type { Session } from '../app/session';
import { createMfaGate } from './mfa';
import { MfaSection } from './MfaSection';

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** A principal store fixed at the given identity (useMe reads this via context). */
function principalStore(value: Me | null): PrincipalStore {
  return { get: () => value, subscribe: () => () => {}, load: async () => {}, clear: () => {} };
}

function renderSection(value: Me | null) {
  const principal = principalStore(value);
  const session = {
    api: createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false }),
    principal,
    mfaGate: createMfaGate(),
  } as unknown as Session;
  render(
    <PrincipalStoreContext.Provider value={principal}>
      <MfaSection session={session} />
    </PrincipalStoreContext.Provider>,
  );
}

describe('MfaSection', () => {
  it('renders nothing when anonymous', () => {
    const { container } = render(
      <PrincipalStoreContext.Provider value={principalStore(null)}>
        <MfaSection
          session={
            { api: createForesignalClient({ baseUrl: MOCK_BASE_URL, retry: false }) } as Session
          }
        />
      </PrincipalStoreContext.Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('enrolls, shows the QR and secret, then verifies and shows recovery codes', async () => {
    server.use(
      http.post('/v1/me/mfa/enroll', ({ response }) =>
        response(200).json({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUri: 'otpauth://totp/ForeSignal:a@b.test?secret=JBSWY3DPEHPK3PXP',
          qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
        }),
      ),
      http.post('/v1/me/mfa/verify', ({ response }) =>
        response(200).json({
          enabled: true,
          required: false,
          enrolledAt: '2026-10-29T00:00:00Z',
          recoveryCodes: {
            codes: ['aaaaa-bbbbb', 'ccccc-ddddd'],
            generatedAt: '2026-10-29T00:00:00Z',
          },
        }),
      ),
    );
    const user = userEvent.setup();
    renderSection(meFixture());
    expect(screen.getByTestId('mfa-state')).toHaveTextContent('Off');

    await user.click(screen.getByRole('button', { name: 'Set up two-factor authentication' }));
    await screen.findByTestId('mfa-enroll');
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    expect(screen.getByAltText('QR code for your authenticator app')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and enable' }));

    await waitFor(() => expect(screen.getByTestId('mfa-recovery-codes')).toBeInTheDocument());
    expect(screen.getByText('aaaaa-bbbbb')).toBeInTheDocument();
    expect(screen.getByTestId('mfa-state')).toHaveTextContent('On');
  });

  it('shows the On state and a Disable control when already enrolled', () => {
    const enrolled = meFixture();
    enrolled.user = { ...enrolled.user!, mfaEnabled: true };
    renderSection(enrolled);
    expect(screen.getByTestId('mfa-state')).toHaveTextContent('On');
    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
  });
});
