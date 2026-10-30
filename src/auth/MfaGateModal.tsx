import { useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router';
import { useMe } from '../api/useMe';
import type { Session } from '../app/session';
import { Modal } from '../ui/Modal';

/**
 * The MFA-enrollment gate. When the backend has refused a write with `MFA_ENROLLMENT_REQUIRED`
 * (`session.mfaGate`), a signed-in user who has not enrolled is shown a blocking prompt that routes
 * them to the security settings, rather than the raw refusal. Reading stays available; the prompt
 * clears once MFA is enabled.
 */
export function MfaGateModal({ session }: { session: Session }) {
  const navigate = useNavigate();
  const required = useSyncExternalStore(session.mfaGate.subscribe, session.mfaGate.get);
  const me = useMe();
  const open = required && !!me && !me.user?.mfaEnabled;

  const goEnroll = () => navigate('/settings');

  return (
    <Modal open={open} title="Two-factor authentication required" onClose={goEnroll}>
      <p>
        Your role requires two-factor authentication before you can make changes. You can keep
        reading in the meantime.
      </p>
      <button type="button" onClick={goEnroll}>
        Go to security settings
      </button>
    </Modal>
  );
}
